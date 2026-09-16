// HTML 模板导出

export const NGINX_HTML = `<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
html { color-scheme: light dark; }
body { width: 35em; margin: 0 auto; font-family: Tahoma, Verdana, Arial, sans-serif; }
</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and working. Further configuration is required.</p>
<p>For online documentation and support please refer to
<a href="http://nginx.org/">nginx.org</a>.<br/>
Commercial support is available at
<a href="http://nginx.com/">nginx.com</a>.</p>
<p><em>Thank you for using nginx.</em></p>
</body>
</html>`;

export const LOGIN_HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>登录 - 视频管理后台</title>
<style>
body { font-family: -apple-system, system-ui, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
.login-box { background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,.1); width: 300px; }
h2 { margin-top: 0; text-align: center; }
input[type="password"] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box; }
button { width: 100%; padding: 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; margin-top: 10px; }
button:hover { background: #45a049; }
.error { background: #f8d7da; color: #721c24; padding: 8px; border-radius: 4px; font-size: 13px; margin-bottom: 10px; display: none; }
.error.show { display: block; }
</style>
</head>
<body>
<form class="login-box" method="POST">
  <h2>登录</h2>
  <div class="error" id="err">密码错误，请重试</div>
  <input type="password" name="password" placeholder="请输入管理密码" autofocus required />
  <button type="submit">登录</button>
</form>
</body>
</html>`;

export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>视频管理后台</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
  h1 { color: #333; }
  .upload-box { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,.1); margin-bottom: 20px; }
  input[type="file"] { margin: 10px 0; }
  button { background: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
  button:hover { background: #45a049; }
  button:disabled { background: #ccc; cursor: not-allowed; }
  button.danger { background: #f44336; }
  button.danger:hover { background: #d32f2f; }
  .progress { background: #eee; border-radius: 4px; height: 20px; margin-top: 10px; overflow: hidden; display: none; }
  .progress-bar { background: #4CAF50; height: 100%; transition: width .3s; }
  .file-list { background: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,.1); overflow: hidden; }
  .file-item { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid #eee; }
  .file-item:last-child { border-bottom: none; }
  .file-info { flex: 1; }
  .file-name { font-weight: 500; }
  .file-meta { font-size: 12px; color: #888; margin-top: 2px; }
  .hash-tag { font-family: monospace; background: #eee; padding: 2px 6px; border-radius: 3px; font-size: 11px; cursor: pointer; }
  .msg { padding: 10px; border-radius: 4px; margin: 10px 0; display: none; }
  .msg.success { background: #d4edda; color: #155724; display: block; }
  .msg.error { background: #f8d7da; color: #721c24; display: block; }
  .logout { float: right; }
</style>
</head>
<body>
<h1>视频管理后台 <a href="/__logout__" class="logout" style="font-size:14px;color:#666;text-decoration:none;">退出登录</a></h1>

<div id="msg" class="msg"></div>

<div class="upload-box">
  <h3>上传视频</h3>
  <input type="file" id="fileInput" accept="video/*" />
  <button id="uploadBtn" onclick="uploadFile()">上传</button>
  <div class="progress"><div class="progress-bar" id="progressBar"></div></div>
</div>

<div class="file-list" id="fileList">
  <div class="file-item" style="color:#888;padding:20px;text-align:center;">加载中...</div>
</div>

<script>
function showMsg(text, type) {
  const el = document.getElementById('msg');
  el.className = 'msg ' + type;
  el.textContent = text;
  setTimeout(() => { el.className = 'msg'; }, 5000);
}

async function loadFileList() {
  const res = await fetch('/api/admin/files');
  if (!res.ok) { showMsg('获取文件列表失败', 'error'); return; }
  const files = await res.json();
  const list = document.getElementById('fileList');
  if (!files.length) {
    list.innerHTML = '<div class="file-item" style="color:#888;padding:20px;text-align:center;">暂无文件</div>';
    return;
  }
  list.innerHTML = files.map(f => \`
    <div class="file-item">
      <div class="file-info">
        <div class="file-name">\${escapeHtml(f.originalName)}</div>
        <div class="file-meta">
          <span class="hash-tag" onclick="copyHash('\${f.hash}')" title="点击复制">\${f.hash.substring(0,16)}...</span>
          · \${formatSize(f.size)} · \${f.contentType}
        </div>
        <div class="file-meta">上传于 \${new Date(f.uploadTime).toLocaleString()}</div>
      </div>
      <a href="/video?hash=\${f.hash}" target="_blank" style="margin-right:10px;font-size:13px;">预览</a>
      <button class="danger" onclick="deleteFile('\${f.hash}')">删除</button>
    </div>
  \`).join('');
}

function copyHash(hash) {
  navigator.clipboard.writeText(hash).then(() => showMsg('Hash 已复制: ' + hash, 'success'));
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes/1048576).toFixed(1) + ' MB';
  return (bytes/1073741824).toFixed(2) + ' GB';
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function uploadFile() {
  const input = document.getElementById('fileInput');
  if (!input.files.length) { showMsg('请先选择文件', 'error'); return; }
  const file = input.files[0];
  const btn = document.getElementById('uploadBtn');
  const progress = document.querySelector('.progress');
  const bar = document.getElementById('progressBar');

  btn.disabled = true;
  progress.style.display = 'block';
  bar.style.width = '0%';
  showMsg('正在计算文件 Hash...', 'success');

  // 先在浏览器端计算 Hash，以便实现秒传（服务端也会再验一遍）
  const hash = await computeHash(file);
  showMsg('Hash: ' + hash.substring(0,16) + '... 开始上传', 'success');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('hash', hash);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/admin/upload');
  xhr.upload.onprogress = e => {
    if (e.lengthComputable) bar.style.width = (e.loaded/e.total*100).toFixed(1) + '%';
  };
  xhr.onload = async () => {
    btn.disabled = false;
    const result = JSON.parse(xhr.responseText);
    if (xhr.status === 200) {
      showMsg(result.message + ' · Hash: ' + result.hash.substring(0,16) + '...', 'success');
      progress.style.display = 'none';
      input.value = '';
      loadFileList();
    } else {
      showMsg(result.error || '上传失败', 'error');
    }
  };
  xhr.onerror = () => { btn.disabled = false; showMsg('网络错误', 'error'); };
  xhr.send(formData);
}

async function computeHash(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function deleteFile(hash) {
  if (!confirm('确认删除此文件？此操作不可恢复。')) return;
  const res = await fetch('/api/admin/file?hash=' + encodeURIComponent(hash), { method: 'DELETE' });
  const result = await res.json();
  if (res.ok) { showMsg(result.message, 'success'); loadFileList(); }
  else showMsg(result.error || '删除失败', 'error');
}

loadFileList();
</script>
</body>
</html>`;
