/* Python execution worker (Pyodide, runs inside the browser sandbox, never in the Node server).
   Protocol:
     main -> worker : { type: 'run', id, code }
     worker -> main : { type: 'status'|'stdout'|'stderr'|'image'|'done'|'fatal'|'pyerror', id, ... } */
'use strict';
const PYODIDE_BASE = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
// import name -> PyPI name, used only when a package is not part of the Pyodide distribution
const PIP_NAMES = { seaborn: 'seaborn', requests: 'requests', bs4: 'beautifulsoup4', sklearn: 'scikit-learn' };
let pyodide = null;
let booting = null;
let currentId = 0;
const post = (msg) => self.postMessage({ id: currentId, ...msg });

async function boot() {
  if (pyodide) return pyodide;
  if (!booting) {
    booting = (async () => {
      post({ type: 'status', text: 'Loading the Python runtime (first run downloads about 10 MB)…' });
      try { importScripts(PYODIDE_BASE + 'pyodide.js'); }
      catch (e) { throw Object.assign(new Error('The Python runtime could not be downloaded. Check the internet connection, or that cdn.jsdelivr.net is reachable, then try again.'), { fatal: true }); }
      pyodide = await self.loadPyodide({ indexURL: PYODIDE_BASE });
      pyodide.setStdout({ batched: (s) => post({ type: 'stdout', text: s + '\n' }) });
      pyodide.setStderr({ batched: (s) => post({ type: 'stderr', text: s + '\n' }) });
      await pyodide.runPythonAsync("import os\nos.environ['MPLBACKEND'] = 'AGG'");
      return pyodide;
    })().catch((e) => { booting = null; throw e; });
  }
  return booting;
}

function cleanTraceback(message) {
  const lines = String(message).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s+File "\/lib\/(python|pyodide)/.test(line) || /^\s+File "\/home\/pyodide\/.*(_pyodide|pyodide)/.test(line)) {
      while (i + 1 < lines.length && /^\s{4,}\S/.test(lines[i + 1]) && !/^\s+File /.test(lines[i + 1])) i++;
      continue;
    }
    out.push(line.replace('File "<exec>"', 'File "<editor>"'));
  }
  return out.join('\n').trim();
}

async function ensurePackages(py, code) {
  let names = [];
  try { names = py.pyodide_py.code.find_imports(code).toJs(); } catch (e) { return; } // syntax errors are reported by the run itself
  if (!names.length) return;
  post({ type: 'status', text: 'Loading required packages…' });
  await py.loadPackagesFromImports(code);
  const missing = names.filter((n) => !py.runPython(`import importlib.util\nimportlib.util.find_spec(${JSON.stringify(n)}) is not None`));
  const unavailable = [];
  for (const n of missing) {
    const pip = PIP_NAMES[n];
    if (!pip) { unavailable.push(n); continue; }
    try {
      await py.loadPackage('micropip');
      await py.pyimport('micropip').install(pip);
    } catch (e) { unavailable.push(n); }
  }
  if (unavailable.length) {
    throw Object.assign(new Error(`Not available in this browser runtime: ${unavailable.join(', ')}. Supported: the Python standard library, NumPy, pandas, SciPy, scikit-learn, Matplotlib, seaborn, SymPy, Beautiful Soup. Network libraries such as requests cannot reach external sites from the browser.`), { unsupported: true });
  }
}

async function collectFigures(py) {
  const script = `
import sys, io, base64
_out = []
if 'matplotlib.pyplot' in sys.modules:
    import matplotlib.pyplot as plt
    for _n in plt.get_fignums():
        _fig = plt.figure(_n)
        _buf = io.BytesIO()
        _fig.savefig(_buf, format='png', dpi=110, bbox_inches='tight')
        _out.append(base64.b64encode(_buf.getvalue()).decode())
        plt.close(_fig)
_out`;
  const proxy = await py.runPythonAsync(script);
  const images = proxy.toJs();
  proxy.destroy();
  return images;
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  if (msg.type !== 'run') return;
  currentId = msg.id;
  try {
    const py = await boot();
    await ensurePackages(py, msg.code);
    post({ type: 'status', text: 'Running…', running: true });
    const globals = py.globals.get('dict')();
    globals.set('__name__', '__main__');
    try { await py.runPythonAsync(msg.code, { globals }); }
    finally { globals.destroy(); }
    for (const b64 of await collectFigures(py)) post({ type: 'image', data: b64 });
    post({ type: 'done' });
  } catch (error) {
    if (error && error.fatal) post({ type: 'fatal', message: error.message });
    else if (error && error.unsupported) post({ type: 'pyerror', message: error.message, unsupported: true });
    else if (error && error.type && /Error|Exception|Exit/.test(String(error.type))) post({ type: 'pyerror', message: cleanTraceback(error.message) });
    else post({ type: 'pyerror', message: cleanTraceback(error && error.message ? error.message : String(error)) });
  }
};
