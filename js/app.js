/**
 * Pan 网盘 – Main Application
 * Wires together the GitHub API and Preview modules.
 */

// ─── State ────────────────────────────────────────
let state = {
  files: [],           // current directory file list (raw API items)
  displayFiles: [],    // filtered + sorted files
  currentPath: '',     // relative path inside cfg.dir ('' = root)
  category: 'all',     // sidebar category filter
  viewMode: 'grid',    // 'grid' | 'list'
  sortKey: 'name',     // 'name' | 'size' | 'time'
  sortAsc: true,
  searchQuery: '',
  selectedFiles: new Set(),
  previewIndex: -1,    // index in displayFiles for current preview
  previewItem: null,   // item currently being previewed
  uploadPanelOpen: true,
  ctxTarget: null,     // file card right-clicked
};

// ─── Init ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const cfg = GitHubAPI.getConfig();
  if (cfg && cfg.token && cfg.owner && cfg.repo) {
    showApp();
    loadFiles();
  } else {
    document.getElementById('setup-modal').style.display = 'flex';
  }

  // Drag and drop
  initDragDrop();
  // Close context menu on click
  document.addEventListener('click', e => {
    if (!e.target.closest('.context-menu')) hideContextMenu();
  });
  // Keyboard
  document.addEventListener('keydown', handleKeyDown);
});

// ─── Setup / Config ───────────────────────────────
async function saveConfig() {
  const btn = document.getElementById('setup-save-btn');
  const errEl = document.getElementById('setup-error');
  errEl.style.display = 'none';

  const cfg = {
    token:  document.getElementById('cfg-token').value.trim(),
    owner:  document.getElementById('cfg-owner').value.trim(),
    repo:   document.getElementById('cfg-repo').value.trim(),
    branch: document.getElementById('cfg-branch').value.trim() || 'main',
    dir:    document.getElementById('cfg-dir').value.trim() || 'files',
  };

  if (!cfg.token || !cfg.owner || !cfg.repo) {
    errEl.textContent = '请填写所有必填字段';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 连接中...';

  GitHubAPI.setConfig(cfg);
  try {
    await GitHubAPI.verifyConnection();
    document.getElementById('setup-modal').style.display = 'none';
    showApp();
    await loadFiles();
  } catch (e) {
    errEl.textContent = '连接失败：' + e.message;
    errEl.style.display = 'block';
    GitHubAPI.clearConfig();
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> 保存并连接';
  }
}

function showApp() {
  document.getElementById('app').style.display = 'flex';
  // Update view mode class
  setViewMode(state.viewMode);
  // Poll storage info
  loadStorageInfo();
}

function clearConfig() {
  GitHubAPI.clearConfig();
  document.getElementById('settings-modal').style.display = 'none';
  document.getElementById('app').style.display = 'none';
  document.getElementById('setup-modal').style.display = 'flex';
}

// ─── Settings Modal ───────────────────────────────
function openSettings() {
  const cfg = GitHubAPI.getConfig() || {};
  document.getElementById('s-token').value  = cfg.token  || '';
  document.getElementById('s-owner').value  = cfg.owner  || '';
  document.getElementById('s-repo').value   = cfg.repo   || '';
  document.getElementById('s-branch').value = cfg.branch || 'main';
  document.getElementById('s-dir').value    = cfg.dir    || 'files';
  document.getElementById('settings-modal').style.display = 'flex';
}
function closeSettings() { document.getElementById('settings-modal').style.display = 'none'; }
async function saveSettings() {
  const cfg = {
    token:  document.getElementById('s-token').value.trim(),
    owner:  document.getElementById('s-owner').value.trim(),
    repo:   document.getElementById('s-repo').value.trim(),
    branch: document.getElementById('s-branch').value.trim() || 'main',
    dir:    document.getElementById('s-dir').value.trim() || 'files',
  };
  if (!cfg.token || !cfg.owner || !cfg.repo) { showToast('请填写所有必填字段', 'warning'); return; }
  GitHubAPI.setConfig(cfg);
  showToast('设置已保存', 'success');
  closeSettings();
  await loadFiles();
}

// ─── File Loading ─────────────────────────────────
async function loadFiles() {
  showLoadingState();
  state.selectedFiles.clear();
  updateBatchActions();

  try {
    const rawItems = await GitHubAPI.listDir(state.currentPath);
    // Filter out .gitkeep
    state.files = rawItems.filter(f => f.name !== '.gitkeep');
    applyFiltersAndSort();
    renderFiles();
    loadStorageInfo();
  } catch (e) {
    hideLoadingState();
    showToast('加载失败：' + e.message, 'error');
    console.error(e);
  }
}

// ─── Storage Info ─────────────────────────────────
async function loadStorageInfo() {
  try {
    const info = await GitHubAPI.getRepoInfo();
    const sizeMB = (info.size / 1024).toFixed(1); // GitHub reports in KB
    document.getElementById('storage-size').textContent = sizeMB + ' MB';
    // GitHub free repos have no "hard" limit shown; use 1GB as reference
    const pct = Math.min(100, (info.size / (1024 * 1024)) * 100);
    document.getElementById('storage-fill').style.width = pct + '%';
  } catch { /* silent */ }
}

// ─── Filter & Sort ────────────────────────────────
function applyFiltersAndSort() {
  let files = [...state.files];

  // Category filter
  if (state.category !== 'all') {
    files = files.filter(f => {
      if (f.type === 'dir') return state.category === 'all';
      const t = Preview.getType(f.name);
      return (
        (state.category === 'image'   && t === 'image') ||
        (state.category === 'video'   && t === 'video') ||
        (state.category === 'audio'   && t === 'audio') ||
        (state.category === 'doc'     && ['pdf','word','excel','ppt'].includes(t)) ||
        (state.category === 'archive' && t === 'zip') ||
        (state.category === 'other'   && ['code','text','md','other'].includes(t))
      );
    });
  }

  // Search filter
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    files = files.filter(f => f.name.toLowerCase().includes(q));
  }

  // Sort: folders first, then by key
  files.sort((a, b) => {
    if (a.type === 'dir' && b.type !== 'dir') return -1;
    if (a.type !== 'dir' && b.type === 'dir') return 1;
    let cmp = 0;
    if (state.sortKey === 'name') cmp = a.name.localeCompare(b.name, 'zh-CN');
    else if (state.sortKey === 'size') cmp = (a.size || 0) - (b.size || 0);
    else if (state.sortKey === 'time') cmp = 0; // GitHub contents API doesn't return time
    return state.sortAsc ? cmp : -cmp;
  });

  state.displayFiles = files;
}

function sortBy(key) {
  if (state.sortKey === key) { state.sortAsc = !state.sortAsc; }
  else { state.sortKey = key; state.sortAsc = true; }
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === key));
  applyFiltersAndSort();
  renderFiles();
}

function onSearch(val) {
  state.searchQuery = val;
  const clearBtn = document.getElementById('search-clear');
  clearBtn.style.display = val ? 'flex' : 'none';
  applyFiltersAndSort();
  renderFiles();
}
function clearSearch() {
  document.getElementById('search-input').value = '';
  onSearch('');
}

function switchCategory(cat) {
  state.category = cat;
  state.currentPath = '';
  state.searchQuery = '';
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').style.display = 'none';
  // Update sidebar active
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.cat === cat));
  // Rebuild breadcrumb
  buildBreadcrumb([]);
  applyFiltersAndSort();
  renderFiles();
}

// ─── Render Files ─────────────────────────────────
function renderFiles() {
  hideLoadingState();
  const grid = document.getElementById('file-grid');
  grid.innerHTML = '';

  if (state.displayFiles.length === 0) {
    document.getElementById('empty-state').style.display = 'flex';
    return;
  }
  document.getElementById('empty-state').style.display = 'none';

  state.displayFiles.forEach((item, idx) => {
    const card = createFileCard(item, idx);
    grid.appendChild(card);
  });
}

function createFileCard(item, idx) {
  const isFolder = item.type === 'dir';
  const type     = isFolder ? 'folder' : Preview.getType(item.name);
  const icon     = isFolder ? 'fa-folder' : Preview.getIcon(item.name);
  const colorCls = isFolder ? '' : Preview.getColorClass(item.name);

  const card = document.createElement('div');
  card.className = `file-card${state.selectedFiles.has(item.name) ? ' selected' : ''}`;
  card.dataset.name = item.name;
  card.dataset.type = type;
  card.title = item.name;

  // Thumb HTML
  let thumbHtml;
  if (isFolder) {
    thumbHtml = `<i class="fa-solid fa-folder" style="color:#faad14;font-size:${state.viewMode==='grid'?36:22}px"></i>`;
  } else if (type === 'image' && item.download_url) {
    thumbHtml = `<img src="${item.download_url}" alt="${item.name}" loading="lazy" onerror="this.parentNode.innerHTML='<i class=\\'fa-solid ${icon}\\' />'">`;
  } else {
    thumbHtml = `<i class="fa-solid ${icon}"></i>`;
  }

  const metaHtml = state.viewMode === 'list'
    ? `<div class="card-meta">
        <span>${item.size ? Preview.formatSize(item.size) : (isFolder ? '文件夹' : '--')}</span>
       </div>`
    : '';

  card.innerHTML = `
    <label class="card-check" onclick="event.stopPropagation()">
      <input type="checkbox" ${state.selectedFiles.has(item.name) ? 'checked' : ''} onchange="toggleSelect('${escapeHtml(item.name)}', this.checked)" />
    </label>
    <div class="card-thumb ${colorCls}">${thumbHtml}</div>
    <div class="card-name">${escapeHtml(item.name)}</div>
    ${metaHtml}
    <button class="card-more" onclick="showContextMenu(event, '${escapeHtml(item.name)}')" title="更多">
      <i class="fa-solid fa-ellipsis-vertical"></i>
    </button>`;

  // Events
  let clickTimer = null;
  card.addEventListener('click', e => {
    if (e.target.closest('.card-check') || e.target.closest('.card-more')) return;
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
      // Double click
      openItem(item);
    } else {
      clickTimer = setTimeout(() => {
        clickTimer = null;
        // Single click – select
        if (state.selectedFiles.has(item.name)) {
          state.selectedFiles.delete(item.name);
          card.classList.remove('selected');
          card.querySelector('input[type=checkbox]').checked = false;
        } else {
          state.selectedFiles.add(item.name);
          card.classList.add('selected');
          card.querySelector('input[type=checkbox]').checked = true;
        }
        updateBatchActions();
      }, 220);
    }
  });

  card.addEventListener('contextmenu', e => {
    e.preventDefault();
    showContextMenu(e, item.name);
  });

  return card;
}

// ─── Navigation ───────────────────────────────────
function openItem(item) {
  if (item.type === 'dir') {
    openFolder(item);
  } else {
    openFilePreview(item);
  }
}

function openFolder(item) {
  const newPath = state.currentPath ? `${state.currentPath}/${item.name}` : item.name;
  state.currentPath = newPath;
  state.searchQuery = '';
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').style.display = 'none';

  // Breadcrumb
  const parts = state.currentPath.split('/').filter(Boolean);
  buildBreadcrumb(parts);

  loadFiles();
}

function goHome() {
  state.currentPath = '';
  state.category = 'all';
  state.searchQuery = '';
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').style.display = 'none';
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.cat === 'all'));
  buildBreadcrumb([]);
  loadFiles();
}

function buildBreadcrumb(parts) {
  const bc = document.getElementById('breadcrumb');
  bc.innerHTML = `<span class="bc-item bc-home" onclick="goHome()"><i class="fa-solid fa-house"></i> 全部文件</span>`;

  parts.forEach((p, i) => {
    const sep = document.createElement('span');
    sep.className = 'bc-sep';
    sep.innerHTML = '<i class="fa-solid fa-chevron-right" style="font-size:10px"></i>';
    bc.appendChild(sep);

    const item = document.createElement('span');
    item.className = 'bc-item';
    item.textContent = p;
    item.onclick = () => {
      state.currentPath = parts.slice(0, i + 1).join('/');
      buildBreadcrumb(parts.slice(0, i + 1));
      loadFiles();
    };
    bc.appendChild(item);
  });
}

// ─── View Mode ────────────────────────────────────
function toggleView() {
  setViewMode(state.viewMode === 'grid' ? 'list' : 'grid');
}
function setViewMode(mode) {
  state.viewMode = mode;
  const grid = document.getElementById('file-grid');
  grid.className = `file-grid ${mode}-mode`;
  const btn = document.getElementById('view-btn');
  btn.innerHTML = mode === 'grid'
    ? '<i class="fa-solid fa-list"></i>'
    : '<i class="fa-solid fa-grip"></i>';
  // Re-render
  renderFiles();
}

// ─── Selection ────────────────────────────────────
function toggleSelect(name, checked) {
  if (checked) state.selectedFiles.add(name);
  else state.selectedFiles.delete(name);
  updateBatchActions();
  // Update card class
  document.querySelectorAll('.file-card').forEach(c => {
    if (c.dataset.name === name) c.classList.toggle('selected', checked);
  });
  // Update select-all
  const cb = document.getElementById('select-all-cb');
  cb.checked = state.selectedFiles.size === state.displayFiles.length;
  cb.indeterminate = state.selectedFiles.size > 0 && state.selectedFiles.size < state.displayFiles.length;
}

function toggleSelectAll(checked) {
  if (checked) {
    state.displayFiles.forEach(f => state.selectedFiles.add(f.name));
  } else {
    state.selectedFiles.clear();
  }
  document.querySelectorAll('.file-card').forEach(c => {
    c.classList.toggle('selected', checked);
    const cb = c.querySelector('input[type=checkbox]');
    if (cb) cb.checked = checked;
  });
  updateBatchActions();
}

function updateBatchActions() {
  const batch = document.getElementById('batch-actions');
  batch.style.display = state.selectedFiles.size > 0 ? 'flex' : 'none';
}

// ─── Upload ───────────────────────────────────────
function triggerUpload() { document.getElementById('file-input').click(); }
function triggerFolderUpload() { document.getElementById('folder-input').click(); }

async function handleFileSelect(files) {
  if (!files || files.length === 0) return;
  const panel = document.getElementById('upload-panel');
  panel.style.display = 'block';

  for (const file of Array.from(files)) {
    const relPath = file.webkitRelativePath || file.name;
    await uploadSingleFile(file, relPath);
  }

  // Refresh
  setTimeout(() => loadFiles(), 800);
}

async function uploadSingleFile(file, relPath) {
  const list = document.getElementById('upload-list');
  const itemEl = document.createElement('div');
  itemEl.className = 'upload-item';
  const icon = Preview.getIcon(file.name);
  const colorCls = Preview.getColorClass(file.name);
  itemEl.innerHTML = `
    <div class="upload-item-icon ${colorCls}"><i class="fa-solid ${icon}"></i></div>
    <div class="upload-item-info">
      <div class="upload-item-name">${escapeHtml(relPath)}</div>
      <div class="upload-item-bar"><div class="upload-item-fill" style="width:0%"></div></div>
    </div>
    <div class="upload-item-status wait"><i class="fa-solid fa-clock"></i></div>`;
  list.appendChild(itemEl);
  list.scrollTop = list.scrollHeight;

  const fill = itemEl.querySelector('.upload-item-fill');
  const statusEl = itemEl.querySelector('.upload-item-status');

  // Simulate progress during read
  fill.style.width = '20%';

  try {
    const buf = await readFile(file);
    fill.style.width = '60%';

    // Build upload path
    let uploadPath = relPath;
    if (state.currentPath) {
      uploadPath = `${state.currentPath}/${relPath}`;
    }
    uploadPath = uploadPath.replace(/^\//, '');

    fill.style.width = '80%';
    await GitHubAPI.uploadFile(uploadPath, buf);
    fill.style.width = '100%';
    statusEl.className = 'upload-item-status ok';
    statusEl.innerHTML = '<i class="fa-solid fa-check-circle"></i>';

    // Check file size limit
    if (file.size > 100 * 1024 * 1024) {
      statusEl.className = 'upload-item-status err';
      statusEl.innerHTML = '<i class="fa-solid fa-exclamation-circle"></i>';
      showToast(`${file.name} 超过 100MB 限制`, 'error');
      return;
    }

  } catch (e) {
    fill.style.width = '100%';
    fill.style.background = 'var(--danger)';
    statusEl.className = 'upload-item-status err';
    statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
    showToast(`上传失败: ${e.message}`, 'error');
  }
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function toggleUploadPanel() {
  state.uploadPanelOpen = !state.uploadPanelOpen;
  const list = document.getElementById('upload-list');
  list.style.display = state.uploadPanelOpen ? '' : 'none';
  document.getElementById('upload-panel-icon').className =
    state.uploadPanelOpen ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-up';
}

// ─── Drag & Drop ─────────────────────────────────
function initDragDrop() {
  const main = document.querySelector('.main');
  let dragCounter = 0;

  document.addEventListener('dragenter', e => {
    if (e.dataTransfer.types.includes('Files')) {
      dragCounter++;
      document.body.classList.add('drag-over');
    }
  });
  document.addEventListener('dragleave', e => {
    dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; document.body.classList.remove('drag-over'); }
  });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    dragCounter = 0;
    document.body.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length) handleFileSelect(files);
  });
}

// ─── Delete ───────────────────────────────────────
async function deleteSelected() {
  if (state.selectedFiles.size === 0) return;
  const names = [...state.selectedFiles];
  if (!confirm(`确定删除 ${names.length} 个文件吗？此操作不可恢复。`)) return;

  showToast(`删除中...`, 'info');
  for (const name of names) {
    const item = state.files.find(f => f.name === name);
    if (!item) continue;
    try {
      const path = state.currentPath ? `${state.currentPath}/${item.name}` : item.name;
      if (item.type === 'dir') {
        await GitHubAPI.deleteDir(path);
      } else {
        await GitHubAPI.deleteFile(path, item.sha);
      }
    } catch (e) {
      showToast(`删除 ${name} 失败: ${e.message}`, 'error');
    }
  }
  state.selectedFiles.clear();
  showToast('删除完成', 'success');
  await loadFiles();
}

async function downloadSelected() {
  for (const name of state.selectedFiles) {
    const item = state.files.find(f => f.name === name);
    if (item && item.type === 'file') await GitHubAPI.downloadFile(item);
  }
}

// ─── New Folder ───────────────────────────────────
function createFolderPrompt() {
  document.getElementById('folder-name-input').value = '';
  document.getElementById('folder-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('folder-name-input').focus(), 50);
}
function closeFolderModal() { document.getElementById('folder-modal').style.display = 'none'; }
async function confirmCreateFolder() {
  const name = document.getElementById('folder-name-input').value.trim();
  if (!name) { showToast('文件夹名称不能为空', 'warning'); return; }
  closeFolderModal();
  try {
    const path = state.currentPath ? `${state.currentPath}/${name}` : name;
    await GitHubAPI.createFolder(path);
    showToast(`文件夹 "${name}" 创建成功`, 'success');
    await loadFiles();
  } catch (e) {
    showToast('创建失败: ' + e.message, 'error');
  }
}

// ─── Context Menu ─────────────────────────────────
function showContextMenu(e, name) {
  e.preventDefault();
  e.stopPropagation();
  state.ctxTarget = state.files.find(f => f.name === name);

  const menu = document.getElementById('context-menu');
  menu.style.display = 'block';

  const x = Math.min(e.clientX, window.innerWidth - 180);
  const y = Math.min(e.clientY, window.innerHeight - 240);
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
}

function hideContextMenu() { document.getElementById('context-menu').style.display = 'none'; }

function ctxOpen() {
  hideContextMenu();
  if (!state.ctxTarget) return;
  openItem(state.ctxTarget);
}

async function ctxDownload() {
  hideContextMenu();
  if (!state.ctxTarget || state.ctxTarget.type === 'dir') {
    showToast('暂不支持下载文件夹', 'warning');
    return;
  }
  await GitHubAPI.downloadFile(state.ctxTarget);
}

function ctxRename() {
  hideContextMenu();
  if (!state.ctxTarget) return;
  document.getElementById('rename-input').value = state.ctxTarget.name;
  document.getElementById('rename-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('rename-input').focus(), 50);
}

function closeRenameModal() { document.getElementById('rename-modal').style.display = 'none'; }

async function confirmRename() {
  const newName = document.getElementById('rename-input').value.trim();
  if (!newName) { showToast('名称不能为空', 'warning'); return; }
  if (newName === state.ctxTarget.name) { closeRenameModal(); return; }

  closeRenameModal();
  showToast('重命名中...', 'info');
  try {
    const oldPath = state.currentPath
      ? `${state.currentPath}/${state.ctxTarget.name}`
      : state.ctxTarget.name;

    if (state.ctxTarget.type === 'dir') {
      await GitHubAPI.renameFolder(oldPath, newName);
    } else {
      await GitHubAPI.renameFile(oldPath, newName);
    }
    showToast('重命名成功', 'success');
    await loadFiles();
  } catch (e) {
    showToast('重命名失败: ' + e.message, 'error');
  }
}

async function ctxCopyLink() {
  hideContextMenu();
  if (!state.ctxTarget || state.ctxTarget.type === 'dir') {
    showToast('文件夹无法获取链接', 'warning');
    return;
  }
  const url = state.ctxTarget.download_url;
  try {
    await navigator.clipboard.writeText(url);
    showToast('链接已复制到剪贴板', 'success');
  } catch {
    prompt('请手动复制链接：', url);
  }
}

async function ctxDelete() {
  hideContextMenu();
  if (!state.ctxTarget) return;
  const item = state.ctxTarget;
  if (!confirm(`确定删除 "${item.name}" 吗？此操作不可恢复。`)) return;

  showToast('删除中...', 'info');
  try {
    const path = state.currentPath ? `${state.currentPath}/${item.name}` : item.name;
    if (item.type === 'dir') {
      await GitHubAPI.deleteDir(path);
    } else {
      await GitHubAPI.deleteFile(path, item.sha);
    }
    showToast(`"${item.name}" 已删除`, 'success');
    await loadFiles();
  } catch (e) {
    showToast('删除失败: ' + e.message, 'error');
  }
}

// ─── Preview ──────────────────────────────────────
function openFilePreview(item) {
  if (item.type === 'dir') { openFolder(item); return; }

  state.previewItem = item;
  state.previewIndex = state.displayFiles.findIndex(f => f.name === item.name);

  document.getElementById('preview-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';

  Preview.render(item);
  updatePreviewNav();
}

function closePreview() {
  document.getElementById('preview-modal').style.display = 'none';
  document.body.style.overflow = '';
  state.previewItem = null;
  // Stop any playing media
  const vid = document.querySelector('.preview-media');
  if (vid && vid.pause) vid.pause();
}

function closePreviewOnBg(e) {
  if (e.target === document.getElementById('preview-modal')) closePreview();
}

function previewNav(dir) {
  // Navigate among previewable files only
  const items = state.displayFiles.filter(f => f.type === 'file');
  const cur = items.findIndex(f => f.name === state.previewItem?.name);
  const next = cur + dir;
  if (next < 0 || next >= items.length) return;
  state.previewItem = items[next];
  state.previewIndex = state.displayFiles.findIndex(f => f.name === state.previewItem.name);
  Preview.render(state.previewItem);
  updatePreviewNav();
}

function updatePreviewNav() {
  const items = state.displayFiles.filter(f => f.type === 'file');
  const cur = items.findIndex(f => f.name === state.previewItem?.name);
  document.getElementById('prev-file-btn').disabled = cur <= 0;
  document.getElementById('next-file-btn').disabled = cur >= items.length - 1;
}

async function downloadCurrentPreview() {
  if (!state.previewItem) return;
  await GitHubAPI.downloadFile(state.previewItem);
}

// ─── Keyboard Shortcuts ───────────────────────────
function handleKeyDown(e) {
  const previewOpen = document.getElementById('preview-modal').style.display !== 'none';

  if (previewOpen) {
    if (e.key === 'Escape') closePreview();
    if (e.key === 'ArrowLeft') previewNav(-1);
    if (e.key === 'ArrowRight') previewNav(1);
    return;
  }

  if (e.key === 'Escape') {
    state.selectedFiles.clear();
    document.querySelectorAll('.file-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.card-check input').forEach(cb => cb.checked = false);
    updateBatchActions();
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault();
    toggleSelectAll(true);
    document.getElementById('select-all-cb').checked = true;
  }

  if (e.key === 'Delete' && state.selectedFiles.size > 0) {
    deleteSelected();
  }

  if (e.key === 'F5') {
    e.preventDefault();
    loadFiles();
  }
}

// ─── Helpers ─────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showLoadingState() {
  document.getElementById('loading-state').style.display = 'flex';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('file-grid').innerHTML = '';
}
function hideLoadingState() {
  document.getElementById('loading-state').style.display = 'none';
}

function togglePwd(id) {
  const input = document.getElementById(id);
  const btn = input.nextElementSibling;
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = '<i class="fa-regular fa-eye-slash"></i>';
  } else {
    input.type = 'password';
    btn.innerHTML = '<i class="fa-regular fa-eye"></i>';
  }
}

// ─── Toast ───────────────────────────────────────
function showToast(msg, type = 'info') {
  const icons = { success: 'fa-check-circle', error: 'fa-circle-xmark', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${icons[type] || 'fa-circle-info'}"></i> ${escapeHtml(msg)}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2900);
}
