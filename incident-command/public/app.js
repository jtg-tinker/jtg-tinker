'use strict';

const API = '/api/incidents';
const LOCAL_KEY = 'incident-command:incidents';
const SEVERITIES = ['SEV1', 'SEV2', 'SEV3', 'SEV4'];
const STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'];
const ENTRY_KINDS = ['update', 'action', 'mitigation', 'comms', 'decision'];

const state = {
  incidents: [],
  selectedId: null,
  backend: 'local',
};

const el = {
  storageBadge: document.getElementById('storage-badge'),
  activeCount: document.getElementById('active-count'),
  list: document.getElementById('incident-list'),
  detail: document.getElementById('detail-panel'),
  form: document.getElementById('declare-form'),
  exportBtn: document.getElementById('export-btn'),
  importBtn: document.getElementById('import-btn'),
  importFile: document.getElementById('import-file'),
};

function uid() {
  return 'inc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function nowIso() {
  return new Date().toISOString();
}

function formatTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function durationSince(iso, endIso) {
  const start = new Date(iso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const mins = Math.max(0, Math.round((end - start) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

async function loadIncidents() {
  try {
    const res = await fetch(API, { cache: 'no-store' });
    if (!res.ok) throw new Error('bad status');
    const data = await res.json();
    state.backend = 'server';
    state.incidents = data.incidents || [];
  } catch {
    state.backend = 'local';
    try {
      state.incidents = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    } catch {
      state.incidents = [];
    }
  }
  el.storageBadge.textContent = state.backend === 'server' ? 'server storage' : 'browser storage';
  el.storageBadge.classList.toggle('online', state.backend === 'server');
}

async function persist() {
  if (state.backend === 'server') {
    try {
      await fetch(API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidents: state.incidents }),
      });
      return;
    } catch {
      state.backend = 'local';
      el.storageBadge.textContent = 'browser storage';
      el.storageBadge.classList.remove('online');
    }
  }
  localStorage.setItem(LOCAL_KEY, JSON.stringify(state.incidents));
}

function selected() {
  return state.incidents.find((i) => i.id === state.selectedId) || null;
}

function addEntry(incident, kind, text) {
  incident.timeline.push({ at: nowIso(), kind, text });
  incident.updatedAt = nowIso();
}

async function declareIncident({ title, severity, commander, summary }) {
  const incident = {
    id: uid(),
    title,
    severity,
    status: 'investigating',
    commander: commander || 'unassigned',
    communicationsLead: '',
    operationsLead: '',
    summary: summary || '',
    declaredAt: nowIso(),
    updatedAt: nowIso(),
    resolvedAt: null,
    timeline: [{ at: nowIso(), kind: 'update', text: `Incident declared at ${severity}.` }],
  };
  state.incidents.unshift(incident);
  state.selectedId = incident.id;
  await persist();
  render();
}

async function updateIncident(patch, logText, kind = 'update') {
  const incident = selected();
  if (!incident) return;
  Object.assign(incident, patch);
  if (logText) addEntry(incident, kind, logText);
  incident.updatedAt = nowIso();
  await persist();
  render();
}

function renderList() {
  el.list.innerHTML = '';
  if (!state.incidents.length) {
    el.list.innerHTML = '<div class="empty">No incidents yet.</div>';
    return;
  }
  for (const incident of state.incidents) {
    const item = document.createElement('div');
    item.className = 'incident-item' + (incident.id === state.selectedId ? ' active' : '');
    item.innerHTML = `
      <div class="title"></div>
      <div class="meta">
        <span class="sev sev-${incident.severity}">${incident.severity}</span>
        <span class="${incident.status === 'resolved' ? 'status-resolved' : ''}">${incident.status}</span>
        <span>${durationSince(incident.declaredAt, incident.resolvedAt)}</span>
      </div>`;
    item.querySelector('.title').textContent = incident.title;
    item.addEventListener('click', () => {
      state.selectedId = incident.id;
      render();
    });
    el.list.appendChild(item);
  }
}

function option(value, current) {
  return `<option value="${value}"${value === current ? ' selected' : ''}>${value}</option>`;
}

function renderDetail() {
  const incident = selected();
  if (!incident) {
    el.detail.innerHTML = '<div class="empty">Select or declare an incident to open the command view.</div>';
    return;
  }

  el.detail.innerHTML = `
    <div class="detail-head">
      <h2 id="detail-title"></h2>
      <span class="spacer"></span>
      <button class="secondary" id="delete-btn" type="button" style="width:auto">Delete</button>
    </div>
    <p class="badge" style="display:inline-block;margin-top:8px">
      declared ${formatTime(incident.declaredAt)} · open ${durationSince(incident.declaredAt, incident.resolvedAt)}
    </p>

    <div class="grid-3" style="margin-top:8px">
      <div>
        <label for="f-severity">Severity</label>
        <select id="f-severity">${SEVERITIES.map((s) => option(s, incident.severity)).join('')}</select>
      </div>
      <div>
        <label for="f-status">Status</label>
        <select id="f-status">${STATUSES.map((s) => option(s, incident.status)).join('')}</select>
      </div>
      <div>
        <label for="f-commander">Incident commander</label>
        <input id="f-commander" value="" />
      </div>
      <div>
        <label for="f-comms">Communications lead</label>
        <input id="f-comms" value="" />
      </div>
      <div>
        <label for="f-ops">Operations lead</label>
        <input id="f-ops" value="" />
      </div>
      <div>
        <label for="f-summary">Summary</label>
        <input id="f-summary" value="" />
      </div>
    </div>

    <h2 style="margin-top:20px">Log entry</h2>
    <div class="row">
      <select id="entry-kind" style="max-width:160px">${ENTRY_KINDS.map((k) => option(k, 'update')).join('')}</select>
      <input id="entry-text" placeholder="Rolled back deploy 1f2a9c" />
      <button id="entry-add" type="button" style="max-width:120px">Add</button>
    </div>

    <h2 style="margin-top:20px">Timeline</h2>
    <ul class="timeline" id="timeline"></ul>
  `;

  el.detail.querySelector('#detail-title').textContent = incident.title;
  el.detail.querySelector('#f-commander').value = incident.commander || '';
  el.detail.querySelector('#f-comms').value = incident.communicationsLead || '';
  el.detail.querySelector('#f-ops').value = incident.operationsLead || '';
  el.detail.querySelector('#f-summary').value = incident.summary || '';

  const timeline = el.detail.querySelector('#timeline');
  for (const entry of [...incident.timeline].reverse()) {
    const li = document.createElement('li');
    li.innerHTML = '<time></time><span class="kind"></span><div class="text"></div>';
    li.querySelector('time').textContent = formatTime(entry.at);
    li.querySelector('.kind').textContent = entry.kind;
    li.querySelector('.text').textContent = entry.text;
    timeline.appendChild(li);
  }

  el.detail.querySelector('#f-severity').addEventListener('change', (e) => {
    updateIncident({ severity: e.target.value }, `Severity changed to ${e.target.value}.`);
  });
  el.detail.querySelector('#f-status').addEventListener('change', (e) => {
    const status = e.target.value;
    updateIncident(
      { status, resolvedAt: status === 'resolved' ? nowIso() : null },
      `Status changed to ${status}.`,
    );
  });
  const bindField = (id, key, label) => {
    el.detail.querySelector(id).addEventListener('change', (e) => {
      updateIncident({ [key]: e.target.value }, `${label} set to ${e.target.value || 'unassigned'}.`);
    });
  };
  bindField('#f-commander', 'commander', 'Incident commander');
  bindField('#f-comms', 'communicationsLead', 'Communications lead');
  bindField('#f-ops', 'operationsLead', 'Operations lead');
  el.detail.querySelector('#f-summary').addEventListener('change', (e) => {
    updateIncident({ summary: e.target.value }, 'Summary updated.');
  });

  const entryText = el.detail.querySelector('#entry-text');
  const addEntryFromForm = () => {
    const text = entryText.value.trim();
    if (!text) return;
    updateIncident({}, text, el.detail.querySelector('#entry-kind').value);
  };
  el.detail.querySelector('#entry-add').addEventListener('click', addEntryFromForm);
  entryText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addEntryFromForm();
  });

  el.detail.querySelector('#delete-btn').addEventListener('click', async () => {
    if (!confirm('Delete this incident and its timeline?')) return;
    state.incidents = state.incidents.filter((i) => i.id !== incident.id);
    state.selectedId = null;
    await persist();
    render();
  });
}

function render() {
  const active = state.incidents.filter((i) => i.status !== 'resolved').length;
  el.activeCount.textContent = `${active} active`;
  renderList();
  renderDetail();
}

el.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(el.form);
  const title = String(data.get('title') || '').trim();
  if (!title) return;
  declareIncident({
    title,
    severity: String(data.get('severity')),
    commander: String(data.get('commander') || '').trim(),
    summary: String(data.get('summary') || '').trim(),
  });
  el.form.reset();
});

el.exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ incidents: state.incidents }, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `incidents-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

el.importBtn.addEventListener('click', () => el.importFile.click());
el.importFile.addEventListener('change', async () => {
  const file = el.importFile.files && el.importFile.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed.incidents)) throw new Error('missing incidents array');
    state.incidents = parsed.incidents;
    state.selectedId = null;
    await persist();
    render();
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  }
  el.importFile.value = '';
});

loadIncidents().then(render);
