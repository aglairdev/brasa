console.log('%c ꕤ AGL', 'font-size:20px; font-weight:bold; color:#ff6b35;');
'use strict';
// config 
const AVAILABLE_LANGS = ['pt-BR', 'es'];
const DEFAULT_COLUMNS = [
  { id: 'col-todo', title: null, color: '#5a5a9a', isDefault: true, defaultKey: 'A fazer' },
  { id: 'col-progress', title: null, color: '#a06a40', isDefault: true, defaultKey: 'Em progresso' },
  { id: 'col-done', title: null, color: '#4a8a5a', isDefault: true, defaultKey: 'Concluído', isCompletion: true },
];
const EXTRA_COLUMN_COLORS = [
  '#7a5a9a', '#4a7a8a', '#a04040', '#6a8a40', '#8a6a40', '#5a7a9a'
];
const MOODS = ['😶', '😞', '😔', '😑', '😐', '🙂', '😌', '😊', '😄', '🥰', '😤', '😢', '😰', '😴', '🥺'];
// sons carregados da pasta sounds/ = .mp3/.ogg/.wav
const AMBIENT_SOUNDS_CATALOG = [
  { key: 'pinknoise', icon: '🌸', ext: null },
  { key: 'brownnoise', icon: '🟫', ext: null },
  { key: 'rain', icon: '🌧', ext: null },
  { key: 'forest', icon: '🌿', ext: null },
  { key: 'fire', icon: '🔥', ext: null },
];
const AMBIENT_SOUNDS_ICONS = {
  pinknoise: '〰', brownnoise: '🟫', rain: '🌧', forest: '🌿',
  fire: '🔥', white: '🔲', wind: '💨', ocean: '🌊',
  thunder: '⛈', birds: '🐦', night: '🌙', city: '🏙', creek: '🏞',
};
let AMBIENT_SOUNDS = [];
const STORAGE_KEY = 'brasa_v2';
// i18n
let _t = {};
async function loadLocale(lang) {
  try {
    const res = await fetch(`locales/${lang}.json`);
    if (!res.ok) throw new Error();
    _t = await res.json();
  } catch {
    if (lang !== 'pt-BR') {
      await loadLocale('pt-BR');
      return;
    }
    _t = {};
  }
  applyTranslations();
}
function t(key) {
  const parts = key.split('.');
  let obj = _t;
  for (const p of parts) {
    if (obj == null) return key;
    obj = obj[p];
  }
  return (typeof obj === 'string') ? obj : key;
}
function tArr(key) {
  const parts = key.split('.');
  let obj = _t;
  for (const p of parts) {
    if (obj == null) return [];
    obj = obj[p];
  }
  return Array.isArray(obj) ? obj : [];
}
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
  updateAmbientNameDisplay();
}
// storage
let state = {
  columns: [],
  diary: [],
  streak: { count: 0, lastDate: null },
  settings: {
    lang: 'pt-BR',
    victorySound: true,
    ambientEnabled: true,
    ambientKey: 'rain',
    ambientVolume: 0.4,
  },
};
async function saveState() {
  await Security.saveState(state);
}
async function loadState() {
  let parsed = await Security.loadState();
  if (!parsed) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        parsed = JSON.parse(raw);
        await Security.saveState({ ...state, ...parsed });
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch { /* sem dados legados */ }
  }
  if (parsed) {
    state = { ...state, ...parsed };
    state.settings = {
      ...{
        lang: 'pt-BR', victorySound: true,
        ambientEnabled: true, ambientKey: 'rain', ambientVolume: 0.4
      }, ...state.settings
    };
  }
  if (!state.columns || state.columns.length === 0) {
    state.columns = DEFAULT_COLUMNS.map(c => ({
      ...c,
      title: c.defaultKey,
      tasks: [],
    }));
    await saveState();
  }
}
function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function nowStr() {
  const d = new Date();
  return d.toLocaleString(state.settings.lang, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
// kanban
let dragSrcTask = null;
let dragSrcColId = null;
let activeFilter = 'all';
let openTaskId = null;
let openTaskColId = null;
let addingToColId = null;
let newTaskPriority = 'medium';
let editTaskPriority = 'medium';
function renderBoard() {
  const board = document.getElementById('kanban-board');
  board.innerHTML = '';
  state.columns.forEach((col, idx) => {
    board.appendChild(buildColumn(col, idx));
  });
  applyFilter(activeFilter);
}
function buildColumn(col, idx) {
  const div = document.createElement('div');
  div.className = 'kanban-column';
  div.dataset.colId = col.id;
  div.setAttribute('role', 'listitem');
  div.setAttribute('aria-label', col.title);
  const taskCount = col.tasks ? col.tasks.length : 0;
  div.innerHTML = `
    <div class="column-header">
      <div class="column-color-bar" style="background:${col.color || 'var(--color-accent)'}"></div>
      <div class="column-title-wrap">
        <span class="column-title" data-col-id="${col.id}">${escHtml(col.title)}</span>
        <span class="column-count">${taskCount}</span>
      </div>
      <div class="column-actions">
        <button class="col-action-btn col-rename" data-col-id="${col.id}" aria-label="Renomear coluna" title="Renomear">
          <i class="bi bi-pencil" aria-hidden="true"></i>
        </button>
        <button class="col-action-btn col-delete" data-col-id="${col.id}" aria-label="Excluir coluna" title="Excluir coluna">
          <i class="bi bi-trash" aria-hidden="true"></i>
        </button>
      </div>
    </div>
    <div class="column-tasks" data-col-id="${col.id}" aria-label="Tarefas de ${escHtml(col.title)}"></div>
    <button class="btn-add-task" data-col-id="${col.id}" aria-label="Adicionar tarefa em ${escHtml(col.title)}">
      <i class="bi bi-plus-lg" aria-hidden="true"></i>
      <span data-i18n="kanban.addTask">${t('kanban.addTask')}</span>
    </button>
  `;
  const tasksArea = div.querySelector('.column-tasks');
  (col.tasks || []).forEach(task => {
    tasksArea.appendChild(buildTaskCard(task, col.id));
  });
  div.addEventListener('dragover', e => { e.preventDefault(); div.classList.add('drag-over'); });
  div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
  div.addEventListener('drop', e => { e.preventDefault(); div.classList.remove('drag-over'); handleDrop(col.id); });
  tasksArea.addEventListener('dragover', e => {
    e.preventDefault();
    tasksArea.classList.add('drag-active');
    const afterEl = getDragAfterElement(tasksArea, e.clientY);
    const dragging = document.querySelector('.task-card.dragging');
    if (dragging) {
      if (afterEl == null) tasksArea.appendChild(dragging);
      else tasksArea.insertBefore(dragging, afterEl);
    }
  });
  tasksArea.addEventListener('dragleave', () => tasksArea.classList.remove('drag-active'));
  tasksArea.addEventListener('drop', e => { e.preventDefault(); tasksArea.classList.remove('drag-active'); });
  // renomear
  div.querySelector('.col-rename').addEventListener('click', () => startRenameColumn(col.id, div));
  // deletar coluna
  div.querySelector('.col-delete').addEventListener('click', () => deleteColumn(col.id));
  // add task
  div.querySelector('.btn-add-task').addEventListener('click', () => openAddTaskModal(col.id));
  return div;
}
function buildTaskCard(task, colId) {
  const card = document.createElement('div');
  card.className = 'task-card';
  card.dataset.taskId = task.id;
  card.dataset.colId = colId;
  card.dataset.priority = task.priority || 'medium';
  card.draggable = true;
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', task.title);
  card.setAttribute('tabindex', '0');
  const priorityLabel = {
    low: t('kanban.priorityLow'),
    medium: t('kanban.priorityMedium'),
    high: t('kanban.priorityHigh'),
  }[task.priority || 'medium'] || '';
  const commitCount = (task.commits || []).length;
  card.innerHTML = `
    <div class="task-header">
      <span class="task-title">${escHtml(task.title)}</span>
      <div class="task-actions">
        <button class="task-btn task-btn-commits" data-task-id="${task.id}" data-col-id="${colId}" aria-label="${t('a11y.openCommits')}" title="Commits">
          <i class="bi bi-git" aria-hidden="true"></i>
        </button>
        <button class="task-btn task-btn-edit" data-task-id="${task.id}" data-col-id="${colId}" aria-label="${t('a11y.editTask')}" title="Editar">
          <i class="bi bi-pencil" aria-hidden="true"></i>
        </button>
        <button class="task-btn task-btn-delete" data-task-id="${task.id}" data-col-id="${colId}" aria-label="${t('a11y.deleteTask')}" title="Excluir">
          <i class="bi bi-trash" aria-hidden="true"></i>
        </button>
      </div>
    </div>
    ${task.description ? `<p class="task-desc">${escHtml(task.description)}</p>` : ''}
    <div class="task-meta">
      <span class="task-priority-badge">
        <span class="priority-dot dot-${task.priority || 'medium'}"></span>
        ${escHtml(priorityLabel)}
      </span>
      ${commitCount > 0 ? `<span class="task-commits-count"><i class="bi bi-git" aria-hidden="true"></i> ${commitCount}</span>` : ''}
    </div>
  `;
  card.addEventListener('dragstart', () => {
    dragSrcTask = task.id;
    dragSrcColId = colId;
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    handleDragEnd();
  });
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openTaskModal(task.id, colId);
    }
  });
  card.querySelector('.task-btn-commits').addEventListener('click', e => {
    e.stopPropagation();
    openTaskModal(task.id, colId, true);
  });
  card.querySelector('.task-btn-edit').addEventListener('click', e => {
    e.stopPropagation();
    openTaskModal(task.id, colId, false);
  });
  card.querySelector('.task-btn-delete').addEventListener('click', e => {
    e.stopPropagation();
    if (confirm(t('kanban.confirmDelete'))) deleteTask(task.id, colId);
  });
  return card;
}
function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.task-card:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}
async function handleDrop(targetColId) {
  if (!dragSrcTask) return;
  const srcCol = state.columns.find(c => c.id === dragSrcColId);
  const tgtCol = state.columns.find(c => c.id === targetColId);
  if (!srcCol || !tgtCol) return;
  const taskIdx = srcCol.tasks.findIndex(t => t.id === dragSrcTask);
  if (taskIdx === -1) return;
  const [task] = srcCol.tasks.splice(taskIdx, 1);
  const targetArea = document.querySelector(`.column-tasks[data-col-id="${targetColId}"]`);
  const taskCards = [...(targetArea ? targetArea.querySelectorAll('.task-card:not(.dragging)') : [])];
  const draggingCard = document.querySelector('.task-card.dragging');
  let insertIdx = tgtCol.tasks.length;
  if (draggingCard && taskCards.length > 0) {
    const beforeCard = taskCards.find((c, i) => {
      return draggingCard.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    if (beforeCard) {
      insertIdx = tgtCol.tasks.findIndex(t => t.id === beforeCard.dataset.taskId);
      if (insertIdx === -1) insertIdx = tgtCol.tasks.length;
    }
  }
  tgtCol.tasks.splice(insertIdx, 0, task);
  const isCompletion = tgtCol.isCompletion || false;
  if (isCompletion && dragSrcColId !== targetColId) {
    triggerVictory();
    await updateStreak();
  }
  await saveState();
  renderBoard();
}
function handleDragEnd() {
  dragSrcTask = null;
  dragSrcColId = null;
}
async function deleteTask(taskId, colId) {
  const col = state.columns.find(c => c.id === colId);
  if (!col) return;
  col.tasks = col.tasks.filter(t => t.id !== taskId);
  await saveState();
  renderBoard();
  closeTaskModal();
}
async function deleteColumn(colId) {
  if (!confirm(t('kanban.confirmDeleteColumn'))) return;
  state.columns = state.columns.filter(c => c.id !== colId);
  await saveState();
  renderBoard();
}
function startRenameColumn(colId, colEl) {
  const titleEl = colEl.querySelector('.column-title');
  const currentTitle = titleEl.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'column-rename-input';
  input.value = currentTitle;
  titleEl.replaceWith(input);
  input.focus();
  input.select();
  async function finish() {
    const newTitle = input.value.trim() || currentTitle;
    const col = state.columns.find(c => c.id === colId);
    if (col) col.title = newTitle;
    await saveState();
    renderBoard();
  }
  input.addEventListener('blur', finish);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      input.value = currentTitle;
      input.blur();
    }
  });
}
async function addColumn() {
  const colorIdx = state.columns.length % EXTRA_COLUMN_COLORS.length;
  const col = {
    id: 'col-' + newId(),
    title: t('kanban.addColumn'),
    color: EXTRA_COLUMN_COLORS[colorIdx],
    isCompletion: false,
    tasks: [],
  };
  state.columns.push(col);
  await saveState();
  renderBoard();
  const colEl = document.querySelector(`[data-col-id="${col.id}"].kanban-column`);
  if (colEl) {
    setTimeout(() => startRenameColumn(col.id, colEl), 50);
  }
}
function applyFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  document.querySelectorAll('.task-card').forEach(card => {
    if (filter === 'all') {
      card.classList.remove('filtered-out');
    } else {
      card.classList.toggle('filtered-out', card.dataset.priority !== filter);
    }
  });
}
// diário
let selectedMood = null;
function renderMoodPicker() {
  const picker = document.getElementById('mood-picker');
  picker.innerHTML = '';
  MOODS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'mood-btn';
    btn.type = 'button';
    btn.textContent = emoji;
    btn.setAttribute('aria-label', emoji);
    btn.setAttribute('aria-pressed', selectedMood === emoji ? 'true' : 'false');
    btn.addEventListener('click', () => {
      if (selectedMood === emoji) {
        selectedMood = null;
        btn.classList.remove('selected');
        btn.setAttribute('aria-pressed', 'false');
      } else {
        selectedMood = emoji;
        picker.querySelectorAll('.mood-btn').forEach(b => {
          b.classList.remove('selected');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('selected');
        btn.setAttribute('aria-pressed', 'true');
      }
    });
    if (selectedMood === emoji) {
      btn.classList.add('selected');
      btn.setAttribute('aria-pressed', 'true');
    }
    picker.appendChild(btn);
  });
}
async function saveDiaryEntry() {
  const text = document.getElementById('diary-text').value.trim();
  const mood = selectedMood;
  if (!text && !mood) return;
  const entry = {
    id: newId(),
    date: todayStr(),
    time: nowStr(),
    mood: mood || null,
    text: text || null,
  };
  state.diary.push(entry);
  selectedMood = null;
  document.getElementById('diary-text').value = '';
  renderMoodPicker();
  renderDiaryHistory();
  await updateStreak();
  await saveState();
  showToast(t('toast.entry_saved'));
}
function renderDiaryHistory() {
  const list = document.getElementById('diary-history-list');
  list.innerHTML = '';

  if (!state.diary || state.diary.length === 0) {
    list.innerHTML = `<p class="no-entries-msg">${t('diary.noEntries')}</p>`;
    return;
  }
  const grouped = {};
  [...state.diary].reverse().forEach(entry => {
    if (!grouped[entry.date]) grouped[entry.date] = [];
    grouped[entry.date].push(entry);
  });
  const today = todayStr();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  Object.entries(grouped).forEach(([date, entries]) => {
    const group = document.createElement('div');
    group.className = 'history-day-group';
    let label = date;
    if (date === today) label = t('diary.today');
    else if (date === yesterday) label = t('diary.yesterday');
    else {
      const d = new Date(date + 'T12:00:00');
      label = d.toLocaleDateString(state.settings.lang, { weekday: 'long', day: '2-digit', month: 'long' });
    }
    group.innerHTML = `<div class="history-day-label">${escHtml(label)}</div>`;
    entries.forEach(entry => {
      const entryEl = document.createElement('div');
      entryEl.className = 'history-entry';
      entryEl.innerHTML = `
        <span class="history-entry-time">${escHtml(entry.time)}</span>
        ${entry.mood ? `<span class="history-entry-mood" aria-label="Humor: ${entry.mood}">${entry.mood}</span>` : ''}
        ${entry.text ? `<p class="history-entry-text">${escHtml(entry.text)}</p>` : ''}
      `;
      group.appendChild(entryEl);
    });
    list.appendChild(group);
  });
}
// streak
async function updateStreak() {
  const today = todayStr();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (state.streak.lastDate === today) return;
  if (state.streak.lastDate === yesterday) {
    state.streak.count = (state.streak.count || 0) + 1;
  } else if (state.streak.lastDate !== today) {
    state.streak.count = 1;
  }
  state.streak.lastDate = today;
  await saveState();
  renderStreak();
}
function renderStreak() {
  const countEl = document.getElementById('streak-count');
  const badge = document.getElementById('streak-badge');
  if (countEl) countEl.textContent = state.streak.count || 0;
  if (badge) badge.title = t('streak.tooltip');
}
// som de vitória
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playVictorySound() {
  if (!state.settings.victorySound) return;
  try {
    const ctx = getAudioCtx();
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.18, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  } catch { }
}
// som ambiente 
let ambientPlaying = false;
let ambientAudio = null;
async function discoverSounds() {
  const found = [];
  let extra = [];
  try {
    const res = await fetch('sounds/index.json');
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list)) {
        list.forEach(filename => {
          const dot = filename.lastIndexOf('.');
          if (dot === -1) return;
          const key = filename.slice(0, dot);
          const ext = filename.slice(dot + 1);
          if (!AMBIENT_SOUNDS_CATALOG.some(c => c.key === key)) {
            extra.push({ key, icon: AMBIENT_SOUNDS_ICONS[key] || '🔊', ext });
          }
        });
      }
    }
  } catch { /* sem index.json — ok */ }
  const extsToTry = ['mp3', 'ogg', 'wav', 'webm'];
  const checks = [...AMBIENT_SOUNDS_CATALOG, ...extra].map(async entry => {
    const exts = entry.ext ? [entry.ext] : extsToTry;
    for (const ext of exts) {
      const url = `sounds/${entry.key}.${ext}`;
      try {
        const res = await fetch(url, { method: 'HEAD' });
        if (res.ok) return { key: entry.key, icon: entry.icon, url };
      } catch { /* continua */ }
    }
    return null; // arquivo não encontrado
  });
  const results = await Promise.all(checks);
  results.forEach(r => { if (r) found.push(r); });

  AMBIENT_SOUNDS = found;
  // se o som salvo não existe mais, usa o primeiro disponível
  if (AMBIENT_SOUNDS.length > 0 && !AMBIENT_SOUNDS.find(s => s.key === state.settings.ambientKey)) {
    state.settings.ambientKey = AMBIENT_SOUNDS[0].key;
    await saveState();
  }
}
async function initAmbient() {
  const bar = document.getElementById('ambient-bar');
  const enabled = state.settings.ambientEnabled;
  if (!enabled) { bar.classList.add('ambient-hidden'); }
  else { bar.classList.remove('ambient-hidden'); }
  document.getElementById('ambient-volume').value = state.settings.ambientVolume;
  await discoverSounds();
  updateAmbientNameDisplay();
  renderAmbientList();
  // esconde o player se não houver nenhum som disponível
  if (AMBIENT_SOUNDS.length === 0) {
    bar.classList.add('ambient-hidden');
  }
}
function updateAmbientNameDisplay() {
  const nameEl = document.getElementById('ambient-sound-name');
  if (!nameEl) return;
  const sound = AMBIENT_SOUNDS.find(s => s.key === state.settings.ambientKey);
  if (!sound) { nameEl.textContent = '—'; return; }
  const label = t(`player.tracks.${sound.key}`) || sound.key;
  nameEl.textContent = `${sound.icon} ${label}`;
}
function stopAmbient() {
  if (ambientAudio) {
    ambientAudio.pause();
    ambientAudio.src = '';
    ambientAudio = null;
  }
}
function playAmbient() {
  stopAmbient();
  const sound = AMBIENT_SOUNDS.find(s => s.key === state.settings.ambientKey);
  if (!sound) return;
  ambientAudio = new Audio(sound.url);
  ambientAudio.loop = true;
  ambientAudio.volume = parseFloat(state.settings.ambientVolume) || 0.4;
  ambientAudio.play().catch(e => console.warn('Ambient play error:', e));
  ambientPlaying = true;
  updateAmbientPlayBtn();
}
function pauseAmbient() {
  stopAmbient();
  ambientPlaying = false;
  updateAmbientPlayBtn();
}
function updateAmbientPlayBtn() {
  const playBtn = document.getElementById('ambient-play');
  const icon = document.getElementById('ambient-play-icon');
  if (!playBtn || !icon) return;
  if (ambientPlaying) {
    icon.className = 'bi bi-pause-fill';
    playBtn.classList.add('playing');
    playBtn.setAttribute('aria-label', t('player.pause'));
  } else {
    icon.className = 'bi bi-play-fill';
    playBtn.classList.remove('playing');
    playBtn.setAttribute('aria-label', t('player.play'));
  }
}
async function selectAmbientSound(key) {
  state.settings.ambientKey = key;
  await saveState();
  updateAmbientNameDisplay();
  updateAmbientListActive();
  if (ambientPlaying) playAmbient();
  closeModal('modal-ambient');
}
function renderAmbientList() {
  const list = document.getElementById('ambient-list');
  list.innerHTML = '';
  if (AMBIENT_SOUNDS.length === 0) {
    list.innerHTML = '<p style="opacity:.6;padding:1rem 0;">Nenhum arquivo encontrado em sounds/</p>';
    return;
  }
  AMBIENT_SOUNDS.forEach(sound => {
    const btn = document.createElement('button');
    btn.className = 'ambient-option' + (sound.key === state.settings.ambientKey ? ' active' : '');
    btn.dataset.key = sound.key;
    btn.type = 'button';
    btn.setAttribute('role', 'listitem');
    const label = t(`player.tracks.${sound.key}`) || sound.key;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = `
      <span class="ambient-option-icon">${sound.icon}</span>
      <span>${label}</span>
    `;
    btn.addEventListener('click', () => selectAmbientSound(sound.key));
    list.appendChild(btn);
  });
}
function updateAmbientListActive() {
  document.querySelectorAll('.ambient-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.key === state.settings.ambientKey);
  });
}
// confete
function runConfetti(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const COLORS = [
    '#e07070', '#d08850', '#d0d050', '#60d080',
    '#60c0d8', '#7070e0', '#a070e0', '#e070c0'
  ];
  const particles = Array.from({ length: 90 }, () => ({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 80,
    w: 6 + Math.random() * 8,
    h: 3 + Math.random() * 5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.15,
    vx: (Math.random() - 0.5) * 3,
    vy: 2.5 + Math.random() * 3,
  }));
  let frame;
  let ticks = 0;
  function draw() {
    ticks++;
    if (ticks > 140) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(frame);
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.rotSpeed;
      p.vy += 0.04;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    frame = requestAnimationFrame(draw);
  }
  draw();
  return () => cancelAnimationFrame(frame);
}
// mensagens de vitória
const VICTORY_MESSAGES = {
  'pt-BR': [
    'Feito.',
    'Uma coisa a menos.',
    'Você chegou até aqui.',
    'Isso conta.',
    'Passo dado.',
    'Valeu o esforço.',
    'Concluído.',
    'Era difícil. Você fez mesmo assim.',
    'Pequeno ou grande — foi real.',
    'O dia ficou um pouco mais completo.',
  ],
  'es': [
    'Hecho.',
    'Una cosa menos.',
    'Llegaste hasta aquí.',
    'Eso cuenta.',
    'Paso dado.',
    'Valió el esfuerzo.',
    'Completado.',
    'Era difícil. Lo hiciste de todos modos.',
    'Pequeño o grande — fue real.',
    'El día quedó un poco más completo.',
  ],
};
function getVictoryMessage() {
  const lang = state.settings.lang || 'pt-BR';
  const msgs = VICTORY_MESSAGES[lang] || VICTORY_MESSAGES['pt-BR'];
  return msgs[Math.floor(Math.random() * msgs.length)] || '✓';
}
let victoryTimeout = null;
function triggerVictory() {
  playVictorySound();
  const msg = getVictoryMessage();
  const overlay = document.getElementById('victory-overlay');
  const msgEl = document.getElementById('victory-message');
  const canvas = document.getElementById('confetti-canvas');
  msgEl.textContent = msg;
  overlay.classList.remove('hidden');
  const stopConfetti = runConfetti(canvas);
  if (victoryTimeout) clearTimeout(victoryTimeout);
  victoryTimeout = setTimeout(() => {
    overlay.classList.add('hidden');
    stopConfetti();
  }, 3000);
}
// modals
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
  document.body.style.overflow = '';
}
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    const id = e.target.id;
    closeModal(id);
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['modal-settings', 'modal-task-edit', 'modal-task-commit', 'modal-add-task', 'modal-ambient'].forEach(closeModal);
  }
});
function openTaskModal(taskId, colId, focusCommits = false) {
  openTaskId = taskId;
  openTaskColId = colId;
  const col = state.columns.find(c => c.id === colId);
  const task = col ? col.tasks.find(t => t.id === taskId) : null;
  if (!task) return;
  if (focusCommits) {
    // abrir modal de commits
    document.getElementById('task-commit-modal-title').textContent = task.title;
    renderCommitsList(task.commits || []);
    openModal('modal-task-commit');
    setTimeout(() => document.getElementById('commit-input').focus(), 50);
  } else {
    // abrir modal de edição
    document.getElementById('task-edit-modal-title').textContent = task.title;
    document.getElementById('edit-task-title').value = task.title;
    document.getElementById('edit-task-desc').value = task.description || '';
    editTaskPriority = task.priority || 'medium';
    document.querySelectorAll('#modal-task-edit .priority-pick-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.p === editTaskPriority);
    });
    openModal('modal-task-edit');
  }
}
function closeTaskModal() {
  closeModal('modal-task-edit');
  closeModal('modal-task-commit');
  openTaskId = null;
  openTaskColId = null;
}
function renderCommitsList(commits) {
  const list = document.getElementById('commits-list');
  list.innerHTML = '';
  if (!commits || commits.length === 0) {
    list.innerHTML = `<p class="no-commits-msg">${t('kanban.noCommits')}</p>`;
    return;
  }
  [...commits].reverse().forEach(commit => {
    const item = document.createElement('div');
    item.className = 'commit-item';
    item.innerHTML = `
      <span class="commit-meta">${escHtml(commit.datetime)}</span>
      <p class="commit-text">${escHtml(commit.text)}</p>
    `;
    list.appendChild(item);
  });
}
async function addCommit() {
  const text = document.getElementById('commit-input').value.trim();
  if (!text || !openTaskId || !openTaskColId) return;
  const col = state.columns.find(c => c.id === openTaskColId);
  const task = col ? col.tasks.find(t => t.id === openTaskId) : null;
  if (!task) return;
  if (!task.commits) task.commits = [];
  task.commits.push({ id: newId(), datetime: nowStr(), text });
  document.getElementById('commit-input').value = '';
  renderCommitsList(task.commits);
  document.getElementById('task-commit-modal-title').textContent = task.title;
  await saveState();
  renderBoard();
}
async function saveTaskEdit() {
  if (!openTaskId || !openTaskColId) return;
  const col = state.columns.find(c => c.id === openTaskColId);
  const task = col ? col.tasks.find(t => t.id === openTaskId) : null;
  if (!task) return;
  const newTitle = document.getElementById('edit-task-title').value.trim();
  const newDesc = document.getElementById('edit-task-desc').value.trim();
  if (!newTitle) return;
  task.title = newTitle;
  task.description = newDesc || null;
  task.priority = editTaskPriority;
  await saveState();
  renderBoard();
  closeTaskModal();
}
function openAddTaskModal(colId) {
  addingToColId = colId;
  newTaskPriority = 'medium';
  document.getElementById('new-task-title').value = '';
  document.getElementById('new-task-desc').value = '';
  document.querySelectorAll('#modal-add-task .priority-pick-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.p === 'medium');
  });
  openModal('modal-add-task');
  setTimeout(() => document.getElementById('new-task-title').focus(), 50);
}
async function confirmAddTask() {
  const title = document.getElementById('new-task-title').value.trim();
  if (!title || !addingToColId) return;
  const desc = document.getElementById('new-task-desc').value.trim();
  const task = {
    id: newId(),
    title,
    description: desc || null,
    priority: newTaskPriority,
    commits: [],
  };
  const col = state.columns.find(c => c.id === addingToColId);
  if (!col) return;
  col.tasks.push(task);
  await saveState();
  renderBoard();
  closeModal('modal-add-task');
}
// import/export
function exportData() {
  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    kanban: state.columns,
    diary: state.diary,
    streak: state.streak,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `brasa-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
function importData(file) {
  const feedback = document.getElementById('import-feedback');
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.kanban) state.columns = data.kanban;
      if (data.diary) state.diary = data.diary;
      if (data.streak) state.streak = data.streak;
      await saveState();
      renderBoard();
      renderDiaryHistory();
      renderStreak();
      feedback.textContent = t('settings.importSuccess');
      feedback.className = 'import-feedback success';
      feedback.classList.remove('hidden');
    } catch {
      feedback.textContent = t('settings.importError');
      feedback.className = 'import-feedback error';
      feedback.classList.remove('hidden');
    }
    setTimeout(() => feedback.classList.add('hidden'), 3500);
  };
  reader.readAsText(file);
}
function clearData() {
  if (!confirm(t('settings.clearConfirm'))) return;
  Security.clearAll();
  localStorage.removeItem(STORAGE_KEY); // remove legado, se houver
  location.reload();
}
// toast
function showToast(msg) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3100);
}
// configurações
function renderLangSelect() {
  const sel = document.getElementById('lang-select');
  sel.innerHTML = '';
  AVAILABLE_LANGS.forEach(lang => {
    const opt = document.createElement('option');
    opt.value = lang;
    opt.selected = lang === state.settings.lang;
    const names = { 'pt-BR': 'Português (Brasil)', 'es': 'Español' };
    opt.textContent = names[lang] || lang;
    sel.appendChild(opt);
  });
}
function buildBrandName(container) {
  const name = 'Brasa';
  container.innerHTML = '';
  [...name].forEach(letter => {
    const span = document.createElement('span');
    span.className = 'brand-letter';
    span.textContent = letter;
    container.appendChild(span);
  });
}
// inicialização
function escHtml(str) {
  return Security.sanitizeText(str);
}
async function init() {
  const secOk = await Security.init();
  if (!secOk) {
    document.body.innerHTML = '<p style="padding:2rem;color:#c00;font-family:sans-serif;">Erro: Web Crypto API não disponível neste ambiente. O app não pode ser carregado com segurança.</p>';
    return;
  }
  await loadState();
  await loadLocale(state.settings.lang);
  buildBrandName(document.getElementById('brand-name'));
  buildBrandName(document.getElementById('footer-brand-name'));
  renderBoard();
  renderMoodPicker();
  renderDiaryHistory();
  renderStreak();
  await initAmbient();
  renderLangSelect();
  document.getElementById('nav-kanban').addEventListener('click', () => {
    document.getElementById('section-kanban').classList.remove('hidden');
    document.getElementById('section-diary').classList.add('hidden');
    document.getElementById('nav-kanban').classList.add('active');
    document.getElementById('nav-diary').classList.remove('active');
  });
  document.getElementById('nav-diary').addEventListener('click', () => {
    document.getElementById('section-diary').classList.remove('hidden');
    document.getElementById('section-kanban').classList.add('hidden');
    document.getElementById('nav-diary').classList.add('active');
    document.getElementById('nav-kanban').classList.remove('active');
  });
  document.getElementById('btn-settings').addEventListener('click', () => openModal('modal-settings'));
  document.getElementById('close-settings').addEventListener('click', () => closeModal('modal-settings'));
  document.getElementById('btn-clear-data').addEventListener('click', clearData);
  document.getElementById('lang-select').addEventListener('change', async e => {
    state.settings.lang = e.target.value;
    await saveState();
    await loadLocale(state.settings.lang);
    renderBoard();
    renderDiaryHistory();
    renderStreak();
    renderAmbientList();
    updateAmbientNameDisplay();
  });
  document.getElementById('toggle-victory-sound').checked = state.settings.victorySound;
  document.getElementById('toggle-victory-sound').addEventListener('change', async e => {
    state.settings.victorySound = e.target.checked;
    await saveState();
  });
  document.getElementById('toggle-ambient-sound').checked = state.settings.ambientEnabled;
  document.getElementById('toggle-ambient-sound').addEventListener('change', async e => {
    state.settings.ambientEnabled = e.target.checked;
    await saveState();
    const bar = document.getElementById('ambient-bar');
    if (e.target.checked) {
      bar.classList.remove('ambient-hidden');
    } else {
      bar.classList.add('ambient-hidden');
      pauseAmbient();
    }
  });
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });
  document.getElementById('import-file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) importData(file);
    e.target.value = '';
  });
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => applyFilter(btn.dataset.filter));
  });
  document.getElementById('btn-add-column').addEventListener('click', addColumn);
  document.getElementById('close-task-edit-modal').addEventListener('click', closeTaskModal);
  document.getElementById('btn-save-task-edit').addEventListener('click', saveTaskEdit);
  document.getElementById('btn-delete-task-modal').addEventListener('click', () => {
    if (confirm(t('kanban.confirmDelete'))) deleteTask(openTaskId, openTaskColId);
  });
  document.querySelectorAll('#modal-task-edit .priority-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      editTaskPriority = btn.dataset.p;
      document.querySelectorAll('#modal-task-edit .priority-pick-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  document.getElementById('close-task-commit-modal').addEventListener('click', closeTaskModal);
  document.getElementById('btn-add-commit').addEventListener('click', addCommit);
  document.getElementById('commit-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addCommit();
  });
  document.getElementById('close-add-task').addEventListener('click', () => closeModal('modal-add-task'));
  document.getElementById('btn-confirm-add-task').addEventListener('click', confirmAddTask);
  document.getElementById('new-task-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmAddTask();
  });
  document.querySelectorAll('#modal-add-task .priority-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      newTaskPriority = btn.dataset.p;
      document.querySelectorAll('#modal-add-task .priority-pick-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  document.getElementById('btn-save-diary').addEventListener('click', saveDiaryEntry);
  document.getElementById('diary-text').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveDiaryEntry();
  });
  document.getElementById('ambient-play').addEventListener('click', () => {
    if (ambientPlaying) pauseAmbient();
    else playAmbient();
  });
  document.getElementById('ambient-volume').addEventListener('input', async e => {
    state.settings.ambientVolume = parseFloat(e.target.value);
    if (ambientAudio) ambientAudio.volume = state.settings.ambientVolume;
    await saveState();
  });
  document.getElementById('ambient-select').addEventListener('click', () => {
    renderAmbientList();
    openModal('modal-ambient');
  });
  document.getElementById('close-ambient').addEventListener('click', () => closeModal('modal-ambient'));
}
document.addEventListener('DOMContentLoaded', init);