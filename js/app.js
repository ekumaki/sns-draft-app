import { openDB, addDraft, putDraft, deleteDraft, getAllDrafts, countDrafts, getDraft } from './db.js';

// ---- State ----
let db;
let currentEditingId = null; // null = new draft, number = editing existing
let lastSavedContent = null; // for duplicate guard (strict match)

// ---- Elements ----
const $ = (sel) => document.querySelector(sel);

const elTabInput = $('#tab-input');
const elTabSaved = $('#tab-saved');
const elPanelInput = $('#panel-input');
const elPanelSaved = $('#panel-saved');
const elText = $('#draft-text');
const elCounter = $('#char-counter');
const elBtnCopy = $('#btn-copy');
const elBtnSave = $('#btn-save');
const elBtnDelete = $('#btn-delete');
const elToast = $('#toast');
const elSearch = $('#search-input');
const elListAll = $('#list-all');
const elContext = $('#context-menu');
const elDialog = $('#confirm-dialog');
const elConfirmDelete = $('#confirm-delete');
const elConfirmCancel = $('#confirm-cancel');

// ---- Utilities ----
function showToast(msg) {
  elToast.textContent = msg;
  elToast.hidden = false;
  requestAnimationFrame(() => {
    elToast.classList.add('show');
    setTimeout(() => {
      elToast.classList.remove('show');
      setTimeout(() => { elToast.hidden = true; }, 180);
    }, 1000);
  });
}

function countChars() {
  const len = elText.value.length;
  elCounter.textContent = `${len}文字/140文字`;
  elCounter.classList.toggle('over', len > 140);
}

// Normalization for copy only (spec-defined order)
function normalizeForCopy(input) {
  let s = input;
  s = s.replace(/^\s+|\s+$/g, '');
  s = s.replace(/\r\n?|\u000D/g, '\n');
  s = s.split('\n').map(line => line.replace(/\s+$/g, '')).join('\n');
  s = s.replace(/\t/g, ' ');
  s = s.replace(/[\u00A0\u2000-\u2006\u2007\u2008-\u200A\u202F\u205F]/g, ' ');
  s = s.replace(/ {2,}/g, ' ');
  try { s = s.normalize('NFC'); } catch {}
  return s;
}

function nowISO() { return new Date().toISOString(); }

function switchTab(name) {
  const isInput = name === 'input';
  elTabInput.classList.toggle('active', isInput);
  elTabSaved.classList.toggle('active', !isInput);
  elTabInput.setAttribute('aria-selected', String(isInput));
  elTabSaved.setAttribute('aria-selected', String(!isInput));
  elPanelInput.classList.toggle('hidden', !isInput);
  elPanelSaved.classList.toggle('hidden', isInput);
  const bottom = document.querySelector('.bottom-bar');
  if (bottom) bottom.classList.toggle('hidden', !isInput);
}

// ---- Rendering ----
async function renderList() {
  const all = await getAllDrafts(db);
  const sorted = [...all].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    const ak = a.pinned ? (a.pinned_at || a.updated_at || '') : (a.updated_at || '');
    const bk = b.pinned ? (b.pinned_at || b.updated_at || '') : (b.updated_at || '');
    return bk.localeCompare(ak);
  });

  const q = (elSearch?.value || '').toLowerCase();
  const matches = (t) => {
    if (!q) return true;
    const hay = (t || '').replace(/\n/g, ' ').toLowerCase();
    return hay.includes(q);
  };

  elListAll.innerHTML = '';
  for (const d of sorted) {
    if (!matches(d.content)) continue;
    const li = document.createElement('li');
    li.className = 'item-wrapper';

    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const btnPin = document.createElement('button');
    btnPin.className = 'act pin';
    btnPin.setAttribute('aria-label', d.pinned ? 'ピン解除' : 'ピン留め');
    btnPin.innerHTML = iconPin();
    btnPin.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); togglePin(d); });
    const btnDel = document.createElement('button');
    btnDel.className = 'act del';
    btnDel.setAttribute('aria-label', '削除');
    btnDel.innerHTML = iconTrash();
    btnDel.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); confirmDelete(d.id); });
    actions.append(btnPin, btnDel);

    const item = document.createElement('div');
    item.className = 'item' + (d.pinned ? ' pinned' : '');
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', '下書きを編集');
    const text = d.content || '';
    const firstLine = text.split('\n')[0] || '';
    const mobile = window.matchMedia && window.matchMedia('(max-width: 480px)').matches;
    const limit = mobile ? 12 : 20;
    const truncated = firstLine.length > limit ? firstLine.slice(0, limit) + '…' : firstLine;
    item.innerHTML = `<div class="single-line">${d.pinned ? '📌 ' : ''}${truncated}</div>`;

    item.addEventListener('click', () => loadForEdit(d.id));
    item.addEventListener('contextmenu', (e) => { e.preventDefault(); openContextMenu(e.clientX, e.clientY, d); });

    li.append(item, actions);
    elListAll.appendChild(li);
  }
}

// Swipe interactions removed (replaced with always-visible actions)

// ---- Icons ----
function iconPin() {
  return '<img src="./icons/actions/pin-white.png" alt="" width="22" height="22" />';
}
function iconTrash() {
  return '<img src="./icons/actions/trash-white.png" alt="" width="22" height="22" />';
}

// ---- Context menu ----
function openContextMenu(x, y, draft) {
  elContext.style.left = `${x}px`;
  elContext.style.top = `${y}px`;
  elContext.hidden = false;
  const btnPin = elContext.querySelector('[data-action="pin"]');
  const btnUnpin = elContext.querySelector('[data-action="unpin"]');
  btnPin.hidden = !!draft.pinned;
  btnUnpin.hidden = !draft.pinned;

  const onDocClick = (e) => {
    if (!elContext.contains(e.target)) closeContextMenu();
  };
  const onKey = (e) => { if (e.key === 'Escape') { closeContextMenu(); } };
  document.addEventListener('click', onDocClick, { once: true });
  document.addEventListener('keydown', onKey, { once: true });

  elContext.onclick = async (e) => {
    const act = e.target.closest('button')?.dataset.action;
    if (!act) return;
    closeContextMenu();
    if (act === 'pin') togglePin(draft);
    if (act === 'unpin') togglePin({ ...draft, pinned: true });
    if (act === 'delete') confirmDelete(draft.id);
  };
}
function closeContextMenu() { elContext.hidden = true; }

async function togglePin(draft) {
  const fresh = await getDraft(db, draft.id);
  if (!fresh) return;
  fresh.pinned = !fresh.pinned;
  fresh.pinned_at = fresh.pinned ? nowISO() : null;
  fresh.updated_at = fresh.updated_at || nowISO();
  await putDraft(db, fresh);
  renderList();
}

function confirmDelete(id) {
  if (!('showModal' in elDialog)) {
    if (confirm('この下書きを削除しますか？')) {
      deleteDraft(db, id).then(renderList);
    }
    return;
  }
  elDialog.returnValue = '';
  elDialog.showModal();
  const onClose = () => {
    elConfirmDelete.removeEventListener('click', onDel);
    elConfirmCancel.removeEventListener('click', onCancel);
  };
  const onDel = async () => {
    await deleteDraft(db, id);
    elDialog.close(); onClose(); renderList();
  };
  const onCancel = () => { elDialog.close(); onClose(); };
  elConfirmDelete.addEventListener('click', onDel, { once: true });
  elConfirmCancel.addEventListener('click', onCancel, { once: true });
}

async function loadForEdit(id) {
  const d = await getDraft(db, id);
  if (!d) return;
  currentEditingId = id;
  elText.value = d.content;
  lastSavedContent = d.content; // last saved for this draft
  countChars();
  switchTab('input');
}

// ---- Save / Copy / Delete (input) ----
async function onSave() {
  const content = elText.value;
  if (!content) { showToast('内容が空です'); return; }

  if (lastSavedContent !== null && content === lastSavedContent) {
    return;
  }

  const now = nowISO();

  try {
    if (currentEditingId) {
      const existing = await getDraft(db, currentEditingId);
      if (existing) {
        existing.content = content;
        existing.updated_at = now;
        await putDraft(db, existing);
        lastSavedContent = content;
        showToast('保存しました');
      }
    } else {
      const total = await countDrafts(db);
      if (total >= 100) {
        showToast('保存できません。上限（100件）に達しました。不要な下書きを削除してください。');
        return;
      }
      const draft = { content, created_at: now, updated_at: now, pinned: false, pinned_at: null };
      const id = await addDraft(db, draft);
      currentEditingId = id;
      lastSavedContent = content;
      showToast('保存しました');
    }
    renderList();
  } catch (err) {
    const name = err?.name || '';
    if (name.includes('Quota') || name.includes('NS_ERROR_DOM_QUOTA_REACHED')) {
      showToast('端末の保存容量が不足しているため保存できません。不要な下書きや端末のストレージを整理してください。');
      console.error('Quota error:', err);
    } else {
      console.error('Save error', err);
      showToast('保存に失敗しました');
    }
  }
}

async function onCopy() {
  const normalized = normalizeForCopy(elText.value);
  try {
    await navigator.clipboard.writeText(normalized);
    showToast('コピーしました');
  } catch (e) {
    console.error(e);
    showToast('コピーに失敗しました');
  }
}

function onReset() {
  elText.value = '';
  countChars();
  currentEditingId = null;
  lastSavedContent = null;
}

// ---- Shortcuts ----
function setupShortcuts() {
  document.addEventListener('keydown', (e) => {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); onSave(); }
    if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
      e.preventDefault(); elSearch.focus();
    }
    if (e.altKey && e.key === '1') { e.preventDefault(); switchTab('input'); }
    if (e.altKey && e.key === '2') { e.preventDefault(); switchTab('saved'); }
    if (e.key === 'Escape' && elDialog.open) { e.preventDefault(); elDialog.close(); }
  });
}

// ---- Event wiring ----
function wireEvents() {
  elText.addEventListener('input', countChars);
  elBtnSave.addEventListener('click', onSave);
  elBtnCopy.addEventListener('click', onCopy);
  elBtnDelete.addEventListener('click', onReset);
  elTabInput.addEventListener('click', () => switchTab('input'));
  elTabSaved.addEventListener('click', () => { switchTab('saved'); renderList(); });
  elSearch.addEventListener('input', renderList);
}

// ---- PWA registration ----
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(console.error);
  }
}

// ---- Init ----
async function init() {
  db = await openDB();
  wireEvents();
  setupShortcuts();
  countChars();
  renderList();
  registerSW();
}

init().catch(err => console.error(err));

