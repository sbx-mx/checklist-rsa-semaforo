(() => {
  'use strict';

  const STORAGE_KEY = 'rsa-digital-draft-v3';
  let DATA = [];
  let saveTimer;
  let activeId = null;
  let modalOriginalStatus = '';
  let modalCriterionOpen = false;
  let modalEvidenceOpen = false;
  const history = [];
  const state = {
    status: {}, notes: {}, actions: {}, owner: {}, due: {}, photos: {},
    query: '', section: 'Todas', view: 'pending', printMode: false,
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

  function statusLabel(status) { return status === 'comply' ? 'Cumple' : status === 'fail' ? 'No cumple' : status === 'na' ? 'No aplica' : 'Pendiente'; }
  function badgeClass(category) { return category === 'Crítico' ? 'critical' : category === 'Mayor' || category === 'Mayor ICA' ? 'major' : ''; }
  function priority(item) {
    const section = item.section;
    if (section.startsWith('Críticos')) return 0;
    if (section.startsWith('Riesgo Inminente')) return 1;
    if (section.startsWith('Mayores RSA / ICA')) return 2;
    if (section.startsWith('Mayores RSA')) return 3;
    if (section.startsWith('Mayores ICA')) return 4;
    if (section.startsWith('Menores RSA')) return 5;
    return 6;
  }

  function priorityLabel(item) {
    if (priority(item) === 0) return 'Protege el semáforo';
    if (priority(item) === 1) return 'Riesgo operativo';
    if (priority(item) <= 3) return 'Impacto RSA';
    return 'Control operativo';
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
    if (crit >= 3 || may >= 5) { label = 'APOYAR'; className = 'support'; help = 'Resuelve críticos antes de continuar'; }
    else if (crit >= 1 || may >= 3 || men >= 6) { label = 'SUPERVISAR'; className = 'supervise'; help = 'Cierra las brechas prioritarias'; }
    const score = Math.max(0, 100 - points);
    $('icaScore').textContent = score;
    $('critCount').textContent = crit;
    $('mayCount').textContent = may;
    $('menCount').textContent = men;
    $('evCount').textContent = evidence;
    $('failCount').textContent = failures;
    $('progressBar').style.width = `${DATA.length ? reviewed / DATA.length * 100 : 0}%`;
    document.querySelector('.progress-track').setAttribute('aria-valuenow', reviewed);
    const rsa = $('rsaStatus');
    rsa.className = `rsa-state ${className}`;
    rsa.querySelector('strong').textContent = label;
    $('statusHelp').textContent = help;
    $('routeMessage').textContent = label === 'CELEBRAR' ? 'Semáforo Celebrar' : `${failures} oportunidad${failures === 1 ? '' : 'es'} activa${failures === 1 ? '' : 's'}`;
    const goal = $('greenGoal');
    goal.className = `green-goal ${className}`;
    goal.querySelector('small').textContent = crit ? `Resuelve ${crit} crítico${crit === 1 ? '' : 's'} para volver a verde.` : may >= 3 ? `Reduce mayores a 2 o menos para Celebrar.` : men >= 6 ? `Reduce menores a 5 o menos para Celebrar.` : 'Mantén críticos en 0 y mayores en máximo 2.';
    return {crit, may, men, points, evidence, reviewed, failures, rsa: label, ica: score};
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const draft = {version: 3.3, status: state.status, notes: state.notes, actions: state.actions,
          owner: state.owner, due: state.due, meta: state.meta, updated_at: new Date().toISOString()};
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      } catch (error) { console.warn('No fue posible guardar el borrador', error); }
    }, 240);
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

  function syncMetaToInputs() { for (const id of ['store','auditor','date','shift']) $(id).value = state.meta[id] || ''; }

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

  function viewCount(section) {
    return DATA.filter(item => (section === 'Todas' || item.section === section) &&
      (state.view === 'pending' ? !state.status[item.id] : state.view === 'fail' ? state.status[item.id] === 'fail' : hasEvidence(item.id))).length;
  }

  function renderSectionNav() {
    const sections = [...new Set(DATA.map(item => item.section))];
    const allCount = viewCount('Todas');
    $('sectionNav').innerHTML = `<button class="area-option ${state.section === 'Todas' ? 'active' : ''}" type="button" data-section="Todas"><span><strong>Ruta priorizada</strong><small>Mayor impacto primero</small></span><b>${allCount}</b></button>` +
      sections.map(section => {
        const count = viewCount(section);
        return `<button class="area-option ${state.section === section ? 'active' : ''}" type="button" data-section="${esc(section)}"><span><strong>${esc(section.replace(' / ', ' · '))}</strong><small>${priority(DATA.find(item => item.section === section)) <= 3 ? 'Impacto directo en el objetivo' : 'Control ICA'}</small></span><b>${count}</b></button>`;
      }).join('');
    $('activeAreaLabel').textContent = state.section === 'Todas' ? 'Ruta priorizada' : state.section.replace(' / ', ' · ');
    $('activeAreaCount').textContent = viewCount(state.section);
  }

  function photoHtml(id) {
    return (state.photos[id] || []).filter(src => typeof src === 'string' && src.startsWith('data:image/')).map((src, index) =>
      `<span class="photo"><img src="${esc(src)}" alt="Evidencia ${index + 1}"><button type="button" data-action="remove-photo" data-index="${index}" aria-label="Eliminar foto">×</button></span>`).join('');
  }

  function itemHtml(item) {
    const status = state.status[item.id] || '';
    const action = state.view === 'fail' ? 'Revisar oportunidad' : status ? 'Revisar detalle' : 'Más opciones';
    return `<article class="item ${status}" data-id="${item.id}">
      <div class="priority-strip"><span>${priorityLabel(item)}</span><span>${esc(item.section)}</span></div>
      <div class="item-main">
        <div><div class="item-code">${esc(item.id)} · ${esc(item.code)}</div><div class="question">${esc(item.question)}</div>
        <div class="badges"><span class="badge ${badgeClass(item.category)}">${esc(item.category)}</span><span class="badge">${item.points} pts ICA</span>${item.semCount ? `<span class="badge">RSA · ${esc(item.semCategory)}</span>` : ''}${status ? `<span class="badge status-${status}">${statusLabel(status)}</span>` : ''}</div></div>
        <div class="fast-actions">${state.view !== 'evidence' ? `<button class="quick-comply" type="button" data-action="quick-comply"><span>✓</span><strong>${state.view === 'fail' ? 'Corregido: cumple' : 'Cumple y siguiente'}</strong></button>` : ''}<button class="open-evaluation" type="button" data-action="open"><strong>${action}</strong><small>No cumple · No aplica · Evidencia</small></button></div>
      </div>
    </article>`;
  }

  function modalHtml(item) {
    const status = state.status[item.id] || '';
    const isComply = status === 'comply';
    return `<article class="modal-point" data-id="${item.id}">
      <header class="modal-point-head"><div><div class="item-code">${esc(item.id)} · ${esc(item.code)}</div><h2 id="modalQuestion">${esc(item.question)}</h2><div class="badges"><span class="badge ${badgeClass(item.category)}">${esc(item.category)}</span><span class="badge">${item.points} pts ICA</span>${item.semCount ? `<span class="badge">RSA · ${esc(item.semCategory)}</span>` : ''}</div></div><div class="impact-card"><span>Impacto</span><strong>${priorityLabel(item)}</strong><small>${item.semCount ? `Puede sumar 1 ${esc(item.semCategory)} al semáforo.` : `Puede restar ${item.points} puntos ICA.`}</small></div></header>
      <section class="modal-decision"><div><span class="modal-section-label">1 · Decide</span><h3>¿Qué observaste?</h3></div><div class="modal-status-actions">
        <button class="modal-status comply ${status === 'comply' ? 'active' : ''}" data-modal-status="comply" type="button"><span>✓</span><strong>Cumple</strong><small>La práctica está asegurada</small></button>
        <button class="modal-status fail ${status === 'fail' ? 'active' : ''}" data-modal-status="fail" type="button"><span>!</span><strong>No cumple</strong><small>Requiere corrección</small></button>
        <button class="modal-status na ${status === 'na' ? 'active' : ''}" data-modal-status="na" type="button"><span>—</span><strong>No aplica</strong><small>No corresponde observarlo</small></button>
      </div></section>
      <div class="optional-controls"><span>Información adicional</span><div><button class="optional-toggle ${modalCriterionOpen ? 'active' : ''}" type="button" data-modal-toggle="criterion" aria-expanded="${modalCriterionOpen}"><span>i</span><strong>${modalCriterionOpen ? 'Ocultar criterio' : 'Ver criterio'}</strong></button><button class="optional-toggle ${modalEvidenceOpen ? 'active' : ''}" type="button" data-modal-toggle="evidence" aria-expanded="${modalEvidenceOpen}"><span>＋</span><strong>${modalEvidenceOpen ? 'Ocultar evidencia' : 'Agregar evidencia'}</strong>${hasEvidence(item.id) ? '<b>Guardada</b>' : ''}</button></div></div>
      ${modalCriterionOpen ? `<section class="criterion-card"><span>Criterio de evaluación</span><p>${esc(item.context)}</p></section>` : ''}
      ${modalEvidenceOpen ? `<section class="modal-evidence"><div class="evidence-heading"><div><span class="modal-section-label">2 · Documenta</span><h3>Evidencia ${isComply ? 'del cumplimiento' : 'de la observación'}</h3><p>Opcional en cualquier respuesta. Úsala para reconocer, corregir o dar seguimiento.</p></div><span class="evidence-tag">Foto opcional</span></div>
        <div class="evidence-grid"><label>Situación observada<textarea data-field="notes" placeholder="${isComply ? 'Describe la práctica correcta…' : 'Describe lo observado…'}">${esc(state.notes[item.id] || '')}</textarea></label><label>Acción o seguimiento<textarea data-field="actions" placeholder="${isComply ? 'Cómo se mantendrá este estándar…' : 'Qué se corrigió o queda pendiente…'}">${esc(state.actions[item.id] || '')}</textarea></label>
        <div class="owner-stack"><label>Responsable<input data-field="owner" value="${esc(state.owner[item.id] || '')}" placeholder="Nombre"></label><label>Fecha compromiso<input data-field="due" type="date" value="${esc(state.due[item.id] || '')}"></label><label class="photo-label"><span>Agregar evidencia</span><input class="photo-input" data-field="photos" type="file" accept="image/*" capture="environment" multiple></label><div class="photo-preview">${photoHtml(item.id)}</div></div></div>
      </section>` : ''}
    </article>`;
  }

  function opportunityHtml(item) {
    return `<article class="print-opportunity"><div class="priority-strip"><span>${priorityLabel(item)}</span><span>${esc(item.section)}</span></div><div class="print-opportunity-body"><div class="item-code">${esc(item.id)} · ${esc(item.code)}</div><h2>${esc(item.question)}</h2><div class="print-grid"><div><span>Situación observada</span><p>${esc(state.notes[item.id] || 'Sin detalle registrado')}</p></div><div><span>Acción correctiva</span><p>${esc(state.actions[item.id] || 'Pendiente de documentar')}</p></div><div><span>Responsable</span><p>${esc(state.owner[item.id] || 'Por asignar')}</p></div><div><span>Fecha compromiso</span><p>${esc(state.due[item.id] || 'Por definir')}</p></div></div></div></article>`;
  }

  function renderModalContent() {
    if (!activeId) return;
    const item = DATA.find(row => row.id === activeId);
    if (!item) return;
    $('modalProgress').textContent = `${item.section} · ${item.id}`;
    $('modalContent').innerHTML = modalHtml(item);
  }

  function openEvaluation(id) {
    activeId = id;
    modalOriginalStatus = state.status[id] || '';
    modalCriterionOpen = false;
    modalEvidenceOpen = state.status[id] === 'fail' || hasEvidence(id);
    renderModalContent();
    const modal = $('evaluationModal');
    if (!modal.open) modal.showModal();
  }

  function finalizeModal(requireStatus = false) {
    if (!activeId) return;
    const next = state.status[activeId] || '';
    if (requireStatus && !next) { toast('Selecciona Cumple, No cumple o No aplica'); return; }
    if (next !== modalOriginalStatus) {
      history.push({id: activeId, previous: modalOriginalStatus});
      if (history.length > 20) history.shift();
    }
    scheduleSave();
    const completed = activeId;
    activeId = null;
    $('evaluationModal').close();
    render();
    if (next) toast(next === 'comply' ? 'Cumplimiento registrado' : next === 'fail' ? 'Oportunidad enviada a Corregir' : 'Punto marcado como no aplicable');
    else toast(`Punto ${completed} guardado sin respuesta`);
  }

  function render() {
    calculate();
    renderSectionNav();
    let rows = matchingItems();
    if (!rows.length && state.view === 'pending' && state.section !== 'Todas' && DATA.some(item => !state.status[item.id])) {
      state.section = 'Todas'; renderSectionNav(); rows = matchingItems();
    }
    $('routeComplete').hidden = rows.length !== 0;
    if (state.printMode) {
      const opportunities = DATA.filter(item => state.status[item.id] === 'fail').sort((a, b) => priority(a) - priority(b));
      $('items').innerHTML = opportunities.map(opportunityHtml).join('');
    } else {
      $('items').innerHTML = rows[0] ? itemHtml(rows[0]) : '';
    }
    const pending = DATA.filter(item => !state.status[item.id]).length;
    const current = rows[0];
    $('pendingSummary').textContent = current ? `${pending} pendientes · ${priorityLabel(current)} · ${current.section}` : pending ? 'Selecciona otra área para continuar.' : 'Recorrido completo. Revisa oportunidades o exporta el resumen.';
    $('undoBtn').disabled = history.length === 0;
    $('modeBanner').hidden = state.view !== 'fail';
  }

  async function compressImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen');
    if (file.size > 12 * 1024 * 1024) throw new Error('La imagen supera 12 MB');
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url; });
      const ratio = Math.min(1, 1400 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', .78);
    } finally { URL.revokeObjectURL(url); }
  }

  async function addPhotos(id, files) {
    const current = state.photos[id] || [];
    const selected = [...files].slice(0, Math.max(0, 6 - current.length));
    try {
      for (const file of selected) current.push(await compressImage(file));
      state.photos[id] = current; scheduleSave(); renderModalContent(); calculate(); toast(`${selected.length} foto(s) optimizada(s)`);
    } catch (error) { toast(error.message); }
  }

  function exportPayload() {
    const result = calculate();
    const opportunities = DATA.filter(item => state.status[item.id] === 'fail').sort((a, b) => priority(a) - priority(b)).map(item => ({
      id:item.id, code:item.code, area:item.section, priority:priorityLabel(item), opportunity:item.question,
      ica_points:item.points, rsa:item.semCount ? item.semCategory : 'No cuenta', observation:state.notes[item.id] || '',
      corrective_action:state.actions[item.id] || '', owner:state.owner[item.id] || '', due_date:state.due[item.id] || '', photos:state.photos[item.id] || []
    }));
    return {schema_version:3.3, exported_at:new Date().toISOString(), summary:{store:state.meta.store, auditor:state.meta.auditor, date:state.meta.date, shift:state.meta.shift, ica:result.ica, rsa_status:result.rsa, critical:result.crit, major:result.may, minor:result.men, opportunity_count:opportunities.length}, opportunities,
      audit_state:{status:state.status, notes:state.notes, actions:state.actions, owner:state.owner, due:state.due, photos:state.photos}};
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], {type:'application/json'});
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = `RSA_${(state.meta.store || 'auditoria').replace(/[^a-z0-9_-]+/gi, '_')}_${state.meta.date || today()}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 500); toast('Respaldo resumido generado');
  }

  async function importJson(file) {
    try {
      const payload = JSON.parse(await file.text()); const imported = payload.audit_state;
      if (!imported || typeof imported !== 'object') throw new Error('El respaldo no contiene una auditoría compatible');
      for (const key of ['status','notes','actions','owner','due','photos']) state[key] = imported[key] || {};
      sanitizeAuditState();
      const audit = payload.summary || payload.audit || {};
      state.meta = {store:audit.store || audit.tienda || '', auditor:audit.auditor || '', date:audit.date || audit.fecha || today(), shift:['Apertura','Intermedio','Cierre'].includes(audit.shift || audit.turno) ? (audit.shift || audit.turno) : 'Apertura'};
      history.length = 0; state.view = 'pending'; state.section = 'Todas'; syncMetaToInputs(); scheduleSave(); render(); toast('Auditoría restaurada');
    } catch (error) { toast(error.message); }
  }

  function populatePrintSummary() {
    const result = calculate();
    $('printStore').textContent = state.meta.store || 'Sin registrar'; $('printAuditor').textContent = state.meta.auditor || 'Sin registrar';
    $('printDate').textContent = state.meta.date || 'Sin registrar'; $('printShift').textContent = state.meta.shift || 'Sin registrar';
    $('printResult').textContent = `ICA ${result.ica} · ${result.rsa}`;
    $('printOpportunityCount').textContent = `${result.failures} oportunidad${result.failures === 1 ? '' : 'es'} priorizada${result.failures === 1 ? '' : 's'}`;
  }

  function printSmart() {
    populatePrintSummary(); state.printMode = true; document.body.classList.add('print-mode'); render();
    setTimeout(() => { window.print(); document.body.classList.remove('print-mode'); state.printMode = false; render(); }, 120);
  }

  function clearAudit() {
    if (!confirm('¿Iniciar una auditoría nueva? Se eliminará el borrador actual.')) return;
    for (const key of ['status','notes','actions','owner','due','photos']) state[key] = {};
    history.length = 0; state.query = ''; state.section = 'Todas'; state.view = 'pending';
    state.meta = {store:'', auditor:'', date:today(), shift:'Apertura'};
    localStorage.removeItem(STORAGE_KEY); $('search').value = ''; $('viewFilter').value = 'pending'; syncMetaToInputs(); render(); toast('Nueva auditoría lista');
  }

  function undo() {
    const last = history.pop(); if (!last) return;
    if (last.previous) state.status[last.id] = last.previous; else delete state.status[last.id];
    scheduleSave(); render(); toast('Última respuesta restaurada');
  }

  function quickComply(id) {
    const previous = state.status[id] || '';
    if (previous !== 'comply') {
      history.push({id, previous});
      if (history.length > 20) history.shift();
      state.status[id] = 'comply';
    }
    scheduleSave(); render(); toast(state.view === 'fail' ? 'Oportunidad corregida' : 'Cumple · siguiente punto listo');
  }

  function returnToRoute() {
    state.view = 'pending'; state.section = 'Todas'; state.query = ''; $('viewFilter').value = 'pending'; $('search').value = ''; render(); $('recorrido').scrollIntoView({behavior:'smooth', block:'start'});
  }

  function bindEvents() {
    $('search').addEventListener('input', event => { state.query = event.target.value; render(); });
    $('viewFilter').addEventListener('change', event => { state.view = event.target.value; state.section = 'Todas'; render(); });
    $('sectionNav').addEventListener('click', event => { const button = event.target.closest('[data-section]'); if (!button) return; state.section = button.dataset.section; $('areaMenu').open = false; render(); });
    $('undoBtn').addEventListener('click', undo);
    $('backToRouteBtn').addEventListener('click', returnToRoute);
    $('reviewFailsBtn').addEventListener('click', () => { state.view = 'fail'; state.section = 'Todas'; state.query = ''; $('search').value = ''; $('viewFilter').value = 'fail'; render(); $('recorrido').scrollIntoView({behavior:'smooth', block:'start'}); });
    $('items').addEventListener('click', event => {
      const button = event.target.closest('button[data-action]'); if (!button) return;
      const id = button.closest('[data-id]')?.dataset.id; if (!id) return;
      if (button.dataset.action === 'quick-comply') quickComply(id);
      else if (button.dataset.action === 'open') openEvaluation(id);
    });
    $('evaluationModal').addEventListener('click', event => {
      const modalStatus = event.target.closest('[data-modal-status]');
      if (modalStatus && activeId) { state.status[activeId] = modalStatus.dataset.modalStatus; if (modalStatus.dataset.modalStatus === 'fail') modalEvidenceOpen = true; scheduleSave(); renderModalContent(); calculate(); return; }
      const toggle = event.target.closest('[data-modal-toggle]');
      if (toggle && activeId) { if (toggle.dataset.modalToggle === 'criterion') modalCriterionOpen = !modalCriterionOpen; else modalEvidenceOpen = !modalEvidenceOpen; renderModalContent(); return; }
      const remove = event.target.closest('[data-action="remove-photo"]');
      if (remove && activeId) { state.photos[activeId].splice(Number(remove.dataset.index), 1); scheduleSave(); renderModalContent(); calculate(); return; }
      if (event.target === $('evaluationModal')) finalizeModal(false);
    });
    $('evaluationModal').addEventListener('input', event => { const field = event.target.dataset.field; if (!activeId || !['notes','actions','owner','due'].includes(field)) return; state[field][activeId] = event.target.value; scheduleSave(); calculate(); });
    $('evaluationModal').addEventListener('change', event => { if (activeId && event.target.dataset.field === 'photos') addPhotos(activeId, event.target.files); });
    $('evaluationModal').addEventListener('cancel', event => { event.preventDefault(); finalizeModal(false); });
    $('modalCloseBtn').addEventListener('click', () => finalizeModal(false)); $('saveContinueBtn').addEventListener('click', () => finalizeModal(true));
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
