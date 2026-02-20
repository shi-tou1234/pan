/**
 * GitHub REST API wrapper for Pan 网盘
 * Handles all CRUD operations against a GitHub repository.
 */

const GitHubAPI = (() => {
  const BASE = 'https://api.github.com';

  // ─── Config helpers ─────────────────────────────────
  function getConfig() {
    try { return JSON.parse(localStorage.getItem('pan_config') || 'null'); }
    catch { return null; }
  }
  function setConfig(cfg) {
    localStorage.setItem('pan_config', JSON.stringify(cfg));
  }
  function clearConfig() {
    localStorage.removeItem('pan_config');
  }

  // ─── HTTP helpers ─────────────────────────────────
  async function request(method, path, body = null) {
    const cfg = getConfig();
    if (!cfg) throw new Error('未配置 GitHub 凭证');

    const headers = {
      'Authorization': `token ${cfg.token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (body) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // 204 No Content
    if (res.status === 204) return null;

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }
    return data;
  }

  // Build the contents API path
  function contentsPath(filePath) {
    const cfg = getConfig();
    const dir = cfg.dir.replace(/^\/|\/$/g, '');
    const fp  = filePath ? filePath.replace(/^\//, '') : '';
    const full = fp ? `${dir}/${fp}` : dir;
    return `/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIPath(full)}`;
  }

  function encodeURIPath(path) {
    return path.split('/').map(s => encodeURIComponent(s)).join('/');
  }

  // ─── Raw download URL ─────────────────────────────
  function rawUrl(filePath) {
    const cfg = getConfig();
    const dir = cfg.dir.replace(/^\/|\/$/g, '');
    const fp  = filePath.replace(/^\//, '');
    const full = fp ? `${dir}/${fp}` : dir;
    return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${encodeURIPath(full)}?token=${Date.now()}`;
  }

  // ─── Verify connection ─────────────────────────────
  async function verifyConnection() {
    const cfg = getConfig();
    const data = await request('GET', `/repos/${cfg.owner}/${cfg.repo}`);
    return data;
  }

  // ─── List directory contents ─────────────────────
  async function listDir(subPath = '') {
    const p = contentsPath(subPath);
    let data;
    try {
      data = await request('GET', p + `?ref=${getConfig().branch}&t=${Date.now()}`);
    } catch (e) {
      // If 404, directory might not exist – return empty
      if (e.message.includes('404') || e.message.includes('Not Found')) return [];
      throw e;
    }
    if (!Array.isArray(data)) return [];
    return data;
  }

  // ─── Upload file (≤ 100 MB via Contents API) ──────
  async function uploadFile(path, arrayBuffer, message = null) {
    const cfg = getConfig();
    const base64 = arrayBufferToBase64(arrayBuffer);
    const apiPath = contentsPath(path);

    // Check if file exists first (to get SHA for update)
    let sha;
    try {
      const existing = await request('GET', apiPath + `?ref=${cfg.branch}`);
      if (existing && existing.sha) sha = existing.sha;
    } catch { /* new file */ }

    const body = {
      message: message || `Upload ${path.split('/').pop()} via Pan`,
      content: base64,
      branch: cfg.branch,
    };
    if (sha) body.sha = sha;

    return request('PUT', apiPath, body);
  }

  // ─── Delete file ─────────────────────────────────
  async function deleteFile(path, sha, message = null) {
    const cfg = getConfig();
    return request('DELETE', contentsPath(path), {
      message: message || `Delete ${path.split('/').pop()} via Pan`,
      sha,
      branch: cfg.branch,
    });
  }

  // ─── Create folder (.gitkeep placeholder) ────────
  async function createFolder(folderPath) {
    const cfg = getConfig();
    const placeholderPath = folderPath.replace(/\/$/, '') + '/.gitkeep';
    const apiPath = contentsPath(placeholderPath);
    return request('PUT', apiPath, {
      message: `Create folder ${folderPath} via Pan`,
      content: btoa(''),
      branch: cfg.branch,
    });
  }

  // ─── Get file info (with SHA) ─────────────────────
  async function getFileInfo(path) {
    const cfg = getConfig();
    return request('GET', contentsPath(path) + `?ref=${cfg.branch}`);
  }

  // ─── Rename file (copy + delete) ─────────────────
  async function renameFile(oldPath, newName) {
    // Fetch original content
    const cfg = getConfig();
    const info = await getFileInfo(oldPath);
    if (info.type !== 'file') throw new Error('只支持重命名文件（非文件夹）');

    // Determine new path
    const parts = oldPath.split('/');
    parts[parts.length - 1] = newName;
    const newPath = parts.join('/');

    // Decode content (base64)
    const content = info.content; // already base64 from API
    const cleanB64 = content.replace(/\n/g, '');

    // Upload with new name
    await request('PUT', contentsPath(newPath), {
      message: `Rename ${oldPath} → ${newPath} via Pan`,
      content: cleanB64,
      branch: cfg.branch,
    });

    // Delete old file
    await deleteFile(oldPath, info.sha);
    return newPath;
  }

  // ─── Rename folder (recursive copy + delete) ─────
  async function renameFolder(oldFolderPath, newName) {
    const parts = oldFolderPath.replace(/\/$/, '').split('/');
    parts[parts.length - 1] = newName;
    const newFolderPath = parts.join('/');

    await copyDir(oldFolderPath, newFolderPath);
    await deleteDir(oldFolderPath);
    return newFolderPath;
  }

  async function copyDir(srcPath, destPath) {
    const items = await listDirRaw(srcPath);
    for (const item of items) {
      const relPath = item.path.substring(item.path.indexOf(srcPath) + srcPath.length).replace(/^\//, '');
      if (item.type === 'file') {
        const info = await getFileInfoByRawPath(item.path);
        const cleanB64 = info.content.replace(/\n/g, '');
        const newPath = destPath + '/' + relPath;
        await request('PUT', contentsPathByRaw(newPath), {
          message: `Copy to ${newPath} via Pan`,
          content: cleanB64,
          branch: getConfig().branch,
        });
      } else if (item.type === 'dir') {
        const subRel = item.path.substring(item.path.indexOf(srcPath) + srcPath.length).replace(/^\//, '');
        await copyDir(item.path.replace(`${getConfig().owner}/${getConfig().repo}/contents/`, ''), `${destPath}/${subRel}`);
      }
    }
  }

  async function deleteDir(folderPath) {
    const cfg = getConfig();
    const dir = cfg.dir.replace(/^\/|\/$/g, '');
    const full = `${dir}/${folderPath}`;
    const apiPath = `/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIPath(full)}?ref=${cfg.branch}`;
    let items;
    try { items = await request('GET', apiPath); } catch { return; }
    if (!Array.isArray(items)) return;
    for (const item of items) {
      const subPath = item.path.replace(`${dir}/`, '');
      if (item.type === 'file') {
        await deleteFile(subPath, item.sha);
      } else if (item.type === 'dir') {
        await deleteDir(subPath.replace(`${dir}/`, ''));
      }
    }
  }

  async function listDirRaw(subPath) {
    const cfg = getConfig();
    const dir = cfg.dir.replace(/^\/|\/$/g, '');
    const full = subPath ? `${dir}/${subPath}` : dir;
    try {
      const data = await request('GET', `/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIPath(full)}?ref=${cfg.branch}`);
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }

  async function getFileInfoByRawPath(rawApiPath) {
    return request('GET', `/repos/${rawApiPath}?ref=${getConfig().branch}`);
  }

  function contentsPathByRaw(relPath) {
    const cfg = getConfig();
    const dir = cfg.dir.replace(/^\/|\/$/g, '');
    return `/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIPath(dir + '/' + relPath)}`;
  }

  // ─── Get repository info (size etc.) ─────────────
  async function getRepoInfo() {
    const cfg = getConfig();
    return request('GET', `/repos/${cfg.owner}/${cfg.repo}`);
  }

  // ─── Helpers ─────────────────────────────────────
  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  function base64ToBlob(b64, mime) {
    const clean = b64.replace(/\n/g, '');
    const bin = atob(clean);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // ─── Fetch raw file content (text) ───────────────
  async function fetchRawText(downloadUrl) {
    const cfg = getConfig();
    const res = await fetch(downloadUrl, {
      headers: { 'Authorization': `token ${cfg.token}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    return res.text();
  }

  async function fetchRawArrayBuffer(downloadUrl) {
    const cfg = getConfig();
    const res = await fetch(downloadUrl, {
      headers: { 'Authorization': `token ${cfg.token}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    return res.arrayBuffer();
  }

  // ─── Download trigger ─────────────────────────────
  async function downloadFile(item) {
    const url = item.download_url;
    const a = document.createElement('a');
    a.href = url;
    a.download = item.name;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return {
    getConfig, setConfig, clearConfig,
    verifyConnection,
    listDir,
    uploadFile,
    deleteFile,
    deleteDir,
    createFolder,
    getFileInfo,
    renameFile,
    renameFolder,
    getRepoInfo,
    fetchRawText,
    fetchRawArrayBuffer,
    downloadFile,
    base64ToBlob,
    rawUrl,
    contentsPath,
  };
})();
