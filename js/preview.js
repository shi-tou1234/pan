/**
 * Pan 网盘 – File Preview Module
 * Handles rendering previews for all common file types.
 */

const Preview = (() => {

  // ─── File type classification ────────────────────
  const TYPE_MAP = {
    image:   ['jpg','jpeg','png','gif','webp','svg','bmp','ico','avif','tiff'],
    video:   ['mp4','webm','ogg','mov','avi','mkv','flv','m4v'],
    audio:   ['mp3','wav','ogg','aac','flac','m4a','opus','weba'],
    pdf:     ['pdf'],
    word:    ['doc','docx'],
    excel:   ['xls','xlsx','csv'],
    ppt:     ['ppt','pptx'],
    code:    ['js','ts','jsx','tsx','py','java','c','cpp','cs','go','rs','rb',
              'php','swift','kt','dart','sh','bash','zsh','fish','ps1',
              'html','css','scss','sass','less','xml','json','yaml','yml',
              'toml','ini','env','conf','nginx','dockerfile','makefile',
              'sql','graphql','vue','svelte','astro','r','m','lua','pl',
              'ex','exs','erl','clj','hs','ml','scala'],
    text:    ['txt','log','gitignore','gitattributes','editorconfig','license',
              'readme','authors','changelog','contributing','notice'],
    md:      ['md','mdx','markdown'],
    zip:     ['zip','tar','gz','bz2','xz','7z','rar','tgz'],
  };

  const EXT_ICON = {
    // images
    jpg:'fa-file-image',jpeg:'fa-file-image',png:'fa-file-image',
    gif:'fa-file-image',webp:'fa-file-image',svg:'fa-file-image',
    bmp:'fa-file-image',ico:'fa-file-image',avif:'fa-file-image',
    // video
    mp4:'fa-file-video',webm:'fa-file-video',mov:'fa-file-video',
    avi:'fa-file-video',mkv:'fa-file-video',m4v:'fa-file-video',
    // audio
    mp3:'fa-file-audio',wav:'fa-file-audio',aac:'fa-file-audio',
    flac:'fa-file-audio',m4a:'fa-file-audio',
    // doc
    pdf:'fa-file-pdf',
    doc:'fa-file-word',docx:'fa-file-word',
    xls:'fa-file-excel',xlsx:'fa-file-excel',csv:'fa-file-csv',
    ppt:'fa-file-powerpoint',pptx:'fa-file-powerpoint',
    // code/text
    js:'fa-file-code',ts:'fa-file-code',jsx:'fa-file-code',tsx:'fa-file-code',
    py:'fa-file-code',java:'fa-file-code',c:'fa-file-code',cpp:'fa-file-code',
    html:'fa-file-code',css:'fa-file-code',json:'fa-file-code',
    xml:'fa-file-code',sql:'fa-file-code',php:'fa-file-code',
    md:'fa-file-lines',txt:'fa-file-lines',log:'fa-file-lines',
    // archive
    zip:'fa-file-zipper',rar:'fa-file-zipper',tar:'fa-file-zipper',
    gz:'fa-file-zipper','7z':'fa-file-zipper',bz2:'fa-file-zipper',
    xz:'fa-file-zipper',tgz:'fa-file-zipper',
  };

  const EXT_COLOR = {
    pdf:'icon-pdf', doc:'icon-word', docx:'icon-word',
    xls:'icon-excel', xlsx:'icon-excel', csv:'icon-excel',
    ppt:'icon-ppt', pptx:'icon-ppt',
    jpg:'icon-image',jpeg:'icon-image',png:'icon-image',gif:'icon-image',
    webp:'icon-image',svg:'icon-image',bmp:'icon-image',
    mp4:'icon-video',webm:'icon-video',mov:'icon-video',avi:'icon-video',
    mkv:'icon-video',
    mp3:'icon-audio',wav:'icon-audio',aac:'icon-audio',flac:'icon-audio',
    m4a:'icon-audio',
    zip:'icon-zip',rar:'icon-zip',tar:'icon-zip',gz:'icon-zip',
    '7z':'icon-zip',bz2:'icon-zip',tgz:'icon-zip',xz:'icon-zip',
    js:'icon-code',ts:'icon-code',jsx:'icon-code',tsx:'icon-code',
    py:'icon-code',java:'icon-code',html:'icon-code',css:'icon-code',
    json:'icon-code',
    md:'icon-text',txt:'icon-text',log:'icon-text',
  };

  function ext(filename) {
    return (filename.split('.').pop() || '').toLowerCase();
  }

  function getType(filename) {
    const e = ext(filename);
    for (const [type, exts] of Object.entries(TYPE_MAP)) {
      if (exts.includes(e)) return type;
    }
    return 'other';
  }

  function getIcon(filename) {
    const e = ext(filename);
    return EXT_ICON[e] || 'fa-file';
  }

  function getColorClass(filename) {
    const e = ext(filename);
    return EXT_COLOR[e] || 'icon-other';
  }

  function isPreviewable(filename) {
    const type = getType(filename);
    return ['image','video','audio','pdf','word','excel','ppt','code','text','md','zip'].includes(type);
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit' });
  }

  // ─── Render preview into #preview-body ──────────
  async function render(item) {
    const body = document.getElementById('preview-body');
    document.getElementById('preview-title').textContent = item.name;
    body.innerHTML = `<div class="preview-loading"><div class="spinner"></div></div>`;

    const type = getType(item.name);
    let downloadUrl = item.download_url;
    const cfg = GitHubAPI.getConfig();

    // Apply CDN proxy if enabled and it's a public repo (no token in URL)
    if (cfg && cfg.useProxy && downloadUrl && !downloadUrl.includes('?token=')) {
      downloadUrl = 'https://ghproxy.net/' + downloadUrl;
    }

    try {
      if (type === 'image') {
        await renderImage(body, downloadUrl, cfg);
      } else if (type === 'video') {
        renderVideo(body, downloadUrl, item.name);
      } else if (type === 'audio') {
        renderAudio(body, downloadUrl, item.name);
      } else if (type === 'pdf') {
        renderPDF(body, downloadUrl, cfg);
      } else if (type === 'word' || type === 'ppt') {
        renderOffice(body, { ...item, download_url: downloadUrl });
      } else if (type === 'excel') {
        renderOffice(body, { ...item, download_url: downloadUrl });
      } else if (type === 'md') {
        await renderMarkdown(body, downloadUrl, cfg);
      } else if (type === 'code' || type === 'text') {
        await renderCode(body, downloadUrl, item.name, cfg);
      } else if (type === 'zip') {
        await renderZip(body, downloadUrl, item.name, cfg);
      } else {
        renderFallback(body, item);
      }
    } catch (err) {
      console.error('Preview error', err);
      renderFallback(body, item, err.message);
    }
  }

  // ─── Image ───────────────────────────────────────
  async function renderImage(body, url, cfg) {
    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.className = 'preview-image-wrap';
      const img = document.createElement('img');
      img.onload = () => { body.innerHTML = ''; body.appendChild(wrap); resolve(); };
      img.onerror = () => { body.innerHTML = ''; body.appendChild(wrap); resolve(); };
      img.src = url;
      img.alt = 'preview';
      img.onclick = () => img.classList.toggle('zoomed');
      wrap.appendChild(img);
    });
  }

  // ─── Video ───────────────────────────────────────
  function renderVideo(body, url, name) {
    body.innerHTML = '';
    const video = document.createElement('video');
    video.className = 'preview-media';
    video.controls = true;
    video.autoplay = false;
    video.src = url;
    body.appendChild(video);
  }

  // ─── Audio ───────────────────────────────────────
  function renderAudio(body, url, name) {
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:24px;padding:40px;';
    const icon = document.createElement('div');
    icon.innerHTML = `<i class="fa-solid fa-music" style="font-size:80px;color:#13c2c2;opacity:.7"></i>`;
    const title = document.createElement('p');
    title.textContent = name;
    title.style.cssText = 'color:#e0e0e0;font-size:15px;font-weight:500;';
    const audio = document.createElement('audio');
    audio.className = 'preview-media';
    audio.controls = true;
    audio.src = url;
    audio.style.cssText = 'width:340px;';
    wrap.appendChild(icon);
    wrap.appendChild(title);
    wrap.appendChild(audio);
    body.appendChild(wrap);
  }

  // ─── PDF ─────────────────────────────────────────
  function renderPDF(body, url, cfg) {
    // Try Google Docs Viewer for GitHub raw URLs (avoids auth issues)
    body.innerHTML = '';
    const encodedUrl = encodeURIComponent(url);
    const viewerUrl = `https://docs.google.com/viewer?url=${encodedUrl}&embedded=true`;
    const iframe = document.createElement('iframe');
    iframe.className = 'preview-iframe';
    iframe.src = viewerUrl;
    iframe.onload = () => {};
    body.appendChild(iframe);
  }

  // ─── Office (Word / Excel / PPT) ─────────────────
  function renderOffice(body, item) {
    body.innerHTML = '';
    const url = item.download_url;
    const encodedUrl = encodeURIComponent(url);
    // Microsoft Office Online Viewer
    const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`;
    const iframe = document.createElement('iframe');
    iframe.className = 'preview-iframe';
    iframe.src = viewerUrl;
    body.appendChild(iframe);
  }

  // ─── Markdown ────────────────────────────────────
  async function renderMarkdown(body, url, cfg) {
    const text = await GitHubAPI.fetchRawText(url);
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'preview-md-wrap';
    wrap.innerHTML = marked.parse(text);
    body.appendChild(wrap);
  }

  // ─── Code / Text ─────────────────────────────────
  async function renderCode(body, url, filename, cfg) {
    const text = await GitHubAPI.fetchRawText(url);
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'preview-code-wrap';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    // Guess language from extension
    const e = ext(filename);
    const langMap = {
      js:'javascript', ts:'typescript', jsx:'javascript', tsx:'typescript',
      py:'python', java:'java', c:'c', cpp:'cpp', cs:'csharp', go:'go',
      rs:'rust', rb:'ruby', php:'php', swift:'swift', kt:'kotlin',
      dart:'dart', sh:'bash', bash:'bash', html:'html', css:'css',
      scss:'scss', json:'json', xml:'xml', sql:'sql', yaml:'yaml',
      yml:'yaml', md:'markdown', vue:'xml', svelte:'xml', r:'r',
    };
    const lang = langMap[e] || '';
    if (lang) code.className = `language-${lang}`;
    code.textContent = text;
    pre.appendChild(code);
    wrap.appendChild(pre);
    body.appendChild(wrap);
    // Apply highlight.js
    if (window.hljs) {
      if (lang) hljs.highlightElement(code);
      else hljs.highlightElement(code);
    }
  }

  // ─── ZIP ─────────────────────────────────────────
  async function renderZip(body, url, filename, cfg) {
    const e = ext(filename);
    if (!['zip'].includes(e)) {
      // Non-zip archives can't be parsed client-side
      renderFallback(body, { name: filename, download_url: url }, '此格式需下载后在本地解压查看');
      return;
    }
    // Fetch and parse
    const buf = await GitHubAPI.fetchRawArrayBuffer(url);
    const zip = await JSZip.loadAsync(buf);
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'preview-zip-wrap';

    const entries = [];
    zip.forEach((path, file) => entries.push({ path, file }));
    entries.sort((a, b) => {
      if (a.file.dir && !b.file.dir) return -1;
      if (!a.file.dir && b.file.dir) return 1;
      return a.path.localeCompare(b.path);
    });

    const header = document.createElement('div');
    header.className = 'zip-header';
    header.textContent = `共 ${entries.filter(e=>!e.file.dir).length} 个文件，${entries.filter(e=>e.file.dir).length} 个文件夹`;
    wrap.appendChild(header);

    entries.forEach(({ path, file }) => {
      const item = document.createElement('div');
      item.className = 'zip-item';
      const depth = (path.match(/\//g) || []).length - (file.dir ? 1 : 0);
      item.style.paddingLeft = `${10 + depth * 16}px`;

      const icon = document.createElement('i');
      if (file.dir) {
        icon.className = 'fa-solid fa-folder';
        icon.style.color = '#faad14';
      } else {
        icon.className = `fa-solid ${getIcon(path)}`;
      }

      const name = document.createElement('span');
      name.textContent = file.dir ? path.split('/').filter(Boolean).pop() + '/' : path.split('/').pop();

      const size = document.createElement('span');
      size.className = 'zip-size';
      if (!file.dir && file._data) {
        size.textContent = formatSize(file._data.uncompressedSize || 0);
      }

      item.appendChild(icon);
      item.appendChild(name);
      item.appendChild(size);
      wrap.appendChild(item);
    });

    body.appendChild(wrap);
  }

  // ─── Fallback ─────────────────────────────────────
  function renderFallback(body, item, errMsg = '') {
    body.innerHTML = '';
    const e = ext(item.name);
    const iconName = getIcon(item.name);
    const wrap = document.createElement('div');
    wrap.className = 'preview-fallback';
    wrap.innerHTML = `
      <i class="fa-solid ${iconName}"></i>
      <p>${errMsg || '此文件格式暂不支持在线预览'}</p>
      <button class="btn btn-primary" onclick="downloadCurrentPreview()">
        <i class="fa-solid fa-download"></i> 下载文件
      </button>`;
    body.appendChild(wrap);
  }

  return {
    getType,
    getIcon,
    getColorClass,
    isPreviewable,
    formatSize,
    formatDate,
    ext,
    render,
    TYPE_MAP,
  };
})();
