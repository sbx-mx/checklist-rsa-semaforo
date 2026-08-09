(() => {
  'use strict';

  const STORAGE_KEY = 'rsa-digital-draft-v3';
  let DATA = [];
  let saveTimer;
  const history = [];
  const state = {
    status: {}, notes: {}, actions: {}, owner: {}, due: {}, photos: {},
    query: '', section: 'Todas', view: 'pending', printMode: false,
    ctx: new Set(), ev: new Set(),
    meta: {store: '', auditor: '', date: '', shift: 'Apertura'}
  };

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const today = () => new Date().toISOString().slice(0, 10);
  const normalized = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function toast(message) {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(node._timer);
    node._timer = setTimeout(() => node.classList.remove('show'), 2200);
  }

  function hasEvidence(id) {
    return Boolean((state.notes[id] || '').trim() || (state.actions[id] || '').trim() ||
      (state.owner[id] || '').trim() || state.due[id] || (state.photos[id] || []).length);
  }

  function isExportable(item) { return state.status[item.id] === 'fail' || hasEvidence(item.id); }
  function statusLabel(status) { return status === 'comply' ? 'Cumple' : status === 'fail' ? 'No cumple' : status === 'na' ? 'N/A' : 'Pendiente'; }
  function badgeClass(category) { return category === 'Crítico' ? 'critical' : category === 'Mayor' || category === 'Mayor ICA' ? 'major' : ''; }
  function priority(item) {
    if (item.category === 'Crítico' || item.semCategory === 'Critico') return 0;
    if (item.category === 'Mayor' || item.category === 'Mayor ICA' || item.semCategory === 'Mayor') return 1;
    if (item.semCategory === 'Menor') return 2;
    return 3;
  }

  function calculate() {
    let crit = 0, may = 0, men = 0, points = 0, evidence = 0, reviewed = 0, failures = 0;
    DATA.forEach(item => {
      const status = state.status[item.id];
      if (status) reviewed++;
      if (status === 'fail') {
        failures++;
        points += Number(item.points || 0);
        if (item.semCount) {
          if (item.semCategory === 'Critico') crit++;
          if (item.semCategory === 'Mayor') may++;
          if (item.semCategory === 'Menor') men++;
        }
      }
      if (hasEvidence(item.id)) evidence++;
    });
    let label = 'CELEBRAR', className = 'celebrate', help = 'La operación está en verde';
    if (crit >= 3 || may >= 5) { label = 'APOYAR'; className = 'support'; help = 'Atiende primero los hallazgos críticos'; }
    else if (crit >= 1 || may >= 3 || men >= 6) { label = 'SUPERVISAR'; className = 'supervise'; help = 'Cierra las brechas prioritarias'; }
    const score = Math.max(0, 100 - points);
    $('icaScore').textContent = score;
    $('critCount').textContent = crit;
    $('mayCount').textContent = may;
    $('menCount').textContent = men;
    $('evCount').textContent = evidence;
    $('failCount').textContent = failures;
    $('progressBar').style.width = `${DATA.length ? reviewed / DATA.length * 100 : 0}%`;
    const progress = document.querySelector('.progress-track');
    progress.setAttribute('aria-valuenow', reviewed);
    const rsa = $('rsaStatus');
    rsa.className = `rsa-state ${className}`;
    rsa.querySelector('strong').textContent = label;
    $('statusHelp').textContent = help;
    $('routeMessage').textContent = crit ? `${crit} crítico${crit === 1 ? '' : 's'} por resolver` : may >= 3 ? 'Reduce hallazgos mayores' : 'Mantén los críticos en cero';
    return {crit, may, men, points, evidence, reviewed, failures, rsa: label, ica: score};
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const draft = {version: 3.1, status: state.status, notes: state.notes, actions: state.actions,
          owner: state.owner, due: state.due, meta: state.meta, updated_at: new Date().toISOString()};
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      } catch (error) { console.warn('No fue posible guardar el borrador', error); }
    }, 260);
  }

  function sanitizeAuditState() {
    const validIds = new Set(DATA.map(item => item.id));
    state.status = Object.fromEntries(Object.entries(state.status || {}).filter(([id, value]) => validIds.has(id) && ['comply','fail','na'].includes(value)));
    for (const key of ['notes','actions','owner','due']) {
      state[key] = Object.fromEntries(Object.entries(state[key] || {}).filter(([id]) => validIds.has(id)).map(([id, value]) => [id, String(value ?? '').slice(0, 5000)]));
    }
    state.photos = Object.fromEntries(Object.entries(state.photos || {}).filter(([id]) => validIds.has(id)).map(([id, photos]) => [id, (Array.isArray(photos) ? photos : []).filter(src => typeof src === 'string' && src.startsWith('data:image/')).slice(0, 6)]));
  }

  function loadDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!draft) return;
      for (const key of ['status','notes','actions','owner','due']) state[key] = draft[key] || {};
      state.meta = {...state.meta, ...(draft.meta || {})};
      sanitizeAuditState();
    } catch (error) { console.warn('Borrador inválido', error); }
  }

  function syncMetaToInputs() {
    for (const id of ['store','auditor','date','shift']) $(id).value = state.meta[id] || '';
  }

  function matchingItems() {
    const query = normalized(state.query).trim();
    return DATA.filter(item => {
      if (state.section !== 'Todas' && item.section !== state.section) return false;
      if (query && !normalized(`${item.question} ${item.context} ${item.code} ${item.category} ${item.section}`).includes(query)) return false;
      if (state.view === 'pending') return !state.status[item.id];
      if (state.view === 'fail') return state.status[item.id] === 'fail';
      if (state.view === 'evidence') return hasEvidence(item.id);
      return true;
    }).sort((a, b) => priority(a) - priority(b) || DATA.indexOf(a) - DATA.indexOf(b));
  }

  function renderSectionNav() {
    const sections = [...new Set(DATA.map(item => item.section))];
    $('sectionNav').innerHTML = sections.map(section => {
      const pending = DATA.filter(item => item.section === section && !state.status[item.id]).length;
      if (!pending && state.view === 'pending') return '';
      return `<button class="section-link ${state.section === section ? 'active' : ''}" type="button" data-section="${esc(section)}"><span>${esc(section.replace(' / ', ' · '))}</span><strong>${pending}</strong></button>`;
    }).join('');
  }

  function photoHtml(id) {
    return (state.photos[id] || []).filter(src => typeof src === 'string' && src.startsWith('data:image/')).map((src, index) =>
      `<span class="photo"><img src="${esc(src)}" alt="Evidencia ${index + 1}"><button type="button" data-action="remove-photo" data-index="${index}" aria-label="Eliminar foto">×</button></span>`).join('');
  }

  function itemHtml(item, expanded = false) {
    const status = state.status[item.id] || '';
    const contextOpen = state.ctx.has(item.id);
    const evidenceOpen = state.ev.has(item.id) || expanded || state.view !== 'pending';
    return `<article class="item ${status} ${isExportable(item) ? 'exportable' : ''}" data-id="${item.id}">
      <div class="priority-strip"><span>${priority(item) === 0 ? 'Prioridad alta' : 'Punto operativo'}</span><span>${esc(item.section)}</span></div>
      <div class="item-main">
        <div>
          <div class="item-code">${esc(item.id)} · ${esc(item.code)}</div>
          <div class="question">${esc(item.question)}</div>
          <div class="badges"><span class="badge ${badgeClass(item.category)}">${esc(item.category)}</span><span class="badge">${item.points} pts ICA</span>${item.semCount ? `<span class="badge">RSA · ${esc(item.semCategory)}</span>` : ''}${status ? `<span class="badge">${statusLabel(status)}</span>` : ''}</div>
          <div class="item-tools"><button class="text-button" type="button" data-action="context">${contextOpen ? 'Ocultar' : 'Ver'} criterio</button>${state.view !== 'pending' ? `<button class="text-button" type="button" data-action="evidence">${evidenceOpen ? 'Ocultar' : 'Documentar'} acción</button>` : ''}</div>
        </div>
        <div class="status-actions" aria-label="Evaluar punto">
          <button class="status-button comply ${status === 'comply' ? 'active' : ''}" data-action="status" data-status="comply" type="button"><span>✓</span>Cumple</button>
          <button class="status-button fail ${status === 'fail' ? 'active' : ''}" data-action="status" data-status="fail" type="button"><span>!</span>No cumple</button>
          <button class="status-button na ${status === 'na' ? 'active' : ''}" data-action="status" data-status="na" type="button"><span>—</span>No aplica</button>
        </div>
      </div>
      ${contextOpen ? `<div class="detail-panel"><strong>Criterio de evaluación</strong><p>${esc(item.context)}</p></div>` : ''}
      ${evidenceOpen ? `<div class="evidence-panel"><div class="evidence-grid">
        <label>Situación observada<textarea data-field="notes" placeholder="Describe lo observado…">${esc(state.notes[item.id] || '')}</textarea></label>
        <label>Acción correctiva<textarea data-field="actions" placeholder="Qué se corrigió o queda pendiente…">${esc(state.actions[item.id] || '')}</textarea></label>
        <div class="owner-stack"><label>Responsable<input data-field="owner" value="${esc(state.owner[item.id] || '')}" placeholder="Nombre"></label><label>Fecha compromiso<input data-field="due" type="date" value="${esc(state.due[item.id] || '')}"></label><label>Foto opcional<input class="photo-input" data-field="photos" type="file" accept="image/*" capture="environment" multiple></label><div class="photo-preview">${photoHtml(item.id)}</div></div>
      </div></div>` : ''}
    </article>`;
  }

  function render() {
    calculate();
    renderSectionNav();
    let rows = matchingItems();
    if (!rows.length && state.view === 'pending' && state.section !== 'Todas' && DATA.some(item => !state.status[item.id])) {
      state.section = 'Todas';
      renderSectionNav();
      rows = matchingItems();
    }
    $('routeComplete').hidden = rows.length !== 0;
    if (state.printMode) {
      const printable = DATA.filter(isExportable);
      const groups = {};
      printable.forEach(item => (groups[item.section] ??= []).push(item));
      $('items').innerHTML = Object.entries(groups).map(([section, items]) => `<div class="group-title">${esc(section)}</div>${items.map(item => itemHtml(item, true)).join('')}`).join('');
    } else {
      $('items').innerHTML = rows[0] ? itemHtml(rows[0]) : '';
    }
    const pending = DATA.filter(item => !state.status[item.id]).length;
    const current = rows[0];
    $('pendingSummary').textContent = current ? `${pending} pendientes · ahora: ${current.section}` : pending ? 'Cambia de área para continuar.' : 'Recorrido completo. Revisa hallazgos o genera el reporte.';
    $('undoBtn').disabled = history.length === 0;
  }

  async function compressImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen');
    if (file.size > 12 * 1024 * 1024) throw new Error('La imagen supera 12 MB');
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url; });
      const ratio = Math.min(1, 1400 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', .78);
    } finally { URL.revokeObjectURL(url); }
  }

  async function addPhotos(id, files) {
    const current = state.photos[id] || [];
    const selected = [...files].slice(0, Math.max(0, 6 - current.length));
    try {
      for (const file of selected) current.push(await compressImage(file));
      state.photos[id] = current; state.ev.add(id); scheduleSave(); render();
      toast(`${selected.length} foto(s) optimizada(s)`);
    } catch (error) { toast(error.message); }
  }

  function exportPayload() {
    return {schema_version: 3.1, exported_at: new Date().toISOString(), audit: {...state.meta, result: calculate()},
      audit_state: {status: state.status, notes: state.notes, actions: state.actions, owner: state.owner, due: state.due, photos: state.photos},
      records: DATA.filter(isExportable).map(item => ({id:item.id, code:item.code, question:item.question, category:item.category,
        status:statusLabel(state.status[item.id]), ica_points:state.status[item.id] === 'fail' ? item.points : 0,
        rsa:state.status[item.id] === 'fail' && item.semCount ? item.semCategory : 'No cuenta', comment:state.notes[item.id] || '',
        corrective_action:state.actions[item.id] || '', owner:state.owner[item.id] || '', due_date:state.due[item.id] || '', photos:state.photos[item.id] || [], context:item.context}))};
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], {type:'application/json'});
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = `RSA_${(state.meta.store || 'auditoria').replace(/[^a-z0-9_-]+/gi, '_')}_${state.meta.date || today()}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 500); toast('Respaldo generado');
  }

  async function importJson(file) {
    try {
      const payload = JSON.parse(await file.text()); const imported = payload.audit_state;
      if (!imported || typeof imported !== 'object') throw new Error('El respaldo no contiene una auditoría compatible');
      for (const key of ['status','notes','actions','owner','due','photos']) state[key] = imported[key] || {};
      sanitizeAuditState();
      const audit = payload.audit || {};
      state.meta = {store:audit.store || audit.tienda || '', auditor:audit.auditor || '', date:audit.date || audit.fecha || today(), shift:['Apertura','Intermedio','Cierre'].includes(audit.shift || audit.turno) ? (audit.shift || audit.turno) : 'Apertura'};
      state.ctx.clear(); state.ev.clear(); history.length = 0; syncMetaToInputs(); scheduleSave(); render(); toast('Auditoría restaurada');
    } catch (error) { toast(error.message); }
  }

  function printSmart() {
    if (!DATA.some(isExportable)) { toast('Documenta un hallazgo o evidencia para generar el reporte'); return; }
    state.printMode = true; render(); document.body.classList.add('pdf-mode');
    setTimeout(() => { window.print(); document.body.classList.remove('pdf-mode'); state.printMode = false; render(); }, 120);
  }

  function clearAudit() {
    if (!confirm('¿Iniciar una auditoría nueva? Se eliminará el borrador actual.')) return;
    for (const key of ['status','notes','actions','owner','due','photos']) state[key] = {};
    state.ctx.clear(); state.ev.clear(); history.length = 0; state.query = ''; state.section = 'Todas'; state.view = 'pending';
    state.meta = {store:'', auditor:'', date:today(), shift:'Apertura'};
    localStorage.removeItem(STORAGE_KEY); $('search').value = ''; $('viewFilter').value = 'pending'; syncMetaToInputs(); render(); toast('Nueva auditoría lista');
  }

  function setStatus(id, next) {
    history.push({id, previous: state.status[id] || ''});
    if (history.length > 20) history.shift();
    state.status[id] = next;
    if (next === 'fail') state.ev.add(id);
    scheduleSave(); render();
    toast(next === 'comply' ? 'Punto completado' : next === 'fail' ? 'Hallazgo enviado a Corregir' : 'Punto marcado como no aplicable');
  }

  function undo() {
    const last = history.pop(); if (!last) return;
    if (last.previous) state.status[last.id] = last.previous; else delete state.status[last.id];
    scheduleSave(); render(); toast('Última respuesta restaurada');
  }

  function bindEvents() {
    $('search').addEventListener('input', event => { state.query = event.target.value; render(); });
    $('viewFilter').addEventListener('change', event => { state.view = event.target.value; state.section = 'Todas'; render(); });
    $('sectionNav').addEventListener('click', event => { const button = event.target.closest('[data-section]'); if (!button) return; state.section = button.dataset.section; render(); });
    $('resetRoute').addEventListener('click', () => { state.section = 'Todas'; state.query = ''; $('search').value = ''; render(); });
    $('undoBtn').addEventListener('click', undo);
    $('reviewFailsBtn').addEventListener('click', () => { state.view = 'fail'; state.section = 'Todas'; $('viewFilter').value = 'fail'; render(); $('recorrido').scrollIntoView({behavior:'smooth'}); });
    $('items').addEventListener('click', event => {
      const button = event.target.closest('button[data-action]'); if (!button) return;
      const id = button.closest('[data-id]')?.dataset.id; if (!id) return;
      if (button.dataset.action === 'status') setStatus(id, button.dataset.status);
      else if (button.dataset.action === 'context') { state.ctx.has(id) ? state.ctx.delete(id) : state.ctx.add(id); render(); }
      else if (button.dataset.action === 'evidence') { state.ev.has(id) ? state.ev.delete(id) : state.ev.add(id); render(); }
      else if (button.dataset.action === 'remove-photo') { state.photos[id].splice(Number(button.dataset.index), 1); scheduleSave(); render(); }
    });
    $('items').addEventListener('input', event => { const field = event.target.dataset.field; const id = event.target.closest('[data-id]')?.dataset.id; if (!id || !['notes','actions','owner','due'].includes(field)) return; state[field][id] = event.target.value; scheduleSave(); calculate(); });
    $('items').addEventListener('change', event => { const id = event.target.closest('[data-id]')?.dataset.id; if (id && event.target.dataset.field === 'photos') addPhotos(id, event.target.files); });
    for (const id of ['store','auditor','date','shift']) $(id).addEventListener('input', event => { state.meta[id] = event.target.value; scheduleSave(); });
    $('printBtn').addEventListener('click', printSmart); $('clearBtn').addEventListener('click', clearAudit); $('exportJsonBtn').addEventListener('click', downloadJson);
    $('importJsonBtn').addEventListener('click', () => $('importJsonFile').click());
    $('importJsonFile').addEventListener('change', event => { if (event.target.files[0]) importJson(event.target.files[0]); event.target.value = ''; });
    document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('search').focus(); } });
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) document.querySelectorAll('.main-nav a').forEach(link => link.setAttribute('aria-current', link.getAttribute('href') === `#${entry.target.id}` ? 'true' : 'false')); }), {rootMargin:'-20% 0px -70%'});
    document.querySelectorAll('.section-anchor').forEach(section => observer.observe(section));
  }

  function validateData(items) {
    if (!Array.isArray(items) || items.length === 0) throw new Error('La base del checklist está vacía');
    const ids = new Set();
    items.forEach((item, index) => { if (!item.id || !item.question || !item.category || !item.section) throw new Error(`Registro inválido en posición ${index + 1}`); if (ids.has(item.id)) throw new Error(`ID duplicado: ${item.id}`); ids.add(item.id); });
    return items;
  }

  async function loadData() {
    let response;
    try { response = await fetch('/api/checklist', {cache:'no-store'}); if (!response.ok) throw new Error(); }
    catch { response = await fetch('./data/checklist.json', {cache:'no-store'}); }
    const payload = await response.json(); return validateData(payload.items || payload);
  }

  async function start() {
    try {
      DATA = await loadData(); state.meta.date = today(); loadDraft(); syncMetaToInputs(); bindEvents(); render();
      if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.warn));
    } catch (error) { document.body.innerHTML = `<main class="fatal"><h1>No fue posible cargar RSA Digital</h1><p>${esc(error.message)}</p></main>`; console.error(error); }
  }
  start();
})();
