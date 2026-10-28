/* Dedicated experiment form. Uses the existing Express/MongoDB APIs and GridFS upload routes. */
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const params = new URLSearchParams(location.search);
  const editingId = params.get('id');
  const DRAFT_KEY = 'dsLabExperimentFormDraftV2';
  const form = $('#experimentFormPage');
  const message = $('#formMessage');
  const submit = $('#saveExperiment');
  const mainCover = { value: '', file: null };
  const mainVideo = { value: '', file: null };
  const mainPdf = { value: '', file: null };
  let existing = null;
  let topicSeq = 0;
  let subSeq = 0;
  const alphaLabel = index => index < 26 ? String.fromCharCode(65 + index) : `A${index - 25}`;
  function nextSubLetter(){const used=new Set($$('#subExperimentsList .ef-sub-card').map(card=>card.dataset.letter));let i=0;while(used.has(alphaLabel(i)))i++;return alphaLabel(i);}
  /* Tools come from the same API as the Tools page (GET /api/tools); nothing is hardcoded here. */
  let toolCatalog = [];
  let toolsError = '';
  const toolKey = v => String(v || '').trim().toLowerCase();
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toolSymbol = name => (window.ExpCore && window.ExpCore.toolCode ? window.ExpCore.toolCode(name) : String(name || '').slice(0, 2).toUpperCase());
  async function loadToolCatalog() {
    toolsError = '';
    try {
      const list = await api('/tools');
      const seenId = new Set(), seenName = new Set();
      toolCatalog = (Array.isArray(list) ? list : []).map(t => ({ id: String(t.id || t._id || ''), name: String(t.name || '').trim(), description: String(t.description || '').trim() }))
        .filter(t => t.id && t.name && !seenId.has(t.id) && !seenName.has(toolKey(t.name)) && seenId.add(t.id) && seenName.add(toolKey(t.name)))
        .sort((x, y) => x.name.localeCompare(y.name));
    } catch (error) { toolCatalog = []; toolsError = `Could not load tools: ${error.message}`; }
  }
  const toolChoice = (t, attr, checked) => `<label class="ef-tool-choice"><span class="ef-tool-symbol">${escapeHtml(toolSymbol(t.name))}</span><span>${escapeHtml(t.name)}${t.orphan ? ' <small>(not in Tools list)</small>' : ''}</span><input type="checkbox" ${attr} value="${escapeHtml(t.orphan ? `name:${t.name}` : t.id)}" data-tool-name="${escapeHtml(t.name)}" data-tool-desc="${escapeHtml(t.description || '')}"${t.orphan ? ' data-tool-orphan' : ''}${checked ? ' checked' : ''}></label>`;
  /* Checkbox markup for every real tool, pre-selecting the saved ones (matched by toolId, else by name for older records).
     Saved tools that no longer exist in the Tools list stay visible and ticked so editing never silently drops them. */
  function toolPickerHtml(attr, saved) {
    if (toolsError) return `<p class="ef-tools-state is-error" role="alert">${escapeHtml(toolsError)}</p>`;
    const picks = (Array.isArray(saved) ? saved : []).map(s => (typeof s === 'string' ? { name: s } : s)).filter(s => s && (s.toolId || s.name));
    const used = new Set();
    const isPicked = t => picks.some(s => (s.toolId && String(s.toolId) === t.id) || (!s.toolId && toolKey(s.name) === toolKey(t.name)) || (s.toolId && String(s.toolId) === t.name));
    const rows = toolCatalog.map(t => { const on = isPicked(t); if (on) used.add(t.id); return toolChoice(t, attr, on); });
    const orphans = picks.filter(s => !toolCatalog.some(t => (s.toolId && String(s.toolId) === t.id) || toolKey(s.name) === toolKey(t.name)) && s.name)
      .filter((s, i, arr) => arr.findIndex(o => toolKey(o.name) === toolKey(s.name)) === i)
      .map(s => toolChoice({ name: s.name, description: s.description || '', orphan: true }, attr, true));
    if (!rows.length && !orphans.length) return '<p class="ef-tools-state">No tools have been added yet. Add them on the <a href="tools.html">Tools page</a> and they will appear here.</p>';
    return rows.concat(orphans).join('');
  }
  const readTools = (root, selector) => [...root.querySelectorAll(`${selector}:checked`)].map(input => {
    const ref = { name: input.dataset.toolName || input.value, description: input.dataset.toolDesc || '' };
    if (!input.hasAttribute('data-tool-orphan')) ref.toolId = input.value;
    return ref;
  });
  const renderMainTools = saved => { $('#toolsGrid').innerHTML = toolPickerHtml('', saved); };
  const setMessage = (text, error = false) => { message.textContent = text; message.classList.toggle('is-error', error); };
  const setError = (key, text) => { const node = $(`[data-error="${key}"]`); if (node) node.textContent = text || ''; };
  const safeUrl = (value) => { if (!value) return ''; try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  const api = async (path, options = {}) => {
    let response;
    try { response = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...(options.body && !(options.body instanceof Blob) ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) } }); }
    catch { throw new Error('Cannot reach the server. Start the existing Node.js backend and try again.'); }
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json() : null;
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
    return data;
  };
  async function uploadBinary(path, file, typeHeader, typeValue, maxBytes) {
    if (!file) return '';
    if (file.size > maxBytes) throw new Error(`${file.name} exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB size limit.`);
    const headers = { 'Content-Type': file.type || typeValue };
    headers[typeHeader] = typeHeader === 'X-Video-Type' ? typeValue : encodeURIComponent(file.name);
    let response;
    try { response = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: file }); }
    catch { throw new Error('Upload failed because the server could not be reached.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Upload failed (${response.status}).`);
    return data;
  }
  async function compressImage(file) {
    if (!file || !/^image\/(jpeg|png)$/.test(file.type)) throw new Error('Choose a JPG or PNG cover image.');
    if (file.size > 2 * 1024 * 1024) throw new Error('Cover image must be 2 MB or smaller.');
    const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = URL.createObjectURL(file); });
    const scale = Math.min(1, 1200 / image.width, 900 / image.height);
    const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(image.src);
    const data = canvas.toDataURL('image/jpeg', .84);
    if (data.length > 3.8 * 1024 * 1024) throw new Error('The cover image could not be compressed enough. Choose a smaller image.');
    return data;
  }
  function updateCounters() {
    $('#shortCounter').textContent = `${$('#shortDescription').value.length}/300`;
    $('#longCounter').textContent = `${$('#longDescription').value.length}/2000`;
  }
  function setupResource(modeName, fileId, urlId, labelId, statusId, state, kind) {
    const file = $(`#${fileId}`), url = $(`#${urlId}`), label = $(`#${labelId}`), status = $(`#${statusId}`);
    const radios = $$(`input[name="${modeName}"]`);
    const update = () => {
      const mode = $(`input[name="${modeName}"]:checked`)?.value || 'upload';
      file.closest('.ef-resource-body').querySelector('label.ef-upload').hidden = mode !== 'upload';
      url.hidden = mode !== 'url';
      if (state.file) label.textContent = state.file.name;
      else label.textContent = kind === 'pdf' ? 'Upload PDF File' : 'Upload Video File';
    };
    radios.forEach(r => r.addEventListener('change', update));
    file.addEventListener('change', () => {
      const picked = file.files[0]; if (!picked) return;
      if (kind === 'pdf' && (picked.type !== 'application/pdf' && !picked.name.toLowerCase().endsWith('.pdf'))) { file.value=''; status.textContent='Choose a PDF file.'; return; }
      if (kind === 'video' && !['video/mp4','video/webm'].includes(picked.type)) { file.value=''; status.textContent='Choose an MP4 or WebM video.'; return; }
      const max = kind === 'pdf' ? 10 : 100;
      if (picked.size > max * 1024 * 1024) { file.value=''; status.textContent=`Maximum file size is ${max} MB.`; return; }
      state.file = picked; status.textContent = `Selected: ${picked.name}`; update();
    });
    url.addEventListener('input', () => { state.value = url.value.trim(); });
    update();
    return {
      set(value, sourceMode = 'url') { state.value = value || ''; state.file = null; if (sourceMode === 'upload') { radios.find(r=>r.value==='upload').checked = true; } else { radios.find(r=>r.value==='url').checked = true; url.value = state.value; } update(); status.textContent = state.value ? 'Saved resource attached.' : ''; },
      async read(title) {
        const mode = $(`input[name="${modeName}"]:checked`)?.value || 'upload';
        if (mode === 'url') { const entered = url.value.trim(); if (entered && !safeUrl(entered)) throw new Error(`Enter a valid HTTPS/HTTP URL for ${title}.`); if (!entered) return null; return kind === 'video' ? { video: safeUrl(entered) } : { title, url: safeUrl(entered) }; }
        if (state.file) {
          if (kind === 'pdf') {
            const result = await uploadBinary('/module-files', state.file, 'X-Module-File-Name', 'application/pdf', 10 * 1024 * 1024);
            const href = new URL(`${API_BASE}/module-files/${encodeURIComponent(result.id)}`, location.origin).href;
            return { title, url: href };
          }
          const result = await uploadBinary('/videos', state.file, 'X-Video-Type', state.file.type, 100 * 1024 * 1024);
          return { video: result.id };
        }
        return state.value ? (kind === 'video' ? { video: state.value } : { title, url: state.value }) : null;
      },
      update,
    };
  }
  const mainPdfControl = setupResource('mainPdfMode','mainPdfFile','mainPdfUrl','mainPdfLabel','mainPdfStatus',mainPdf,'pdf');
  const mainVideoControl = setupResource('mainVideoMode','mainVideoFile','mainVideoUrl','mainVideoLabel','mainVideoStatus',mainVideo,'video');

  function createTopic(data = {}, parent = 'main') {
    const id = data.id || `t_${Date.now().toString(36)}${(++topicSeq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const initialChildren = Array.isArray(data.subTopics) ? data.subTopics : [];
    const card = document.createElement('details');
    card.className = 'ef-topic-editor';
    if (parent === 'nested') card.classList.add('ef-child-topic-editor');
    card.open = data._open === true;
    card.dataset.topicId = id;
    card.innerHTML = `<summary><span class="ef-topic-summary-number"></span><span class="ef-topic-summary-name"></span><button type="button" class="ef-topic-summary-delete" title="Delete this topic" aria-label="Delete this topic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7"/></svg><span>Delete</span></button><span class="ef-topic-summary-chevron">⌄</span></summary>
      <div class="ef-topic-editor-body">
      <div class="ef-fields-two"><label class="ef-field"><span>Topic Name *</span><input data-t="heading" maxlength="140" required placeholder="e.g., Introduction to File Formats"></label><label class="ef-field"><span>Topic Number</span><input data-t="topicNumber" maxlength="40" placeholder="e.g., 1A.1"></label></div>
      <div class="ef-fields-two"><label class="ef-field"><span>Aim</span><textarea data-t="aim" rows="2" placeholder="Enter aim of this topic..."></textarea></label><label class="ef-field"><span>Syntax</span><textarea data-t="syntax" rows="2" placeholder="Enter syntax..."></textarea></label></div>
      <label class="ef-field"><span>Procedure (one step per line)</span><textarea data-t="procedure" rows="3" placeholder="Enter step by step procedure..."></textarea></label>
      <label class="ef-field"><span>Code Sample</span><textarea data-t="code" class="ef-code-input" rows="5" placeholder="Enter code sample..."></textarea></label>
      <label class="ef-field"><span>Output Sample</span><textarea data-t="sampleOutput" rows="3" placeholder="Enter output sample..."></textarea></label>
      <label class="ef-field"><span>Result</span><textarea data-t="result" rows="2" placeholder="Enter result / conclusion..."></textarea></label>
      <div class="ef-fields-two"><label class="ef-field"><span>Topic PDF URL (optional)</span><input data-t="pdfUrl" type="url" placeholder="https://example.com/topic.pdf"></label><label class="ef-field"><span>GitHub URL (optional)</span><input data-t="githubUrl" type="url" placeholder="https://github.com/user/repo"></label></div>
      <section class="ef-topic-children" data-topic-children><div class="ef-subtopics-head"><strong>Sub-topics (Optional)</strong><button type="button" class="ef-button" data-add-nested-topic>＋ Add Sub-topic</button></div><div data-nested-topic-list></div></section>
      <div class="ef-topic-editor-actions"><button type="button" class="ef-button" data-topic-remove>Remove Topic</button></div></div>`;
    const get = key => $(`[data-t="${key}"]`, card);
    ['heading','topicNumber','aim','syntax','code','sampleOutput','result','pdfUrl','githubUrl'].forEach(key => { get(key).value = data[key] || (key === 'heading' ? data.title || '' : ''); });
    get('procedure').value = Array.isArray(data.procedure) ? data.procedure.join('\n') : (data.procedure || '');
    card.querySelector('.ef-topic-summary-number').textContent = data.topicNumber || '';
    card.querySelector('.ef-topic-summary-name').textContent = data.heading || data.title || 'New topic';
    const updateSummary = () => { card.querySelector('.ef-topic-summary-number').textContent = get('topicNumber').value || ''; card.querySelector('.ef-topic-summary-name').textContent = get('heading').value || 'New topic'; };
    get('heading').addEventListener('input', updateSummary);
    get('topicNumber').addEventListener('input', updateSummary);
    card.querySelector('.ef-topic-summary-delete').addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();   // do not toggle the <details>
      card.querySelector('[data-topic-remove]').click();
    });
    card.querySelector('[data-topic-remove]').addEventListener('click', () => {
      if (parent === 'main') { const row = $('#mainTopicsList').querySelector(`[data-topic-id="${CSS.escape(id)}"]`); row?.remove(); refreshMainTopicLetters(); }
      card.remove(); refreshTopicLists();
    });
    const childrenMount = $('[data-nested-topic-list]', card);
    const childrenPanel = $('[data-topic-children]', card);
    const addNestedTopic = (child = {}) => {
      const base = get('topicNumber').value.trim() || (parent === 'main' ? ($('#number').value.trim() || '1') : '1A');
      const childIndex = [...childrenMount.children].length + 1;
      const childData = {...child, topicNumber: child.topicNumber || `${base}.${childIndex}`};
      const childCard = createTopic(childData, 'nested');
      childrenMount.appendChild(childCard);
      return childCard;
    };
    initialChildren.forEach(child => addNestedTopic(child));
    card.querySelector('[data-add-nested-topic]').addEventListener('click', () => {
      const childCard = addNestedTopic({_open:true});
      childCard.open = true;
    });
    card.readData = (index) => {
      const children = [...childrenMount.children].filter(node => node.classList.contains('ef-topic-editor')).map((node, i) => node.readData(i));
      return {
        id,
        heading: get('heading').value.trim(),
        topicNumber: get('topicNumber').value.trim(),
        type: 'code',
        content: get('aim').value.trim(),
        aim: get('aim').value.trim(),
        syntax: get('syntax').value.trim(),
        procedure: get('procedure').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),
        code: get('code').value,
        sampleOutput: get('sampleOutput').value,
        result: get('result').value.trim(),
        pdfUrl: get('pdfUrl').value.trim(),
        githubUrl: get('githubUrl').value.trim(),
        order: index + 1,
        subTopics: children.filter(child => child.heading),
      };
    };
    return card;
  }
  function refreshTopicLists() {
    $$('.ef-topic-editor', form).forEach((card, index) => { const n=card.querySelector('.ef-topic-summary-number'); if(n && !n.textContent) n.textContent=String(index+1); });
  }
  function addMainTopic(data = {}) {
    const row = document.createElement('div'); row.className='ef-topic-mini-row';
    const idx = $('#mainTopicsList').children.length + 1;
    row.innerHTML = `<span class="ef-topic-letter">${alphaLabel(idx-1)}</span><input aria-label="Topic name" placeholder="Topic Name" maxlength="140"><button type="button" class="ef-icon-button" aria-label="Remove topic" title="Delete topic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7"/></svg></button>`;
    row.querySelector('input').value=data.heading || data.title || '';
    row.querySelector('button').addEventListener('click',()=>{row.remove();card.remove();refreshMainTopicLetters();refreshTopicLists();});
    $('#mainTopicsList').appendChild(row);
    // each main topic has a full lesson editor beneath the compact topic list
    const card = createTopic(data, 'main'); card.classList.add('ef-main-topic-card'); $('#mainTopicEditors').appendChild(card);
    row.querySelector('input').addEventListener('input',()=>{card.querySelector('[data-t="heading"]').value=row.querySelector('input').value;card.querySelector('.ef-topic-summary-name').textContent=row.querySelector('input').value||'New topic';});
    card.querySelector('[data-t="heading"]').addEventListener('input',()=>{row.querySelector('input').value=card.querySelector('[data-t="heading"]').value;});
    row.dataset.topicId=card.dataset.topicId;
    // The topic editor's own remove action synchronizes the compact topic row.
    refreshMainTopicLetters();
  }
  function refreshMainTopicLetters(){ $$('#mainTopicsList .ef-topic-mini-row').forEach((row,i)=>{row.querySelector('.ef-topic-letter').textContent=alphaLabel(i);}); }

  function createSubTopicRow(data = {}, index = 0) {
    const row=document.createElement('div');row.className='ef-subtopic-row';
    row.innerHTML=`<input class="ef-subtopic-id" data-st="topicNumber" aria-label="Sub-topic number" placeholder="1A.1"><input data-st="heading" aria-label="Sub-topic name" placeholder="Subtopic Name"><button type="button" class="ef-icon-button" aria-label="Remove sub-topic" title="Delete sub-topic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7"/></svg></button>`;
    row.querySelector('[data-st="topicNumber"]').value=data.topicNumber||`${index+1}`;row.querySelector('[data-st="heading"]').value=data.heading||data.title||'';
    row.querySelector('button').addEventListener('click',()=>{row.remove();});return row;
  }
  function createSubCard(data = {}) {
    const index = subSeq++;
    const card=document.createElement('article');card.className='ef-sub-card';card.dataset.subIndex=String(index);
    const letter=data.letter || nextSubLetter();
    card.innerHTML=`<header class="ef-sub-card__head"><strong>Exp ${escapeHtml(letter)}</strong><button type="button" class="ef-icon-button" data-remove-sub aria-label="Remove sub-experiment" title="Delete sub-experiment"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7"/></svg></button></header>
      <div class="ef-sub-card__body">
       <div class="ef-sub-main-fields"><label class="ef-field"><span>Topic Name *</span><input data-s="title" maxlength="140" required placeholder="e.g., Introduction to File Formats"></label><label class="ef-field"><span>Short Description (D1) *</span><textarea data-s="shortDescription" maxlength="300" rows="3" required placeholder="Enter a short description..."></textarea><small class="ef-counter" data-sub-short-count>0/300</small></label><label class="ef-field"><span>Long Description (D2)</span><textarea data-s="longDescription" maxlength="2000" rows="4" placeholder="Enter detailed description..."></textarea><small class="ef-counter" data-sub-long-count>0/2000</small></label><div class="ef-field"><span>Cover Image (Optional)</span><label class="ef-upload" data-sub-cover-label><span class="ef-upload-icon">▧</span><strong>Upload Image</strong><small>JPG, PNG (Max 2MB)</small><img alt="Sub-experiment cover" hidden></label><input type="file" data-s="coverFile" accept="image/jpeg,image/png" hidden><small data-s="coverStatus" class="ef-status"></small></div><label class="ef-field"><span>GitHub URL (optional)</span><input data-s="githubUrl" type="url" placeholder="https://github.com/user/repo"></label><section class="ef-sub-tool-picker"><h4>Tools Used (optional)</h4><div class="ef-sub-tool-grid">${toolPickerHtml('data-s-tool',data.tools)}</div></section></div>
       <div class="ef-sub-resources"><section class="ef-sub-resource"><h4>Material PDF</h4><div class="ef-radio-row"><label><input type="radio" data-s="pdfMode" value="upload" checked> Upload File</label><label><input type="radio" data-s="pdfMode" value="url"> Use URL</label></div><div class="ef-resource-body"><label class="ef-upload" data-s="pdf-label"><span class="ef-upload-icon ef-pdf">PDF</span><strong>Upload PDF</strong></label><input data-s="pdfFile" type="file" accept="application/pdf,.pdf" hidden><input data-s="pdfUrl" class="ef-url-input" type="url" placeholder="https://example.com/file.pdf" hidden></div><small data-s="pdfStatus" class="ef-status"></small></section><section class="ef-sub-resource"><h4>Video</h4><div class="ef-radio-row"><label><input type="radio" data-s="videoMode" value="upload" checked> Upload File</label><label><input type="radio" data-s="videoMode" value="url"> Use URL</label></div><div class="ef-resource-body"><label class="ef-upload" data-s="video-label"><span class="ef-upload-icon ef-video">▶</span><strong>Upload Video</strong></label><input data-s="videoFile" type="file" accept="video/mp4,video/webm" hidden><input data-s="videoUrl" class="ef-url-input" type="url" placeholder="https://example.com/video.mp4" hidden></div><small data-s="videoStatus" class="ef-status"></small></section></div>
       <div class="ef-subtopics"><div data-subtopic-content><div class="ef-subtopics-head"><span>Sub-topics (Optional)</span><button type="button" class="ef-button" data-add-subtopic>＋ Add Sub-topic</button></div><div data-subtopic-rows></div><div class="ef-subtopic-editor"><h4>Topic Lesson Content</h4><div data-subtopic-lessons></div></div></div></div>
      </div>`;
    // Radios inside repeated cards must have unique names; otherwise browser groups are ambiguous.
    card.querySelectorAll('input[data-s="pdfMode"]').forEach(r => { r.name = `sub-${index}-pdfMode`; });
    card.querySelectorAll('input[data-s="videoMode"]').forEach(r => { r.name = `sub-${index}-videoMode`; });
    const get=key=>$(`[data-s="${key}"]`,card);
    // The nested resource labels are custom upload tiles; explicitly open their hidden file inputs.
    [['coverFile',get('coverFile').previousElementSibling],['pdfFile',get('pdf-label')],['videoFile',get('video-label')]].forEach(([key,label])=>label.addEventListener('click',event=>{if(event.target.closest('input'))return;get(key).click();}));
    ['title','shortDescription','longDescription','githubUrl'].forEach(key=>{get(key).value=data[key]||'';});
    const subCover={value:data.cover||'',file:null};
    const img=get('coverFile').previousElementSibling.querySelector('img');
    if(subCover.value){img.src=subCover.value;img.hidden=false;get('coverFile').previousElementSibling.querySelector('strong').textContent='Cover image selected';}
    get('coverFile').addEventListener('change',async()=>{const picked=get('coverFile').files[0];if(!picked)return;try{subCover.value=await compressImage(picked);img.src=subCover.value;img.hidden=false;get('coverFile').previousElementSibling.querySelector('strong').textContent='Cover image selected';if(get('coverStatus'))get('coverStatus').textContent=`Selected: ${picked.name}`;}catch(e){get('coverFile').value='';if(get('coverStatus'))get('coverStatus').textContent=e.message;}});
    const existingPdf=(data.materials||[]).find(m=>/pdf/i.test(m.title||''));const pdfState={file:null,value:existingPdf?.url||''}, videoState={file:null,value:data.video||''};
    const bindSubResource=(kind,state)=>{
      const modeName=kind==='pdf'?'pdfMode':'videoMode';const file=get(kind==='pdf'?'pdfFile':'videoFile');const url=get(kind==='pdf'?'pdfUrl':'videoUrl');const label=get(kind==='pdf'?'pdf-label':'video-label');const status=get(kind==='pdf'?'pdfStatus':'videoStatus');
      const update=()=>{const mode=card.querySelector(`input[data-s="${modeName}"]:checked`)?.value||'upload';label.hidden=mode!=='upload';url.hidden=mode!=='url';};
      card.querySelectorAll(`input[data-s="${modeName}"]`).forEach(r=>r.addEventListener('change',update));
      file.addEventListener('change',()=>{const f=file.files[0];if(!f)return;const max=kind==='pdf'?10:100;if(kind==='pdf'&&(f.type!=='application/pdf'&&!f.name.toLowerCase().endsWith('.pdf'))){status.textContent='Choose a PDF file.';file.value='';return;}if(kind==='video'&&!['video/mp4','video/webm'].includes(f.type)){status.textContent='Choose MP4 or WebM.';file.value='';return;}if(f.size>max*1024*1024){status.textContent=`Maximum ${max} MB.`;file.value='';return;}state.file=f;label.querySelector('strong').textContent=f.name;status.textContent=`Selected: ${f.name}`;});
      url.addEventListener('input',()=>state.value=url.value.trim());update();
      return async()=>{const mode=card.querySelector(`input[data-s="${modeName}"]:checked`)?.value||'upload';if(mode==='url'){const v=url.value.trim();if(v&&!safeUrl(v))throw new Error(`Invalid ${kind==='pdf'?'PDF':'video'} URL in Exp ${letter}.`);return kind==='pdf'?(v?{title:`Exp ${letter} Material PDF`,url:safeUrl(v)}:null):v;}if(state.file){if(kind==='pdf'){const result=await uploadBinary('/module-files',state.file,'X-Module-File-Name','application/pdf',10*1024*1024);return{title:`Exp ${letter} Material PDF`,url:new URL(`${API_BASE}/module-files/${encodeURIComponent(result.id)}`,location.origin).href};}const result=await uploadBinary('/videos',state.file,'X-Video-Type',state.file.type,100*1024*1024);return result.id;}return state.value?(kind==='pdf'?{title:`Exp ${letter} Material PDF`,url:state.value}:state.value):null;};
    };
    const readPdf=bindSubResource('pdf',pdfState),readVideo=bindSubResource('video',videoState);if(pdfState.value){get('pdfUrl').value=pdfState.value;card.querySelector('input[data-s="pdfMode"][value="url"]').checked=true;get('pdf-label').hidden=true;get('pdfUrl').hidden=false;}if(data.video&&/^https?:\/\//i.test(data.video)){get('videoUrl').value=data.video;card.querySelector('input[data-s="videoMode"][value="url"]').checked=true;get('video-label').hidden=true;get('videoUrl').hidden=false;}
    const rows=get('title').closest('.ef-sub-card__body').querySelector('[data-subtopic-rows]');
    const lessonMount=get('title').closest('.ef-sub-card__body').querySelector('[data-subtopic-lessons]');
    const hasSavedTopics=Array.isArray(data.topics)&&data.topics.length || Array.isArray(data.d2Topics)&&data.d2Topics.length;
    const initialTopics=(Array.isArray(data.topics)&&data.topics.length?data.topics:(Array.isArray(data.d2Topics)?data.d2Topics:[])).filter(t=>t&&t.id!=='legacy-topic-1'&&String(t.heading||t.title||'').trim());
    const topicCards=[];
    const addChildTopic=(topic={})=>{const t=createTopic(topic,'sub');t.classList.add('ef-nested-topic');lessonMount.appendChild(t);topicCards.push(t);const row=createSubTopicRow(topic,rows.children.length);rows.appendChild(row);row.dataset.lessonId=t.dataset.topicId;t.dataset.rowId=row.dataset.topicId||t.dataset.topicId;row.querySelector('button').addEventListener('click',()=>{t.remove();row.remove();});t.querySelector('[data-topic-remove]').addEventListener('click',()=>{row.remove();t.remove();});row.querySelector('[data-st="heading"]').addEventListener('input',()=>{t.querySelector('[data-t="heading"]').value=row.querySelector('[data-st="heading"]').value;t.querySelector('.ef-topic-summary-name').textContent=row.querySelector('[data-st="heading"]').value||'New topic';});row.querySelector('[data-st="topicNumber"]').addEventListener('input',()=>{t.querySelector('[data-t="topicNumber"]').value=row.querySelector('[data-st="topicNumber"]').value;});t.querySelector('[data-t="heading"]').addEventListener('input',()=>{row.querySelector('[data-st="heading"]').value=t.querySelector('[data-t="heading"]').value;});t.querySelector('[data-t="topicNumber"]').addEventListener('input',()=>{row.querySelector('[data-st="topicNumber"]').value=t.querySelector('[data-t="topicNumber"]').value;});};
    initialTopics.forEach(addChildTopic);
    card.querySelector('[data-add-subtopic]').addEventListener('click',()=>addChildTopic({topicNumber:`${data.id||letter}.${rows.children.length+1}`}));
    card.querySelector('[data-remove-sub]').addEventListener('click',()=>{card.remove();refreshSubLetters();});
    get('shortDescription').addEventListener('input',()=>card.querySelector('[data-sub-short-count]').textContent=`${get('shortDescription').value.length}/300`);
    get('longDescription').addEventListener('input',()=>card.querySelector('[data-sub-long-count]').textContent=`${get('longDescription').value.length}/2000`);
    card.readData=async()=>{
      const title=get('title').value.trim(), shortDescription=get('shortDescription').value.trim();
      if(!title||!shortDescription)throw new Error(`Exp ${letter}: Topic Name and Short Description (D1) are required.`);
      const github=get('githubUrl').value.trim();if(github&&!safeUrl(github))throw new Error(`Exp ${letter}: enter a valid GitHub URL.`);
      const pdf=await readPdf(), video=await readVideo();
      const topics=[...lessonMount.children].filter(t=>t.classList.contains('ef-nested-topic')).map((t,i)=>t.readData(i));
      const activeTopics=topics.filter(t=>t.heading||t.aim||t.syntax||t.code||t.sampleOutput||t.result||t.procedure.length);
      if(activeTopics.some(t=>!t.heading))throw new Error(`Exp ${letter}: every filled topic needs a name.`);
      const keptMaterials=(Array.isArray(data.materials)?data.materials:[]).filter(m=>!/pdf/i.test(m.title||''));return {letter,title,shortDescription,longDescription:get('longDescription').value.trim(),d2Content:get('longDescription').value.trim(),d2Heading:'Long Description',d2Topics:[],topics:activeTopics,cover:subCover.value,video:video||'',githubUrl:github,tools:readTools(card,'[data-s-tool]'),materials:[...keptMaterials,...(pdf?[pdf]:[])],completed:true};
    };
    card.draftData=()=>({letter,title:get('title').value,shortDescription:get('shortDescription').value,longDescription:get('longDescription').value,cover:subCover.value,githubUrl:get('githubUrl').value,tools:readTools(card,'[data-s-tool]'),video:(card.querySelector(`input[data-s="videoMode"][value="url"]`).checked?get('videoUrl').value.trim():videoState.value),materials:(card.querySelector(`input[data-s="pdfMode"][value="url"]`).checked&&get('pdfUrl').value.trim())?[{title:`Exp ${letter} Material PDF`,url:get('pdfUrl').value.trim()}]:(Array.isArray(data.materials)?data.materials:[]).filter(m=>/pdf/i.test(m.title||'')),topics:[...lessonMount.children].filter(t=>t.classList.contains('ef-nested-topic')).map((t,i)=>t.readData(i))});
    return card;
  }
  function updateHierarchyVisibility(){
    const hasSubs=$$('#subExperimentsList .ef-sub-card').length>0;
    const topicPanel=$('.ef-topic-list-panel');const mainLessons=$('.ef-main-lessons');
    if(topicPanel){topicPanel.hidden=hasSubs;topicPanel.setAttribute('aria-hidden',String(hasSubs));}
    if(mainLessons){mainLessons.hidden=hasSubs;mainLessons.setAttribute('aria-hidden',String(hasSubs));}
    const helper=$('#hierarchyHint');if(helper)helper.hidden=!hasSubs;
  }
  function refreshSubLetters(){ $$('#subExperimentsList .ef-sub-card').forEach(card=>{const letter=card.dataset.letter||nextSubLetter();card.dataset.letter=letter;card.querySelector('.ef-sub-card__head strong').textContent=`Exp ${letter}`;});updateHierarchyVisibility(); }
  function addSubCard(data={}) { const card=createSubCard(data);$('#subExperimentsList').appendChild(card);refreshSubLetters();return card; }
  function readMainTopics(){return [...$('#mainTopicEditors').children].filter(card=>card.classList.contains('ef-topic-editor')&&!card.classList.contains('ef-child-topic-editor')).map((card,i)=>card.readData(i));}
  function readMainTopicNames(){return $$('#mainTopicsList input').map(input=>({heading:input.value.trim()}));}
  function loadIntoForm(item){
    $('#number').value=item.number||'';$('#title').value=item.title||'';$('#shortDescription').value=item.shortDescription||'';$('#longDescription').value=item.longDescription||item.d2Content||'';if($('#githubInput'))$('#githubInput').value=item.githubUrl||item.githubLink||'';
    mainCover.value=item.cover||'';if(mainCover.value){$('#coverPreview').src=mainCover.value;$('#coverPreview').hidden=false;$('#coverLabel').textContent='Cover image selected';}
    mainVideo.value=item.video||'';
    renderMainTools(item.tools);
    const pdf=(item.materials||[]).find(m=>/pdf/i.test(m.title||''));if(pdf){mainPdf.value=pdf.url;mainPdfControl.set(pdf.url,'url');}
    if(item.video&&!/^[a-f\d]{24}$/i.test(item.video)){mainVideoControl.set(item.video,'url');} else if(item.video){$('#mainVideoStatus').textContent='Saved video attached.';}
    $('#mainTopicsList').replaceChildren();$('#mainTopicEditors').replaceChildren();
    const topicData=Array.isArray(item.topics)&&item.topics.length?item.topics:(item.d2Topics||[]).filter(t=>t.heading&&!/^(description|aim|syntax|procedure|code sample|program|output sample|output|result|materials|tools|overview|summary|requirements|algorithm|introduction)$/i.test(String(t.heading).trim()));
    topicData.forEach(addMainTopic);
    $('#subExperimentsList').replaceChildren();(item.subExperiments||[]).forEach(addSubCard);if(params.get('focus')==='sub')addSubCard();refreshSubLetters();updateCounters();
    $('#pageTitle').textContent='Edit Experiment';$('#crumbCurrent').textContent='Edit Experiment';document.title='Edit Experiment – Data Science Digital Laboratory';
  }
  function serializeFormData() {
    const number=$('#number').value.trim(), title=$('#title').value.trim(), shortDescription=$('#shortDescription').value.trim(), longDescription=$('#longDescription').value.trim();
    if(!number){setError('number','Enter an experiment number.');throw new Error('Experiment Number is required.');}setError('number','');
    if(!title){setError('title','Enter an experiment name.');throw new Error('Experiment Name is required.');}setError('title','');
    if(!shortDescription){setError('shortDescription','Enter a short description.');throw new Error('Short Description (D1) is required.');}setError('shortDescription','');
    if(shortDescription.length>300||longDescription.length>2000)throw new Error('Description length exceeds the allowed limit.');
    if(!longDescription){setError('longDescription','Enter a long description.');throw new Error('Long Description (D2) is required.');}setError('longDescription','');
    /* cover image is optional: the listing shows a placeholder when empty */
    const names=readMainTopicNames();const topics=readMainTopics();
    const hasSubExperiments=$$('#subExperimentsList .ef-sub-card').length>0;
    const namedMainTopics=topics.map((t,i)=>({...t,heading:(names[i]?.heading||t.heading||'').trim()})).filter(t=>t.heading);
    if(!hasSubExperiments&&!namedMainTopics.length)throw new Error('Add at least one direct topic, or add sub-experiments such as 1A and 1B.');
    namedMainTopics.forEach((t,i)=>{if(!t.topicNumber||/^\d+$/.test(t.topicNumber))t.topicNumber=String(i+1);});
    return {number,title,shortDescription,longDescription,d2Heading:'Long Description',d2Content:longDescription,d2Topics:[],topics:namedMainTopics,cover:mainCover.value,video:mainVideo.value,githubUrl:$('#githubInput')?.value.trim()||'',tools:readTools($('#toolsGrid'),'input'),materials:[],subExperiments:[]};
  }
  async function buildPayload() {
    const data=serializeFormData();
    const pdf=await mainPdfControl.read('Material PDF');const keptMaterials=(Array.isArray(existing?.materials)?existing.materials:[]).filter(m=>!/pdf/i.test(m.title||''));data.materials=[...keptMaterials,...(pdf?[pdf]:[])];
    const video=await mainVideoControl.read('Main Video');data.video=video?.video||'';
    data.subExperiments=[];
    for(const card of $$('#subExperimentsList .ef-sub-card'))data.subExperiments.push(await card.readData());
    // Maintain stable child identifiers after the parent number is known.
    data.subExperiments.forEach(sub=>{sub.id=`${data.number}${sub.letter}`;sub.topics=(sub.topics||[]).map((t,i)=>{const expected=`${sub.id}.${i+1}`;const supplied=String(t.topicNumber||'');const matchesHierarchy=/^\d+[A-Z]+\.\d+(?:\.\d+)*$/i.test(supplied);return {...t,topicNumber:(!supplied||/^\d+$/.test(supplied)|| (matchesHierarchy&&!supplied.startsWith(`${sub.id}.`)))?expected:supplied};});});
    data.topics=data.subExperiments.length?[]:data.topics.map((t,i)=>{const v=String(t.topicNumber||'').trim();const auto=!v||v===String(i+1);/* a lone direct topic keeps the experiment number; never invent "<n>.1" */return {...t,topicNumber:auto?(data.topics.length===1?String(data.number):`${data.number}.${i+1}`):v};});
    return data;
  }
  function currentDraft() {
    return {number:$('#number').value,title:$('#title').value,shortDescription:$('#shortDescription').value,longDescription:$('#longDescription').value,cover:mainCover.value,githubUrl:$('#githubInput')?.value||'',mainPdfUrl:$('#mainPdfUrl').value,mainVideoUrl:$('#mainVideoUrl').value,tools:readTools($('#toolsGrid'),'input'),topics:readMainTopics().map((t,i)=>({...t,heading:$('#mainTopicsList').children[i]?.querySelector('input').value||t.heading})),subExperiments:$$('#subExperimentsList .ef-sub-card').map(card=>card.draftData())};
  }
  async function init() {
    try { const me = await api('/auth/me'); if (me?.authenticated !== true || me?.role !== 'admin') { setMessage('View-only access: sign in with an Admin account to add or edit experiments.', true); form.querySelectorAll('input,textarea,select,button').forEach(control=>control.disabled=true); return; } }
    catch { setMessage('Could not verify Admin access. Sign in and reload this page before editing.', true); form.querySelectorAll('input,textarea,select,button').forEach(control=>control.disabled=true); return; }
    $('#toolsGrid').innerHTML='<p class="ef-tools-state" role="status">Loading tools…</p>';
    await loadToolCatalog();renderMainTools([]);
    // Add one topic by default for a useful form, matching the screenshot's editable topic list.
    $('#mainTopicsList').replaceChildren();$('#mainTopicEditors').replaceChildren();
    if(editingId){
      try{existing=await api(`/experiments/${encodeURIComponent(editingId)}`).catch(async()=>{const all=await api('/experiments');return all.find(x=>String(x.id||x._id)===editingId);});if(!existing)throw new Error('Experiment not found');loadIntoForm(normalizeExperiment(existing));}
      catch(error){setMessage(`Could not load experiment: ${error.message}`,true);submit.disabled=true;return;}
    } else {
      const draft=localStorage.getItem(DRAFT_KEY);
      if(draft){try{const d=JSON.parse(draft);$('#number').value=d.number||'';$('#title').value=d.title||'';$('#shortDescription').value=d.shortDescription||'';$('#longDescription').value=d.longDescription||'';mainCover.value=d.cover||'';if(mainCover.value){$('#coverPreview').src=mainCover.value;$('#coverPreview').hidden=false;$('#coverLabel').textContent='Cover image selected';}if(d.githubUrl)$('#githubInput').value=d.githubUrl;if(d.mainPdfUrl)mainPdfControl.set(d.mainPdfUrl,'url');if(d.mainVideoUrl)mainVideoControl.set(d.mainVideoUrl,'url');if(Array.isArray(d.tools))renderMainTools(d.tools);(d.topics||[]).forEach(addMainTopic);(d.subExperiments||[]).forEach(addSubCard);}catch{localStorage.removeItem(DRAFT_KEY);}}
      if(!$('#mainTopicEditors').children.length){addMainTopic({heading:'',topicNumber:'1',_open:true});addMainTopic({heading:'',topicNumber:'2'});addMainTopic({heading:'',topicNumber:'3'});}
    }
    updateCounters();
    const focus=params.get('focus');if(focus==='cover')$('#coverFile').closest('.ef-field')?.scrollIntoView({block:'center'});else if(focus==='description')$('#shortDescription').focus({preventScroll:true});else if(focus==='sub')$('#subExperimentsList').scrollIntoView({block:'center'});
  }
  $('#coverFile').addEventListener('change',async()=>{const f=$('#coverFile').files[0];if(!f)return;try{mainCover.value=await compressImage(f);$('#coverPreview').src=mainCover.value;$('#coverPreview').hidden=false;$('#coverLabel').textContent='Cover image selected';setError('cover','');}catch(e){setError('cover',e.message);}});
  $('#shortDescription').addEventListener('input',updateCounters);$('#longDescription').addEventListener('input',updateCounters);
  $('#addMainTopic').addEventListener('click',()=>addMainTopic({heading:'',topicNumber:String($('#mainTopicsList').children.length+1)}));
  $('#addSubExperiment').addEventListener('click',()=>addSubCard());
  $('#saveDraft').addEventListener('click',()=>{try{localStorage.setItem(DRAFT_KEY,JSON.stringify(currentDraft()));setMessage('Draft saved in this browser. Uploads are not transferred until you save the experiment.');}catch{setMessage('Draft could not be saved. The draft may be too large for browser storage.',true);}});
  $('#previewExperiment').addEventListener('click',()=>{const title=$('#title').value.trim()||'Untitled experiment';$('#formPreviewTitle').textContent=title;$('#formPreviewText').textContent=$('#longDescription').value.trim()||$('#shortDescription').value.trim()||'No description entered yet.';const topicRows=readMainTopics().map(t=>`<div class="ef-preview-topic"><strong>${escapeHtml(t.topicNumber||'Topic')}</strong> — ${escapeHtml(t.heading||'Untitled topic')}<p>${escapeHtml(t.aim||'')}</p></div>`).join('');$('#formPreviewTopics').innerHTML=topicRows||'<p>No topics added yet.</p>';$('#formPreviewModal').hidden=false;});
  $$('[data-preview-close]').forEach(btn=>btn.addEventListener('click',()=>$('#formPreviewModal').hidden=true));
  form.addEventListener('submit',async event=>{
    event.preventDefault();setMessage('');submit.disabled=true;submit.textContent='Saving…';
    try{
      const payload=await buildPayload();
      const saved=editingId?await api(`/experiments/${encodeURIComponent(editingId)}`,{method:'PUT',body:JSON.stringify(payload)}):await api('/experiments',{method:'POST',body:JSON.stringify(payload)});
      try{sessionStorage.setItem('dsLabJustSaved',JSON.stringify(saved));}catch{/* too large to keep: the list will simply reload */}
      localStorage.removeItem(DRAFT_KEY);setMessage(editingId?'Experiment updated successfully.':'Experiment saved successfully.');
      location.href='index.html?saved=1';
    }catch(error){setMessage(error.message||'Could not save experiment.',true);window.scrollTo({top:0,behavior:'smooth'});}
    finally{submit.disabled=false;submit.textContent=editingId?'Save Changes':'Save Experiment';}
  });
  init();
})();