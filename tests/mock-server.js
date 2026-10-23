/* Dependency-free MOCK server for front-end testing only (no MongoDB needed).
   Serves the site and an in-memory /api. NOT a substitute for server.js.
   Usage: node tests/mock-server.js [port] [--guest] */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2]) || 3100;
const guest = process.argv.includes('--guest');
const svg = (c1, c2, t) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><text x="40" y="200" font-size="48" fill="#fff" font-family="sans-serif">${t}</text></svg>`);
const lesson = (n, h, kids = []) => ({ id: 'tp-' + n.replace(/\W/g, ''), heading: h, type: 'text', topicNumber: n, aim: `Aim of ${h}.`, syntax: 'df.head(n)', procedure: ['Import pandas', 'Load the data', 'Print the result'], code: 'print("Hello from ' + h + '")\nprint(sum(range(5)))', sampleOutput: 'Hello\n10', result: `${h} completed.`, order: 1, openAs: kids.length ? 'nested' : 'direct', subTopics: kids });
const tool = n => ({ name: n, description: 'Data science tool' });
let db = [
  { id: 'aaaaaaaaaaaaaaaaaaaaaaa1', number: '1', title: 'Python Basics', shortDescription: 'Variables, loops and functions.', longDescription: 'Learn the foundations of Python for data science.', cover: svg('#0b1730', '#0969f5', 'Python'), video: '', githubUrl: 'https://github.com/example/py', tools: [tool('Python'), tool('NumPy')], materials: [{ title: 'Material PDF', url: 'https://example.com/a.pdf' }],
    topics: [lesson('1.1', 'Variables'), lesson('1.2', 'Control Flow', [lesson('1.2.1', 'if / else'), lesson('1.2.2', 'Loops', [lesson('1.2.2.1', 'for loops')])])], d2Topics: [], subExperiments: [] },
  { id: 'aaaaaaaaaaaaaaaaaaaaaaa2', number: '2', title: 'Pandas DataFrames', shortDescription: 'Clean and analyse tabular data.', longDescription: 'Explore pandas with two sub-experiments.', cover: svg('#07152b', '#2588ff', 'Pandas'), video: '', githubUrl: '', tools: [tool('Pandas')], materials: [], topics: [], d2Topics: [],
    subExperiments: [
      { id: '2A', letter: 'A', title: 'Series', shortDescription: 'Working with Series.', longDescription: 'Series deep dive.', cover: svg('#0969f5', '#07152b', '2A'), video: '', githubUrl: 'https://github.com/example/series', tools: [tool('Pandas')], materials: [], d2Topics: [], topics: [lesson('2A.1', 'Creating a Series'), lesson('2A.2', 'Indexing', [lesson('2A.2.1', 'loc vs iloc')])], openAs: 'nested', completed: true },
      { id: '2B', letter: 'B', title: 'DataFrames', shortDescription: 'Working with DataFrames.', longDescription: 'No topic array; direct lesson content below.', cover: '', video: '', githubUrl: '', tools: [], materials: [], d2Topics: [], topics: [], aim: 'Build DataFrames', code: 'print(1+1)', openAs: 'direct', completed: true }] },
  { id: 'aaaaaaaaaaaaaaaaaaaaaaa3', number: '3', title: 'Visualisation', shortDescription: 'Matplotlib and Seaborn.', longDescription: '', cover: '', video: '', githubUrl: '', tools: [], materials: [], topics: [], d2Topics: [], subExperiments: [] },
  { id: 'aaaaaaaaaaaaaaaaaaaaaaa7', number: '7', title: 'Web Scraping Using Beautiful Soup', shortDescription: 'Extract product reviews and perform EDA.', longDescription: 'This experiment focuses on web scraping with Beautiful Soup, then EDA with NLTK and VADER.', cover: svg('#0969f5', '#07152b', '7'), video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', githubUrl: 'https://github.com/example/exp7', tools: [tool('Python'), tool('Pandas')], materials: [{ title: 'Exp 7 Material PDF', url: 'https://example.com/exp7.pdf' }], topics: [], d2Topics: [],
    subExperiments: [
      { id: '7A', letter: 'A', title: 'Extract product reviews from Amazon website and save to a file.', shortDescription: 'Web scraping using Beautiful Soup to extract reviews.', longDescription: 'Use Python and Beautiful Soup to extract reviews.', cover: svg('#0969f5', '#07152b', '7A'), video: '', githubUrl: 'https://github.com/example/exp7a', tools: [tool('Python')], materials: [], completed: true,
        topics: [lesson('7A.1', 'Extract product reviews using Beautiful Soup'), lesson('7A.2', 'Clean and save the extracted review data'), lesson('7A.3', 'Store reviews in CSV format')] },
      { id: '7B', letter: 'B', title: 'Perform Exploratory Data Analysis on extracted product reviews.', shortDescription: 'EDA with NLTK and VADER.', longDescription: 'Perform EDA on extracted reviews.', cover: svg('#12306a', '#0969f5', '7B'), video: '', githubUrl: '', tools: [tool('Python'), tool('Pandas')], materials: [], completed: true,
        topics: [lesson('7B.1', 'Generate WordCloud for all reviews, positive and negative reviews'), lesson('7B.2', 'Visualize review statistics'), lesson('7B.3', 'Analyze review sentiment using NLTK and VADER')] } ] },
];
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const types = { '.webm': 'video/webm', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const files = {}; // uploaded videos/pdfs in memory
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.pathname;
  if (p.startsWith('/api/')) {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      let j = {}; try { j = JSON.parse(body || '{}'); } catch {}
      const m = req.method;
      if (p === '/api/auth/me') return send(res, 200, guest ? { authenticated: false, role: null } : { authenticated: true, role: 'admin', name: 'Admin' });
      if (m !== 'GET' && guest) return send(res, 403, { error: 'View-only access: only an Admin can add, edit, delete or upload content.' });
      if (p === '/api/experiments' && m === 'GET') return send(res, 200, db);
      if (p === '/api/experiments' && m === 'POST') { const e = { ...j, id: ('b' + Date.now().toString(16)).padEnd(24, '0') }; db.push(e); return send(res, 201, e); }
      const mm = p.match(/^\/api\/experiments\/([^/]+)$/);
      if (mm) { const i = db.findIndex(x => x.id === mm[1]); if (i < 0) return send(res, 404, { error: 'Experiment not found.' });
        if (m === 'GET') return send(res, 200, db[i]);
        if (m === 'PUT') { db[i] = { ...j, id: mm[1] }; return send(res, 200, db[i]); }
        if (m === 'DELETE') { db.splice(i, 1); return send(res, 200, { ok: true }); } }
      if (p === '/api/profile/header' || p === '/api/profile') return send(res, 200, { name: 'Test Student' });
      if (p === '/api/capabilities') return send(res, 200, {});
      // sample library data so the Modules / Tools / Resources card styling can be checked (test-only)
      const tp = (i, t) => ({ id: 'tm' + i, title: t, description: 'Short lesson description for ' + t + '.', order: i, content: 'Lesson text.' });
      if (p === '/api/modules') return send(res, 200, [1, 2, 3, 4, 5].map(n => ({ id: 'mod' + n, number: String(n), title: ['Data Extraction', 'Data Cleaning', 'Exploratory Analysis', 'Machine Learning', 'Visualisation'][n - 1], description: 'Core concepts, worked examples and practice for module ' + n + '.', fullDescription: 'Full description of the module.', learningOutcomes: ['Understand the basics', 'Apply it to real data'], topics: [tp(1, 'Introduction'), tp(2, 'Core ideas'), tp(3, 'Practice')] })));
      if (p === '/api/tools') return send(res, 200, ['Pandas', 'NumPy', 'Matplotlib', 'Scikit-learn', 'Jupyter'].map((n, i) => ({ id: 't' + i, name: n, description: n + ' is used throughout data science practice.', category: 'Library', website: 'https://example.org' })));
      if (p === '/api/resources') return send(res, 200, ['Python Documentation', 'Kaggle Datasets', 'Statistics Handbook', 'Course Notes'].map((n, i) => ({ id: 'r' + i, name: n, description: 'A curated reference: ' + n + '.', type: ['Documentation', 'Datasets', 'Book', 'Notes'][i], website: 'https://example.org' })));
      return send(res, 404, { error: 'Route not found' });
    }); return;
  }
  let f = p === '/' ? '/index.html' : p; f = path.join(root, path.normalize(f));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log('mock server on http://localhost:' + port));
