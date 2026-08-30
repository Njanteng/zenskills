// ===================== API helper =====================
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    return new Promise(() => {}); // stoppe l'exécution du code appelant, la redirection est en cours
  }
  if (!res.ok) {
    let msg = 'Une erreur est survenue';
    try { const body = await res.json(); msg = body.error || msg; } catch (e) {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

function toast(message, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function esc(str) {
  return (str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function starsDisplay(n) {
  if (!n) return '';
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

// Formate la date de dernière révision en texte relatif court.
function revisionLabel(dateStr) {
  if (!dateStr) return 'Jamais révisé';
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 0) return "Révisé aujourd'hui";
  if (days === 1) return 'Révisé hier';
  if (days < 30) return `Révisé il y a ${days} jours`;
  const months = Math.round(days / 30);
  if (months < 12) return `Révisé il y a ${months} mois`;
  const years = Math.round(months / 12);
  return `Révisé il y a ${years} an${years > 1 ? 's' : ''}`;
}

function showSpinner(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
}

// Désactive un bouton de soumission le temps de la requête, avec un libellé "en cours".
async function withButtonLoading(button, loadingLabel, task) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.innerHTML = `<span class="spinner spinner-sm" style="display:inline-block;vertical-align:-2px;margin-right:6px"></span>${loadingLabel}`;
  try {
    await task();
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

// ===================== State =====================
const state = {
  categories: [],
  formats: [],
  allCompetences: [],
  allCours: [],
  allParcours: [],
  allProjets: [],
  page: { cours: 1, parcours: 1, competences: 1, projets: 1, taches: 1 },
  filters: {
    cours: { search: '', statut: '', type: '', categorie: '', format: '', niveau: '', competence: '' },
    parcours: { search: '', statut: '' },
    competences: { search: '', cours: '' },
    projets: { search: '', statut: '' },
    taches: { search: '', statut: '' }
  }
};

// ===================== Navigation =====================
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'cours') loadCours();
  if (tab === 'parcours') loadParcours();
  if (tab === 'competences') loadCompetences();
  if (tab === 'projets') loadProjets();
  if (tab === 'taches') loadTaches();
}

// ===================== Modal helpers =====================
const overlay = document.getElementById('modal-overlay');
const modal = document.getElementById('modal');

function openModal(html) {
  modal.innerHTML = html;
  overlay.classList.add('active');
}

function closeModal() {
  overlay.classList.remove('active');
  modal.innerHTML = '';
}

overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

// ===================== Shared reference data =====================
async function loadReferenceData() {
  const [cats, formats, comps] = await Promise.all([
    api('/api/cours/categories'),
    api('/api/cours/formats'),
    api('/api/competences/all')
  ]);
  state.categories = cats;
  state.formats = formats;
  state.allCompetences = comps;

  const catSelect = document.getElementById('filter-cours-categorie');
  catSelect.innerHTML = '<option value="">Catégorie : toutes</option>' +
    cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

  const formatSelect = document.getElementById('filter-cours-format');
  formatSelect.innerHTML = '<option value="">Format : tous</option>' +
    formats.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('');

  const compFilterSelect = document.getElementById('filter-cours-competence');
  compFilterSelect.innerHTML = '<option value="">Compétence : toutes</option>' +
    comps.map(c => `<option value="${c.id}">${esc(c.nom)}</option>`).join('');
}

async function refreshAllCoursCache() {
  const res = await api('/api/cours?page=1');
  let all = res.data.slice();
  for (let p = 2; p <= res.totalPages; p++) {
    const r = await api(`/api/cours?page=${p}`);
    all = all.concat(r.data);
  }
  state.allCours = all;

  const coursFilterSelect = document.getElementById('filter-competences-cours');
  coursFilterSelect.innerHTML = '<option value="">Cours : tous</option>' +
    all.map(c => `<option value="${c.id}">${esc(c.titre)}</option>`).join('');
}

async function refreshAllCompetencesCache() {
  state.allCompetences = await api('/api/competences/all');
  const compFilterSelect = document.getElementById('filter-cours-competence');
  const current = compFilterSelect.value;
  compFilterSelect.innerHTML = '<option value="">Compétence : toutes</option>' +
    state.allCompetences.map(c => `<option value="${c.id}">${esc(c.nom)}</option>`).join('');
  compFilterSelect.value = current;
}

async function refreshAllParcoursCache() {
  state.allParcours = await api('/api/parcours/all');
}

async function refreshAllProjetsCache() {
  state.allProjets = await api('/api/projets/all');
}

// ===================== Dashboard =====================
async function loadDashboard() {
  document.getElementById('stats-grid').innerHTML = Array(4).fill(`
    <div class="stat-card">
      <div class="skeleton" style="height:11px;width:60px;margin-bottom:12px"></div>
      <div class="skeleton" style="height:26px;width:80px;margin-bottom:12px"></div>
      <div class="skeleton" style="height:3px;width:100%"></div>
    </div>`).join('');
  showSpinner('dashboard-competences');
  showSpinner('dashboard-parcours');

  const data = await api('/api/dashboard');

  const cards = [
    { label: 'Cours', ...data.cours },
    { label: 'Parcours', ...data.parcours },
    { label: 'Projets', ...data.projets },
    { label: 'Compétences', ...data.competences }
  ];

  document.getElementById('stats-grid').innerHTML = cards.map(c => {
    const pct = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
    return `
      <div class="stat-card">
        <div class="stat-label">${c.label}</div>
        <div class="stat-value">${c.done}<span class="stat-total"> / ${c.total}</span></div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
  }).join('');

  const arHeader = document.getElementById('a-revoir-header');
  const arContainer = document.getElementById('dashboard-a-revoir');
  if (!data.aRevoir || data.aRevoir.length === 0) {
    arHeader.style.display = 'none';
    arContainer.innerHTML = '';
  } else {
    arHeader.style.display = '';
    arContainer.innerHTML = data.aRevoir.map(item => `
      <div class="ar-item">
        <div class="ar-main">
          <div class="ar-title">${esc(item.nom)}</div>
          <div class="ar-meta">
            <span class="tag ${item.type === 'cours' ? 'format' : 'competence'}">${item.type === 'cours' ? 'Cours' : 'Compétence'}</span>
            ${revisionLabel(item.derniere_revision)}
          </div>
        </div>
        <button class="btn btn-sm btn-reviser" data-type="${item.type}" data-id="${item.id}">Réviser aujourd'hui</button>
      </div>
    `).join('');

    arContainer.querySelectorAll('.btn-reviser').forEach(btn => {
      btn.addEventListener('click', async () => {
        const endpoint = btn.dataset.type === 'cours' ? '/api/cours' : '/api/competences';
        try {
          await api(`${endpoint}/${btn.dataset.id}/revision`, { method: 'PATCH' });
          toast('Révision enregistrée.');
          loadDashboard();
        } catch (err) { toast(err.message, true); }
      });
    });
  }

  const compContainer = document.getElementById('dashboard-competences');
  compContainer.innerHTML = data.competencesAcquises.length === 0
    ? '<span class="list-empty" style="padding:0">Aucune compétence acquise pour le moment.</span>'
    : data.competencesAcquises.map(k => `
        <div class="dashboard-competence-item">
          <span class="tag competence">${esc(k.nom)}</span>
          ${k.niveau_maitrise ? `<div class="stars-mini">${starsDisplay(k.niveau_maitrise)}</div>` : ''}
        </div>
      `).join('');

  const container = document.getElementById('dashboard-parcours');
  if (data.parcoursList.length === 0) {
    container.innerHTML = '<div class="list-empty">Aucun parcours pour le moment.</div>';
    return;
  }

  container.innerHTML = data.parcoursList.map(p => {
    const doneCount = p.cours.filter(c => c.statut === 1).length;
    const totalCount = p.cours.length;
    const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
    return `
    <div class="dp-item" data-id="${p.id}">
      <div class="dp-header">
        <span class="dp-caret">▶</span>
        <div class="dp-header-main">
          <span class="dp-title">${esc(p.titre)}</span>
          <div class="dp-progress-bar"><div class="dp-progress-fill" style="width:${pct}%"></div></div>
        </div>
        <span class="dp-badge ${p.completed ? 'done' : ''}">${p.completed ? 'Terminé' : `${doneCount}/${totalCount}`}</span>
      </div>
      <div class="dp-body">
        ${p.cours.length === 0
          ? '<div class="list-empty">Aucun cours dans ce parcours.</div>'
          : p.cours.map(c => `
            <label class="dp-cours-row ${c.statut === 1 ? 'done' : ''}">
              <input type="checkbox" class="list-item-checkbox dp-cours-checkbox" data-cours-id="${c.id}" ${c.statut === 1 ? 'checked' : ''}>
              ${esc(c.titre)}
              <span class="dp-cours-type">${c.type}</span>
            </label>
          `).join('')}
      </div>
    </div>
  `;
  }).join('');

  container.querySelectorAll('.dp-header').forEach(h => {
    h.addEventListener('click', () => h.closest('.dp-item').classList.toggle('open'));
  });

  container.querySelectorAll('.dp-cours-checkbox').forEach(cb => {
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', async () => {
      try {
        await api(`/api/cours/${cb.dataset.coursId}/statut`, {
          method: 'PATCH',
          body: JSON.stringify({ statut: cb.checked ? 1 : 0 })
        });
        loadDashboard();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
}

// ===================== COURS =====================
function coursQueryString() {
  const f = state.filters.cours;
  const params = new URLSearchParams();
  if (f.search) params.set('search', f.search);
  if (f.statut !== '') params.set('statut', f.statut);
  if (f.type) params.set('type', f.type);
  if (f.categorie) params.set('categorie', f.categorie);
  if (f.format) params.set('format', f.format);
  if (f.niveau) params.set('niveau', f.niveau);
  if (f.competence) params.set('competence', f.competence);
  params.set('page', state.page.cours);
  return params.toString();
}

async function loadCours() {
  showSpinner('list-cours');
  const res = await api(`/api/cours?${coursQueryString()}`);
  renderCoursList(res);
}

function renderCoursList(res) {
  const list = document.getElementById('list-cours');
  if (res.data.length === 0) {
    list.innerHTML = '<div class="list-empty">Aucun cours ne correspond à votre recherche.</div>';
  } else {
    list.innerHTML = res.data.map(c => `
      <div class="list-item">
        <input type="checkbox" class="list-item-checkbox cours-toggle" data-id="${c.id}" ${c.statut === 1 ? 'checked' : ''}>
        <div class="list-item-main">
          <div class="list-item-title ${c.statut === 1 ? 'done' : ''}">${esc(c.titre)}</div>
          ${c.description ? `<div class="list-item-desc">${esc(c.description)}</div>` : ''}
          <div class="tag-row">
            <span class="tag category">${esc(c.categorie)}</span>
            <span class="tag format">${esc(c.format)}</span>
            ${c.niveau_maitrise ? `<span class="tag niveau">${starsDisplay(c.niveau_maitrise)}</span>` : ''}
            <span class="tag nb-parcours">${c.nb_parcours} parcours</span>
            ${c.statut === 1 ? `<span class="tag">${revisionLabel(c.derniere_revision)}</span>` : ''}
            ${c.competences.map(k => `<span class="tag competence">${esc(k.nom)}</span>`).join('')}
          </div>
        </div>
        <div class="list-item-actions">
          ${c.statut === 1 ? `<button class="btn-text btn-reviser-cours" data-id="${c.id}">Réviser</button>` : ''}
          <button class="btn-text btn-edit-cours" data-id="${c.id}">Modifier</button>
          <button class="btn-text btn-delete-cours" data-id="${c.id}" style="color:var(--danger)">Supprimer</button>
        </div>
      </div>
    `).join('');
  }
  renderPagination('cours', res);

  list.querySelectorAll('.cours-toggle').forEach(cb => {
    cb.addEventListener('change', async () => {
      try {
        await api(`/api/cours/${cb.dataset.id}/statut`, {
          method: 'PATCH',
          body: JSON.stringify({ statut: cb.checked ? 1 : 0 })
        });
        loadCours();
      } catch (err) { toast(err.message, true); }
    });
  });
  list.querySelectorAll('.btn-reviser-cours').forEach(b => {
    b.addEventListener('click', async () => {
      try {
        await api(`/api/cours/${b.dataset.id}/revision`, { method: 'PATCH' });
        toast('Révision enregistrée.');
        loadCours();
      } catch (err) { toast(err.message, true); }
    });
  });
  list.querySelectorAll('.btn-edit-cours').forEach(b => b.addEventListener('click', () => openCoursModal(b.dataset.id)));
  list.querySelectorAll('.btn-delete-cours').forEach(b => b.addEventListener('click', () => deleteCours(b.dataset.id)));
}

function renderPagination(entity, res) {
  const el = document.getElementById(`pagination-${entity}`);
  if (res.totalPages <= 1) { el.innerHTML = ''; return; }
  let html = `<button class="page-btn" data-page="${res.page - 1}" ${res.page === 1 ? 'disabled' : ''}>‹</button>`;
  for (let i = 1; i <= res.totalPages; i++) {
    html += `<button class="page-btn ${i === res.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  html += `<button class="page-btn" data-page="${res.page + 1}" ${res.page === res.totalPages ? 'disabled' : ''}>›</button>`;
  el.innerHTML = html;
  el.querySelectorAll('.page-btn').forEach(b => {
    b.addEventListener('click', () => {
      state.page[entity] = Number(b.dataset.page);
      if (entity === 'cours') loadCours();
      if (entity === 'parcours') loadParcours();
      if (entity === 'competences') loadCompetences();
      if (entity === 'projets') loadProjets();
      if (entity === 'taches') loadTaches();
    });
  });
}

async function deleteCours(id) {
  if (!confirm('Supprimer ce cours ? Cette action est irréversible.')) return;
  try {
    await api(`/api/cours/${id}`, { method: 'DELETE' });
    toast('Cours supprimé.');
    await refreshAllCoursCache();
    loadCours();
  } catch (err) { toast(err.message, true); }
}

async function openCoursModal(id) {
  const editing = !!id;
  if (editing) openModal('<div class="spinner-wrap"><div class="spinner"></div></div>');
  const cours = editing ? await api(`/api/cours/${id}`) : null;
  const selectedCompIds = new Set((cours?.competences || []).map(c => c.id));
  const initialNiveau = cours?.niveau_maitrise || 0;

  openModal(`
    <h2>${editing ? 'Modifier le cours' : 'Nouveau cours'}</h2>
    <form id="form-cours">
      <div class="field">
        <label>Titre</label>
        <input type="text" name="titre" value="${esc(cours?.titre || '')}" required>
      </div>
      <div class="field">
        <label>Description</label>
        <textarea name="description">${esc(cours?.description || '')}</textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Catégorie</label>
          <select name="categorie" required>
            ${state.categories.map(c => `<option value="${esc(c)}" ${cours?.categorie === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Format</label>
          <select name="format" required>
            ${state.formats.map(f => `<option value="${esc(f)}" ${cours?.format === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label>Compétences associées</label>
        <div class="checkbox-list">
          ${state.allCompetences.length === 0
            ? '<span style="color:var(--text-faint)">Aucune compétence créée pour le moment.</span>'
            : state.allCompetences.map(k => `
              <label><input type="checkbox" name="competence" value="${k.id}" ${selectedCompIds.has(k.id) ? 'checked' : ''}> ${esc(k.nom)}</label>
            `).join('')}
        </div>
      </div>
      <div class="field">
        <label><input type="checkbox" name="statut" ${cours?.statut === 1 ? 'checked' : ''}> Marquer comme terminé</label>
      </div>
      <div class="field niveau-field ${cours?.statut === 1 ? 'visible' : ''}" id="niveau-field">
        <label>Niveau de maîtrise</label>
        <div class="star-picker" id="star-picker" data-value="${initialNiveau}">
          ${[1, 2, 3, 4, 5].map(n => `<span class="star ${n <= initialNiveau ? 'filled' : ''}" data-value="${n}">★</span>`).join('')}
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" id="btn-cancel">Annuler</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </form>
  `);

  const form = document.getElementById('form-cours');
  const statutCheckbox = form.querySelector('[name=statut]');
  const niveauField = document.getElementById('niveau-field');
  const starPicker = document.getElementById('star-picker');

  function setStars(val) {
    starPicker.dataset.value = val;
    starPicker.querySelectorAll('.star').forEach(s => s.classList.toggle('filled', Number(s.dataset.value) <= val));
  }
  starPicker.querySelectorAll('.star').forEach(s => {
    s.addEventListener('click', () => setStars(Number(s.dataset.value)));
  });
  statutCheckbox.addEventListener('change', () => {
    niveauField.classList.toggle('visible', statutCheckbox.checked);
    if (!statutCheckbox.checked) setStars(0);
  });

  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const niveauValue = Number(starPicker.dataset.value) || null;
    const payload = {
      titre: fd.get('titre'),
      description: fd.get('description'),
      categorie: fd.get('categorie'),
      format: fd.get('format'),
      statut: fd.get('statut') ? 1 : 0,
      niveau_maitrise: fd.get('statut') ? niveauValue : null,
      competences: fd.getAll('competence').map(Number)
    };
    const submitBtn = form.querySelector('.btn-primary');
    await withButtonLoading(submitBtn, editing ? 'Enregistrement…' : 'Création…', async () => {
      try {
        if (editing) {
          await api(`/api/cours/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
          toast('Cours mis à jour.');
        } else {
          await api('/api/cours', { method: 'POST', body: JSON.stringify(payload) });
          toast('Cours créé.');
        }
        closeModal();
        await refreshAllCoursCache();
        await refreshAllCompetencesCache();
        loadCours();
      } catch (err) { toast(err.message, true); }
    });
  });
}

document.getElementById('btn-new-cours').addEventListener('click', () => openCoursModal(null));
document.getElementById('search-cours').addEventListener('input', debounce(e => {
  state.filters.cours.search = e.target.value; state.page.cours = 1; loadCours();
}));
document.getElementById('filter-cours-statut').addEventListener('change', e => {
  state.filters.cours.statut = e.target.value; state.page.cours = 1; loadCours();
});
document.getElementById('filter-cours-type').addEventListener('change', e => {
  state.filters.cours.type = e.target.value; state.page.cours = 1; loadCours();
});
document.getElementById('filter-cours-categorie').addEventListener('change', e => {
  state.filters.cours.categorie = e.target.value; state.page.cours = 1; loadCours();
});
document.getElementById('filter-cours-format').addEventListener('change', e => {
  state.filters.cours.format = e.target.value; state.page.cours = 1; loadCours();
});
document.getElementById('filter-cours-niveau').addEventListener('change', e => {
  state.filters.cours.niveau = e.target.value; state.page.cours = 1; loadCours();
});
document.getElementById('filter-cours-competence').addEventListener('change', e => {
  state.filters.cours.competence = e.target.value; state.page.cours = 1; loadCours();
});

// ===================== PARCOURS =====================
function parcoursQueryString() {
  const f = state.filters.parcours;
  const params = new URLSearchParams();
  if (f.search) params.set('search', f.search);
  if (f.statut !== '') params.set('statut', f.statut);
  params.set('page', state.page.parcours);
  return params.toString();
}

async function loadParcours() {
  showSpinner('list-parcours');
  const res = await api(`/api/parcours?${parcoursQueryString()}`);
  renderParcoursList(res);
}

function renderParcoursList(res) {
  const list = document.getElementById('list-parcours');
  if (res.data.length === 0) {
    list.innerHTML = '<div class="list-empty">Aucun parcours ne correspond à votre recherche.</div>';
  } else {
    list.innerHTML = res.data.map(p => `
      <div class="list-item">
        <div class="list-item-main">
          <div class="list-item-title ${p.completed ? 'done' : ''}">${esc(p.titre)}</div>
          ${p.description ? `<div class="list-item-desc">${esc(p.description)}</div>` : ''}
          <div class="tag-row">
            <span class="tag ${p.completed ? 'competence' : ''}">${p.completed ? 'Terminé' : 'Non terminé'}</span>
            <span class="tag">${p.cours.length} cours</span>
          </div>
        </div>
        <div class="list-item-actions">
          <button class="btn-text btn-edit-parcours" data-id="${p.id}">Modifier</button>
          <button class="btn-text btn-delete-parcours" data-id="${p.id}" style="color:var(--danger)">Supprimer</button>
        </div>
      </div>
    `).join('');
  }
  renderPagination('parcours', res);
  list.querySelectorAll('.btn-edit-parcours').forEach(b => b.addEventListener('click', () => openParcoursModal(b.dataset.id)));
  list.querySelectorAll('.btn-delete-parcours').forEach(b => b.addEventListener('click', () => deleteParcours(b.dataset.id)));
}

async function deleteParcours(id) {
  if (!confirm('Supprimer ce parcours ? Cette action est irréversible.')) return;
  try {
    await api(`/api/parcours/${id}`, { method: 'DELETE' });
    toast('Parcours supprimé.');
    loadParcours();
  } catch (err) { toast(err.message, true); }
}

let ddState = []; // [{cours_id, titre, type}]

async function openParcoursModal(id) {
  const editing = !!id;
  openModal('<div class="spinner-wrap"><div class="spinner"></div></div>');
  const parcours = editing ? await api(`/api/parcours/${id}`) : null;
  await refreshAllCoursCache();

  ddState = (parcours?.cours || []).map(c => ({ cours_id: c.id, titre: c.titre, type: c.type }));

  openModal(`
    <h2>${editing ? 'Modifier le parcours' : 'Nouveau parcours'}</h2>
    <form id="form-parcours">
      <div class="field">
        <label>Titre</label>
        <input type="text" name="titre" value="${esc(parcours?.titre || '')}" required>
      </div>
      <div class="field">
        <label>Description</label>
        <textarea name="description">${esc(parcours?.description || '')}</textarea>
      </div>
      <div class="field">
        <label>Cours du parcours (glisser pour réordonner)</label>
        <div class="dd-list" id="dd-list"></div>
        <div class="dd-add-row">
          <select id="dd-add-select"></select>
          <button type="button" class="btn btn-sm" id="dd-add-btn">Ajouter</button>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" id="btn-cancel">Annuler</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </form>
  `);

  renderDDList();
  populateDDAddSelect();

  document.getElementById('dd-add-btn').addEventListener('click', () => {
    const sel = document.getElementById('dd-add-select');
    const coursId = Number(sel.value);
    if (!coursId) return;
    const cours = state.allCours.find(c => c.id === coursId);
    if (!cours || ddState.some(d => d.cours_id === coursId)) return;
    ddState.push({ cours_id: coursId, titre: cours.titre, type: 'Obligatoire' });
    renderDDList();
    populateDDAddSelect();
  });

  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('form-parcours').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      titre: fd.get('titre'),
      description: fd.get('description'),
      cours: ddState.map((d, i) => ({ cours_id: d.cours_id, type: d.type, position: i }))
    };
    const submitBtn = e.target.querySelector('.btn-primary');
    await withButtonLoading(submitBtn, editing ? 'Enregistrement…' : 'Création…', async () => {
      try {
        if (editing) {
          await api(`/api/parcours/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
          toast('Parcours mis à jour.');
        } else {
          await api('/api/parcours', { method: 'POST', body: JSON.stringify(payload) });
          toast('Parcours créé.');
        }
        closeModal();
        loadParcours();
      } catch (err) { toast(err.message, true); }
    });
  });
}

function populateDDAddSelect() {
  const sel = document.getElementById('dd-add-select');
  const usedIds = new Set(ddState.map(d => d.cours_id));
  const available = state.allCours.filter(c => !usedIds.has(c.id));
  sel.innerHTML = available.length === 0
    ? '<option value="">Tous les cours sont déjà ajoutés</option>'
    : '<option value="">Choisir un cours…</option>' + available.map(c => `<option value="${c.id}">${esc(c.titre)}</option>`).join('');
}

function renderDDList() {
  const container = document.getElementById('dd-list');
  if (ddState.length === 0) {
    container.innerHTML = '<div class="list-empty" style="padding:14px 0">Aucun cours ajouté.</div>';
    return;
  }
  container.innerHTML = ddState.map((d, i) => `
    <div class="dd-item" data-index="${i}">
      <span class="dd-handle">⠿</span>
      <span class="dd-title">${esc(d.titre)}</span>
      <select class="dd-type-select" data-index="${i}">
        <option value="Obligatoire" ${d.type === 'Obligatoire' ? 'selected' : ''}>Obligatoire</option>
        <option value="Optionnel" ${d.type === 'Optionnel' ? 'selected' : ''}>Optionnel</option>
      </select>
      <button type="button" class="dd-remove" data-index="${i}">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.dd-type-select').forEach(sel => {
    sel.addEventListener('change', () => { ddState[Number(sel.dataset.index)].type = sel.value; });
  });
  container.querySelectorAll('.dd-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      ddState.splice(Number(btn.dataset.index), 1);
      renderDDList();
      populateDDAddSelect();
    });
  });

  attachDragHandlers(container);
}

// Réordonnancement par glisser-déposer, via Pointer Events (souris + tactile + stylet,
// contrairement à l'API HTML5 Drag and Drop qui ne fonctionne pas sur écran tactile).
function attachDragHandlers(container) {
  let draggingEl = null;

  container.querySelectorAll('.dd-handle').forEach(handle => {
    handle.style.touchAction = 'none'; // empêche le scroll de la page pendant le geste

    handle.addEventListener('pointerdown', e => {
      draggingEl = handle.closest('.dd-item');
      draggingEl.classList.add('dragging');
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener('pointermove', e => {
      if (!draggingEl) return;
      const items = [...container.querySelectorAll('.dd-item')].filter(item => item !== draggingEl);
      const afterElement = items.find(item => {
        const rect = item.getBoundingClientRect();
        return e.clientY < rect.top + rect.height / 2;
      });
      if (afterElement) {
        container.insertBefore(draggingEl, afterElement);
      } else {
        container.appendChild(draggingEl);
      }
    });

    const finishDrag = () => {
      if (!draggingEl) return;
      draggingEl.classList.remove('dragging');
      const newOrder = [...container.querySelectorAll('.dd-item')].map(item => ddState[Number(item.dataset.index)]);
      ddState = newOrder;
      draggingEl = null;
      renderDDList(); // ré-attribue des data-index propres et ré-attache les écouteurs
    };

    handle.addEventListener('pointerup', finishDrag);
    handle.addEventListener('pointercancel', finishDrag);
  });
}

document.getElementById('btn-new-parcours').addEventListener('click', () => openParcoursModal(null));
document.getElementById('search-parcours').addEventListener('input', debounce(e => {
  state.filters.parcours.search = e.target.value; state.page.parcours = 1; loadParcours();
}));
document.getElementById('filter-parcours-statut').addEventListener('change', e => {
  state.filters.parcours.statut = e.target.value; state.page.parcours = 1; loadParcours();
});

// ===================== COMPETENCES =====================
function competencesQueryString() {
  const f = state.filters.competences;
  const params = new URLSearchParams();
  if (f.search) params.set('search', f.search);
  if (f.cours) params.set('cours', f.cours);
  params.set('page', state.page.competences);
  return params.toString();
}

async function loadCompetences() {
  showSpinner('list-competences');
  if (state.allCours.length === 0) await refreshAllCoursCache();
  const res = await api(`/api/competences?${competencesQueryString()}`);
  renderCompetencesList(res);
}

function renderCompetencesList(res) {
  const list = document.getElementById('list-competences');
  if (res.data.length === 0) {
    list.innerHTML = '<div class="list-empty">Aucune compétence ne correspond à votre recherche.</div>';
  } else {
    list.innerHTML = res.data.map(k => `
      <div class="list-item">
        <input type="checkbox" class="list-item-checkbox competence-toggle" data-id="${k.id}" ${k.statut === 1 ? 'checked' : ''}>
        <div class="list-item-main">
          <div class="list-item-title ${k.statut === 1 ? 'done' : ''}">${esc(k.nom)}</div>
          ${k.description ? `<div class="list-item-desc">${esc(k.description)}</div>` : ''}
          <div class="tag-row">
            ${k.niveau_maitrise ? `<span class="tag niveau">${starsDisplay(k.niveau_maitrise)}</span>` : ''}
            ${k.statut === 1 ? `<span class="tag">${revisionLabel(k.derniere_revision)}</span>` : ''}
            ${k.cours.map(c => `<span class="tag">${esc(c.titre)}</span>`).join('') || '<span class="tag">Aucun cours associé</span>'}
          </div>
        </div>
        <div class="list-item-actions">
          ${k.statut === 1 ? `<button class="btn-text btn-reviser-competence" data-id="${k.id}">Réviser</button>` : ''}
          <button class="btn-text btn-edit-competence" data-id="${k.id}">Modifier</button>
          <button class="btn-text btn-delete-competence" data-id="${k.id}" style="color:var(--danger)">Supprimer</button>
        </div>
      </div>
    `).join('');
  }
  renderPagination('competences', res);

  list.querySelectorAll('.competence-toggle').forEach(cb => {
    cb.addEventListener('change', async () => {
      try {
        await api(`/api/competences/${cb.dataset.id}/statut`, {
          method: 'PATCH',
          body: JSON.stringify({ statut: cb.checked ? 1 : 0 })
        });
        toast('Compétence mise à jour dans tous les cours associés.');
        loadCompetences();
      } catch (err) { toast(err.message, true); }
    });
  });
  list.querySelectorAll('.btn-reviser-competence').forEach(b => {
    b.addEventListener('click', async () => {
      try {
        await api(`/api/competences/${b.dataset.id}/revision`, { method: 'PATCH' });
        toast('Révision enregistrée.');
        loadCompetences();
      } catch (err) { toast(err.message, true); }
    });
  });
  list.querySelectorAll('.btn-edit-competence').forEach(b => b.addEventListener('click', () => openCompetenceModal(b.dataset.id)));
  list.querySelectorAll('.btn-delete-competence').forEach(b => b.addEventListener('click', () => deleteCompetence(b.dataset.id)));
}

async function deleteCompetence(id) {
  if (!confirm('Supprimer cette compétence ? Elle sera retirée de tous les cours associés.')) return;
  try {
    await api(`/api/competences/${id}`, { method: 'DELETE' });
    toast('Compétence supprimée.');
    await refreshAllCompetencesCache();
    loadCompetences();
  } catch (err) { toast(err.message, true); }
}

async function openCompetenceModal(id) {
  const editing = !!id;
  const comp = editing ? state.allCompetences.find(c => c.id === Number(id)) : null;
  const initialNiveau = comp?.niveau_maitrise || 0;

  openModal(`
    <h2>${editing ? 'Modifier la compétence' : 'Nouvelle compétence'}</h2>
    <form id="form-competence">
      <div class="field">
        <label>Nom</label>
        <input type="text" name="nom" value="${esc(comp?.nom || '')}" required>
      </div>
      <div class="field">
        <label>Description</label>
        <textarea name="description">${esc(comp?.description || '')}</textarea>
      </div>
      <div class="field">
        <label><input type="checkbox" name="statut" ${comp?.statut === 1 ? 'checked' : ''}> Marquer comme acquise</label>
      </div>
      <div class="field niveau-field ${comp?.statut === 1 ? 'visible' : ''}" id="niveau-field">
        <label>Niveau de maîtrise</label>
        <div class="star-picker" id="star-picker" data-value="${initialNiveau}">
          ${[1, 2, 3, 4, 5].map(n => `<span class="star ${n <= initialNiveau ? 'filled' : ''}" data-value="${n}">★</span>`).join('')}
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" id="btn-cancel">Annuler</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </form>
  `);

  const form = document.getElementById('form-competence');
  const statutCheckbox = form.querySelector('[name=statut]');
  const niveauField = document.getElementById('niveau-field');
  const starPicker = document.getElementById('star-picker');

  function setStars(val) {
    starPicker.dataset.value = val;
    starPicker.querySelectorAll('.star').forEach(s => s.classList.toggle('filled', Number(s.dataset.value) <= val));
  }
  starPicker.querySelectorAll('.star').forEach(s => {
    s.addEventListener('click', () => setStars(Number(s.dataset.value)));
  });
  statutCheckbox.addEventListener('change', () => {
    niveauField.classList.toggle('visible', statutCheckbox.checked);
    if (!statutCheckbox.checked) setStars(0);
  });

  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const niveauValue = Number(starPicker.dataset.value) || null;
    const payload = {
      nom: fd.get('nom'),
      description: fd.get('description'),
      statut: fd.get('statut') ? 1 : 0,
      niveau_maitrise: fd.get('statut') ? niveauValue : null
    };
    try {
      if (editing) {
        await api(`/api/competences/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast('Compétence mise à jour.');
      } else {
        await api('/api/competences', { method: 'POST', body: JSON.stringify(payload) });
        toast('Compétence créée.');
      }
      closeModal();
      await refreshAllCompetencesCache();
      loadCompetences();
    } catch (err) { toast(err.message, true); }
  });
}

document.getElementById('btn-new-competence').addEventListener('click', () => openCompetenceModal(null));
document.getElementById('search-competences').addEventListener('input', debounce(e => {
  state.filters.competences.search = e.target.value; state.page.competences = 1; loadCompetences();
}));
document.getElementById('filter-competences-cours').addEventListener('change', e => {
  state.filters.competences.cours = e.target.value; state.page.competences = 1; loadCompetences();
});

// ===================== PROJETS =====================
function projetsQueryString() {
  const f = state.filters.projets;
  const params = new URLSearchParams();
  if (f.search) params.set('search', f.search);
  if (f.statut !== '') params.set('statut', f.statut);
  params.set('page', state.page.projets);
  return params.toString();
}

async function loadProjets() {
  showSpinner('list-projets');
  const res = await api(`/api/projets?${projetsQueryString()}`);
  renderProjetsList(res);
}

function renderProjetsList(res) {
  const list = document.getElementById('list-projets');
  if (res.data.length === 0) {
    list.innerHTML = '<div class="list-empty">Aucun projet ne correspond à votre recherche.</div>';
  } else {
    list.innerHTML = res.data.map(p => `
      <div class="list-item">
        <input type="checkbox" class="list-item-checkbox projet-toggle" data-id="${p.id}" ${p.statut === 1 ? 'checked' : ''}>
        <div class="list-item-main">
          <div class="list-item-title ${p.statut === 1 ? 'done' : ''}">${esc(p.titre)}</div>
          ${p.description ? `<div class="list-item-desc">${esc(p.description)}</div>` : ''}
        </div>
        <div class="list-item-actions">
          <button class="btn-text btn-edit-projet" data-id="${p.id}">Modifier</button>
          <button class="btn-text btn-delete-projet" data-id="${p.id}" style="color:var(--danger)">Supprimer</button>
        </div>
      </div>
    `).join('');
  }
  renderPagination('projets', res);

  list.querySelectorAll('.projet-toggle').forEach(cb => {
    cb.addEventListener('change', async () => {
      try {
        await api(`/api/projets/${cb.dataset.id}/statut`, {
          method: 'PATCH',
          body: JSON.stringify({ statut: cb.checked ? 1 : 0 })
        });
        loadProjets();
      } catch (err) { toast(err.message, true); }
    });
  });
  list.querySelectorAll('.btn-edit-projet').forEach(b => b.addEventListener('click', () => openProjetModal(b.dataset.id)));
  list.querySelectorAll('.btn-delete-projet').forEach(b => b.addEventListener('click', () => deleteProjet(b.dataset.id)));
}

async function deleteProjet(id) {
  if (!confirm('Supprimer ce projet ? Cette action est irréversible.')) return;
  try {
    await api(`/api/projets/${id}`, { method: 'DELETE' });
    toast('Projet supprimé.');
    loadProjets();
  } catch (err) { toast(err.message, true); }
}

async function openProjetModal(id) {
  const editing = !!id;
  let projet = null;
  if (editing) {
    openModal('<div class="spinner-wrap"><div class="spinner"></div></div>');
    const res = await api(`/api/projets?search=&page=1`);
    projet = res.data.find(p => String(p.id) === String(id));
    if (!projet) {
      for (let p = 2; p <= res.totalPages && !projet; p++) {
        const r = await api(`/api/projets?page=${p}`);
        projet = r.data.find(x => String(x.id) === String(id));
      }
    }
  }

  openModal(`
    <h2>${editing ? 'Modifier le projet' : 'Nouveau projet'}</h2>
    <form id="form-projet">
      <div class="field">
        <label>Titre</label>
        <input type="text" name="titre" value="${esc(projet?.titre || '')}" required>
      </div>
      <div class="field">
        <label>Description</label>
        <textarea name="description">${esc(projet?.description || '')}</textarea>
      </div>
      <div class="field">
        <label><input type="checkbox" name="statut" ${projet?.statut === 1 ? 'checked' : ''}> Marquer comme terminé</label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" id="btn-cancel">Annuler</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </form>
  `);

  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('form-projet').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      titre: fd.get('titre'),
      description: fd.get('description'),
      statut: fd.get('statut') ? 1 : 0
    };
    try {
      if (editing) {
        await api(`/api/projets/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast('Projet mis à jour.');
      } else {
        await api('/api/projets', { method: 'POST', body: JSON.stringify(payload) });
        toast('Projet créé.');
      }
      closeModal();
      loadProjets();
    } catch (err) { toast(err.message, true); }
  });
}

document.getElementById('btn-new-projet').addEventListener('click', () => openProjetModal(null));
document.getElementById('search-projets').addEventListener('input', debounce(e => {
  state.filters.projets.search = e.target.value; state.page.projets = 1; loadProjets();
}));
document.getElementById('filter-projets-statut').addEventListener('change', e => {
  state.filters.projets.statut = e.target.value; state.page.projets = 1; loadProjets();
});

// ===================== TACHES =====================
function tachesQueryString() {
  const f = state.filters.taches;
  const params = new URLSearchParams();
  if (f.search) params.set('search', f.search);
  if (f.statut !== '') params.set('statut', f.statut);
  params.set('page', state.page.taches);
  return params.toString();
}

async function loadTaches() {
  showSpinner('list-taches');
  const res = await api(`/api/taches?${tachesQueryString()}`);
  renderTachesList(res);
}

function lienLabel(lien) {
  if (!lien) return '';
  const prefix = lien.type === 'cours' ? 'Cours' : lien.type === 'parcours' ? 'Parcours' : 'Projet';
  return `${prefix} : ${lien.titre}`;
}

function renderTachesList(res) {
  const list = document.getElementById('list-taches');
  if (res.data.length === 0) {
    list.innerHTML = '<div class="list-empty">Aucune tâche ne correspond à votre recherche.</div>';
  } else {
    list.innerHTML = res.data.map(t => `
      <div class="list-item">
        <input type="checkbox" class="list-item-checkbox tache-toggle" data-id="${t.id}" ${t.statut === 1 ? 'checked' : ''}>
        <div class="list-item-main">
          <div class="list-item-title ${t.statut === 1 ? 'done' : ''}">${esc(t.titre)}</div>
          ${t.description ? `<div class="list-item-desc">${esc(t.description)}</div>` : ''}
          ${t.lien ? `<div class="tag-row"><span class="tag lien">${esc(lienLabel(t.lien))}</span></div>` : ''}
        </div>
        <div class="list-item-actions">
          <button class="btn-text btn-edit-tache" data-id="${t.id}">Modifier</button>
          <button class="btn-text btn-delete-tache" data-id="${t.id}" style="color:var(--danger)">Supprimer</button>
        </div>
      </div>
    `).join('');
  }
  renderPagination('taches', res);

  list.querySelectorAll('.tache-toggle').forEach(cb => {
    cb.addEventListener('change', async () => {
      try {
        await api(`/api/taches/${cb.dataset.id}/statut`, {
          method: 'PATCH',
          body: JSON.stringify({ statut: cb.checked ? 1 : 0 })
        });
        loadTaches();
      } catch (err) { toast(err.message, true); }
    });
  });
  list.querySelectorAll('.btn-edit-tache').forEach(b => b.addEventListener('click', () => openTacheModal(b.dataset.id)));
  list.querySelectorAll('.btn-delete-tache').forEach(b => b.addEventListener('click', () => deleteTache(b.dataset.id)));
}

async function deleteTache(id) {
  if (!confirm('Supprimer cette tâche ?')) return;
  try {
    await api(`/api/taches/${id}`, { method: 'DELETE' });
    toast('Tâche supprimée.');
    loadTaches();
  } catch (err) { toast(err.message, true); }
}

async function ensureLienCachesLoaded() {
  const jobs = [];
  if (state.allCours.length === 0) jobs.push(refreshAllCoursCache());
  if (state.allParcours.length === 0) jobs.push(refreshAllParcoursCache());
  if (state.allProjets.length === 0) jobs.push(refreshAllProjetsCache());
  if (jobs.length) await Promise.all(jobs);
}

function optionsForLienType(type) {
  if (type === 'cours') return state.allCours;
  if (type === 'parcours') return state.allParcours;
  if (type === 'projet') return state.allProjets;
  return [];
}

async function openTacheModal(id) {
  const editing = !!id;
  openModal('<div class="spinner-wrap"><div class="spinner"></div></div>');
  await ensureLienCachesLoaded();

  let tache = null;
  if (editing) {
    const res = await api(`/api/taches?search=&page=1`);
    tache = res.data.find(t => String(t.id) === String(id));
    for (let p = 2; p <= res.totalPages && !tache; p++) {
      const r = await api(`/api/taches?page=${p}`);
      tache = r.data.find(x => String(x.id) === String(id));
    }
  }

  const initialLienType = tache?.lien?.type || '';
  const initialLienId = tache?.lien?.id || '';

  openModal(`
    <h2>${editing ? 'Modifier la tâche' : 'Nouvelle tâche'}</h2>
    <form id="form-tache">
      <div class="field">
        <label>Titre</label>
        <input type="text" name="titre" value="${esc(tache?.titre || '')}" required>
      </div>
      <div class="field">
        <label>Description</label>
        <textarea name="description">${esc(tache?.description || '')}</textarea>
      </div>
      <div class="field">
        <label><input type="checkbox" name="statut" ${tache?.statut === 1 ? 'checked' : ''}> Marquer comme faite</label>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Lier à (optionnel)</label>
          <select name="lien_type" id="tache-lien-type">
            <option value="">Aucun</option>
            <option value="cours" ${initialLienType === 'cours' ? 'selected' : ''}>Cours</option>
            <option value="parcours" ${initialLienType === 'parcours' ? 'selected' : ''}>Parcours</option>
            <option value="projet" ${initialLienType === 'projet' ? 'selected' : ''}>Projet</option>
          </select>
        </div>
        <div class="field">
          <label>Élément</label>
          <select name="lien_id" id="tache-lien-id"></select>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" id="btn-cancel">Annuler</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </form>
  `);

  const lienTypeSelect = document.getElementById('tache-lien-type');
  const lienIdSelect = document.getElementById('tache-lien-id');

  function renderLienIdOptions(type, selectedId) {
    const items = optionsForLienType(type);
    if (!type) {
      lienIdSelect.innerHTML = '<option value="">—</option>';
      lienIdSelect.disabled = true;
      return;
    }
    lienIdSelect.disabled = false;
    lienIdSelect.innerHTML = items.length === 0
      ? '<option value="">Aucun élément disponible</option>'
      : items.map(i => `<option value="${i.id}" ${String(i.id) === String(selectedId) ? 'selected' : ''}>${esc(i.titre)}</option>`).join('');
  }

  renderLienIdOptions(initialLienType, initialLienId);
  lienTypeSelect.addEventListener('change', () => renderLienIdOptions(lienTypeSelect.value, ''));

  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('form-tache').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const lienType = fd.get('lien_type') || null;
    const lienId = lienType ? fd.get('lien_id') : null;
    if (lienType && !lienId) {
      toast('Choisissez un élément à lier, ou sélectionnez "Aucun".', true);
      return;
    }
    const payload = {
      titre: fd.get('titre'),
      description: fd.get('description'),
      statut: fd.get('statut') ? 1 : 0,
      lien_type: lienType,
      lien_id: lienId ? Number(lienId) : null
    };
    try {
      if (editing) {
        await api(`/api/taches/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast('Tâche mise à jour.');
      } else {
        await api('/api/taches', { method: 'POST', body: JSON.stringify(payload) });
        toast('Tâche créée.');
      }
      closeModal();
      loadTaches();
    } catch (err) { toast(err.message, true); }
  });
}

document.getElementById('btn-new-tache').addEventListener('click', () => openTacheModal(null));
document.getElementById('search-taches').addEventListener('input', debounce(e => {
  state.filters.taches.search = e.target.value; state.page.taches = 1; loadTaches();
}));
document.getElementById('filter-taches-statut').addEventListener('change', e => {
  state.filters.taches.statut = e.target.value; state.page.taches = 1; loadTaches();
});

// ===================== EXPORT / IMPORT (Excel) =====================
document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file-input').click();
});

document.getElementById('import-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const confirmed = confirm(
    "L'import va remplacer TOUTES les données actuelles (cours, parcours, compétences, projets, tâches) " +
    'par le contenu de ce fichier. Cette action est irréversible. Continuer ?'
  );
  if (!confirmed) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/import', { method: 'POST', body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Échec de l'import.");
    }
    const summary = await res.json();
    let message = `Import terminé :\n- ${summary.cours} cours\n- ${summary.competences} compétences\n- ${summary.parcours} parcours\n- ${summary.projets} projets\n- ${summary.taches} tâches`;
    if (summary.liensCoursCompetencesIgnores) {
      message += `\n- ${summary.liensCoursCompetencesIgnores} lien(s) cours↔compétence ignoré(s) (titre introuvable)`;
    }
    if (summary.liensParcoursCoursIgnores) {
      message += `\n- ${summary.liensParcoursCoursIgnores} lien(s) parcours↔cours ignoré(s) (titre introuvable)`;
    }
    if (summary.liensTachesIgnores) {
      message += `\n- ${summary.liensTachesIgnores} lien(s) de tâche ignoré(s) (élément introuvable)`;
    }
    alert(message);
    window.location.reload();
  } catch (err) {
    toast(err.message, true);
  }
});

// ===================== Utils =====================
function debounce(fn, delay = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// ===================== Auth (session, déconnexion) =====================
document.getElementById('btn-logout').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } finally {
    window.location.href = '/login.html';
  }
});

// ===================== Init =====================
(async function init() {
  try {
    const me = await api('/api/auth/me');
    if (!me) return; // redirection vers /login.html déjà en cours
    document.getElementById('sidebar-user').textContent = me.email;

    await loadReferenceData();
    await refreshAllCoursCache();
    await loadDashboard();
  } catch (err) {
    toast(err.message, true);
  }
})();
