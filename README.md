# cmchen的网盘 🗂️

> 部署在 GitHub Pages 上的网盘，主题仿夸克网盘，使用 GitHub 仓库作为存储后端。

## 功能特性

| 功能 | 说明 |
|------|------|
| 📤 文件上传 | 点击上传 / 拖拽上传 / 文件夹上传 |
| 📥 文件下载 | 单文件下载 / 批量下载 |
| 📁 文件夹 | 创建文件夹 / 多级目录导航 |
| 🔍 搜索 | 实时搜索文件名 |
| 🖼️ 在线预览 | 见下表 |
| ✏️ 重命名 | 重命名文件和文件夹 |
| 🗑️ 删除 | 单个 / 批量删除 |
| 📋 复制链接 | 获取文件直链 |

### 支持的预览格式

| 类型 | 格式 |
|------|------|
| 图片 | JPG / PNG / GIF / WebP / SVG / BMP / AVIF 等 |
| 视频 | MP4 / WebM / OGG / MOV 等 |
| 音频 | MP3 / WAV / AAC / FLAC / M4A 等 |
| PDF | .pdf（Google Docs Viewer） |
| Word | .doc / .docx（Microsoft Office Online） |
| Excel | .xls / .xlsx / .csv（Microsoft Office Online） |
| PPT | .ppt / .pptx（Microsoft Office Online） |
| 代码 | JS / TS / Python / Java / Go / Rust / HTML / CSS / JSON 等（语法高亮） |
| 文本 | .txt / .log / .md（Markdown 渲染） |
| ZIP | .zip（列出压缩包内容） |

---

## 快速部署

### 方式一：部署到已有仓库（推荐）

1. **Fork 或上传**本仓库到你的 GitHub 账号
2. 进入仓库 **Settings → Pages**
3. Source 选择 `main` 分支，根目录 `/`，点击 **Save**
4. 等待几分钟后访问 `https://<your-username>.github.io/<repo-name>/`

### 方式二：使用独立存储仓库

1. 创建一个**新的 GitHub 仓库**专门用于存储文件（可设为 Private）
2. 将本项目部署到另一个公开仓库的 GitHub Pages
3. 初始化配置时，填写存储仓库的信息

---

## 初始化配置

首次访问时会弹出配置向导，填写：

| 字段 | 说明 |
|------|------|
| GitHub Token | Personal Access Token，需要 `repo` 权限 |
| 仓库所有者 | GitHub 用户名或组织名 |
| 仓库名称 | 用于存储文件的仓库名 |
| 分支 | 默认 `main` |
| 存储目录 | 文件存储到仓库的哪个目录，默认 `files` |

点击 [生成 Token](https://github.com/settings/tokens/new?scopes=repo&description=Pan网盘) 跳转到 GitHub 创建 Token 页面（勾选 `repo` 权限）。

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl/⌘ + A` | 全选文件 |
| `Esc` | 取消选择 / 关闭预览 |
| `Delete` | 删除选中文件 |
| `←` / `→` | 预览模式切换上/下一个文件 |
| `F5` | 刷新文件列表 |

---

## 技术栈

- **前端**：纯 HTML / CSS / JavaScript（无框架）
- **存储后端**：GitHub REST API v3（Contents API）
- **预览库**：
  - [highlight.js](https://highlightjs.org/)（代码高亮）
  - [marked.js](https://marked.js.org/)（Markdown 渲染）
  - [JSZip](https://stuk.github.io/jszip/)（ZIP 解析）
  - Microsoft Office Online Viewer（Office 文件）
  - Google Docs Viewer（PDF）

---

## 注意事项

- GitHub API 单文件大小限制为 **100 MB**
- 文件内容以 Base64 编码通过 API 传输，大文件上传较慢
- Token 存储在浏览器 `localStorage`，请勿在公共设备上使用
- 私有仓库中的 Office / PDF 文件预览（借助第三方 Viewer）需要文件有公开下载 URL；若仓库为 private，第三方 Viewer 无法访问，建议使用 public 仓库存储
- GitHub API 有速率限制：认证请求 5000 次/小时

---

## License

MIT
