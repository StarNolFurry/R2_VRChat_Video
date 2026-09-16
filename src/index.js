import { NGINX_HTML, LOGIN_HTML, ADMIN_HTML } from './html.js';

// ============ 工具函数 ============

/** 将对象转为 JSON 响应 */
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** 纯文本响应 */
function text(str, status = 200) {
  return new Response(str, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/**
 * 对会话 Cookie 做 HMAC-SHA256 签名
 * cookie 格式: "admin.session=token.signature"
 */
async function signToken(token, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(token));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${token}.${hex}`;
}

/** 验证签名 */
async function verifyToken(signed, secret) {
  if (!signed || !signed.includes('.')) return false;
  const [token, sig] = signed.split('.');
  const expected = await signToken(token, secret);
  // 常量时间比较
  const expBytes = new TextEncoder().encode(expected);
  const gotBytes = new TextEncoder().encode(signed);
  if (expBytes.length !== gotBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < expBytes.length; i++) diff |= expBytes[i] ^ gotBytes[i];
  return diff === 0;
}

/** 从 Cookie 头解析指定 name 的值 */
function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(name + '=')) return trimmed.substring(name.length + 1);
  }
  return null;
}

/** 规范化 R2 对象 key：去首尾斜杠，防止 "//" */
function normalizeKey(key) {
  return key.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/+/g, '/');
}

// ============ 路由分发 ============

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 确保关键环境变量存在
    if (!env.ADMIN_URL || !env.ADMIN_PASS || !env.SESSION_SECRET) {
      console.error('缺少必要环境变量: ADMIN_URL / ADMIN_PASS / SESSION_SECRET');
    }

    // --- 管理后台登出 ---
    if (path === '/__logout__') {
      return new Response('已登出', {
        headers: {
          'Set-Cookie': 'admin.session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict',
          'Location': '/',
        },
        status: 302,
      });
    }

    // --- 视频访问 ---
    if (path === '/video') {
      return handleVideo(request, env);
    }

    // --- 管理后台 API ---
    if (path.startsWith('/api/admin/')) {
      // 鉴权
      const cookie = parseCookie(request.headers.get('Cookie'), 'admin.session');
      if (!(await verifyToken(cookie, env.SESSION_SECRET))) {
        return json({ error: '未授权' }, 401);
      }
      return handleAdminApi(request, env, path);
    }

    // --- 管理后台页面 / 登录 ---
    const adminPath = env.ADMIN_URL || '/admin';
    if (path === adminPath) {
      return handleAdminPage(request, env);
    }

    // --- Nginx 伪装首页（默认） ---
    return new Response(NGINX_HTML, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Server': 'nginx/1.24.0',
        'X-Powered-By': 'PHP/8.1',
      },
    });
  },
};

// ============ 管理后台：登录 + 页面 ============

async function handleAdminPage(request, env) {
  const cookie = parseCookie(request.headers.get('Cookie'), 'admin.session');
  const authed = await verifyToken(cookie, env.SESSION_SECRET);

  // 已登录 → 直接给后台页面
  if (authed && request.method === 'GET') {
    return new Response(ADMIN_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // GET → 登录表单
  if (request.method === 'GET') {
    return new Response(LOGIN_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // POST → 验证密码
  if (request.method === 'POST') {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const pass = params.get('password');

    if (pass === env.ADMIN_PASS) {
      const token = crypto.randomUUID();
      const signed = await signToken(token, env.SESSION_SECRET);
      return new Response(ADMIN_HTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Set-Cookie': `admin.session=${signed}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`,
        },
      });
    } else {
      // 密码错误 → 返回带错误的登录页
      return new Response(
        LOGIN_HTML.replace(
          '<div class="error" id="err">密码错误，请重试</div>',
          '<div class="error" id="err" style="display:block;">密码错误，请重试</div>'
        ),
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}

// ============ 管理后台 API ============

async function handleAdminApi(request, env, path) {
  if (path === '/api/admin/files' && request.method === 'GET') {
    return listFiles(env);
  }
  if (path === '/api/admin/upload' && request.method === 'POST') {
    return handleUpload(request, env);
  }
  if (path === '/api/admin/file' && request.method === 'DELETE') {
    const hash = new URL(request.url).searchParams.get('hash');
    if (!hash) return json({ error: '缺少 hash 参数' }, 400);
    return deleteFile(hash, env);
  }
  return json({ error: 'Not Found' }, 404);
}

/** 列出所有文件（从 KV keys 扫描） */
async function listFiles(env) {
  const resp = await env.VIDEO_INDEX.list();
  const files = [];
  for (const key of resp.keys) {
    const meta = await env.VIDEO_INDEX.get(key.name, { type: 'json' });
    if (meta && typeof meta === 'object') files.push({ hash: key.name, ...meta });
  }
  // 按上传时间倒序
  files.sort((a, b) => (b.uploadTime || 0) - (a.uploadTime || 0));
  return json(files);
}

/** 上传视频 */
async function handleUpload(request, env) {
  try {
    // 限制：Workers free 计划 body ~100MB
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return json({ error: '需要 multipart/form-data' }, 400);
    }

    const form = await request.formData();
    const file = form.get('file');
    const clientHash = form.get('hash') || '';

    if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
      return json({ error: '未找到 file 字段' }, 400);
    }

    // 读取文件内容
    const buf = await file.arrayBuffer();

    // 计算服务端 Hash（双重校验）
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const serverHash = Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // 如果客户端也传了 hash 且不一致，拒绝
    if (clientHash && clientHash !== serverHash) {
      return json({ error: 'Hash 校验失败，请重试' }, 400);
    }

    const hash = serverHash;

    // 检查是否已存在 → 秒传
    const existing = await env.VIDEO_INDEX.get(hash, { type: 'json' });
    if (existing) {
      return json({
        message: '文件已存在（秒传）',
        hash,
        originalName: existing.originalName,
      });
    }

    // 存入 R2，key 使用 hash（避免原始文件名带来的路径问题）
    const r2Key = normalizeKey(`videos/${hash}`);
    await env.VIDEOS_BUCKET.put(r2Key, buf, {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream',
      },
      customMetadata: {
        originalName: file.name || 'unknown',
      },
    });

    // 写入 KV 索引
    const meta = {
      originalName: file.name || 'unknown',
      size: buf.byteLength,
      contentType: file.type || 'application/octet-stream',
      uploadTime: Date.now(),
    };
    await env.VIDEO_INDEX.put(hash, JSON.stringify(meta));

    return json({ message: '上传成功', hash, originalName: meta.originalName, size: meta.size });
  } catch (e) {
    console.error('上传失败:', e);
    return json({ error: '上传失败: ' + (e.message || String(e)) }, 500);
  }
}

/** 删除文件 */
async function deleteFile(hash, env) {
  const meta = await env.VIDEO_INDEX.get(hash, { type: 'json' });
  if (!meta) return json({ error: '未找到该文件' }, 404);

  const r2Key = normalizeKey(`videos/${hash}`);
  await env.VIDEOS_BUCKET.delete(r2Key);
  await env.VIDEO_INDEX.delete(hash);

  return json({ message: '删除成功' });
}

// ============ /video?hash= 视频流式访问 ============

async function handleVideo(request, env) {
  const url = new URL(request.url);
  const hash = url.searchParams.get('hash');
  if (!hash) return json({ error: '缺少 hash 参数' }, 400);

  // 查 KV
  const meta = await env.VIDEO_INDEX.get(hash, { type: 'json' });
  if (!meta) return json({ error: '文件不存在' }, 404);

  const r2Key = normalizeKey(`videos/${hash}`);
  const range = request.headers.get('Range');

  // 直接让 R2 的 GetObject 处理 Range（R2 原生支持）
  const r2Object = await env.VIDEOS_BUCKET.get(r2Key, {
    range: range ? parseRange(range, meta.size) : undefined,
  });

  if (!r2Object) return json({ error: 'R2 中未找到该文件' }, 404);

  const headers = new Headers();
  headers.set('Content-Type', meta.contentType || 'application/octet-stream');
  headers.set('Content-Length', String(meta.size));
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(meta.originalName)}"`);

  // 复制 R2 返回的相关头（Range 请求时会有 Content-Range）
  if (r2Object.httpMetadata) {
    if (r2Object.httpMetadata.contentRange) headers.set('Content-Range', r2Object.httpMetadata.contentRange);
    if (r2Object.httpMetadata.contentLength) headers.set('Content-Length', r2Object.httpMetadata.contentLength);
  }

  const status = range && r2Object.httpMetadata?.contentRange ? 206 : 200;

  return new Response(r2Object.body, { status, headers });
}

/** 简单的 Range 头解析：将 "bytes=start-end" 转为 R2 期望的 {offset, length} */
function parseRange(range, totalSize) {
  if (!range.startsWith('bytes=')) return undefined;
  const parts = range.substring(6).split('-');
  const start = parts[0] ? parseInt(parts[0], 10) : 0;
  const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
  if (isNaN(start) || isNaN(end) || start > end) return undefined;
  return { offset: start, length: end - start + 1 };
}
