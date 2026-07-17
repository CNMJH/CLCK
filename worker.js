const MAX_BACKUPS = 30;
const MAX_DATA_BYTES = 2 * 1024 * 1024;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function jsonError(message, status) {
  return jsonResponse({ error: message }, status);
}

function constantTimeEqual(a, b) {
  const left = new TextEncoder().encode(a || '');
  const right = new TextEncoder().encode(b || '');
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let i = 0; i < length; i += 1) {
    difference |= (left[i] || 0) ^ (right[i] || 0);
  }
  return difference === 0;
}

function getAuthorizationStatus(request, env) {
  if (!env.ADMIN_PASSWORD) return 'not_configured';
  const auth = request.headers.get('authorization') || '';
  const password = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return constantTimeEqual(password, env.ADMIN_PASSWORD) ? 'authorized' : 'invalid';
}

async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloud_backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      data_hash TEXT NOT NULL,
      video_count INTEGER NOT NULL DEFAULT 0,
      tag_count INTEGER NOT NULL DEFAULT 0,
      device_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_cloud_backups_created_at ON cloud_backups(created_at DESC)').run();
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function uploadBackup(request, env) {
  const raw = await request.text();
  if (!raw || new TextEncoder().encode(raw).length > MAX_DATA_BYTES) {
    return jsonError('数据为空或超过 2MB 限制', 413);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError('JSON 格式无效', 400);
  }

  const payload = body?.data;
  if (!payload || !Array.isArray(payload.videos) || !Array.isArray(payload.tags)) {
    return jsonError('数据必须包含 videos 和 tags 数组', 400);
  }

  const normalized = JSON.stringify({
    videos: payload.videos,
    tags: payload.tags,
    exportTime: new Date().toISOString(),
  });
  const hash = await sha256Hex(normalized);

  const latest = await env.DB.prepare('SELECT id, data_hash, created_at FROM cloud_backups ORDER BY id DESC LIMIT 1').first();
  if (latest?.data_hash === hash) {
    return jsonResponse({ ok: true, duplicate: true, id: latest.id, createdAt: latest.created_at });
  }

  const deviceName = String(body.deviceName || '').trim().slice(0, 80);
  const result = await env.DB.prepare(`
    INSERT INTO cloud_backups (data, data_hash, video_count, tag_count, device_name)
    VALUES (?, ?, ?, ?, ?)
  `).bind(normalized, hash, payload.videos.length, payload.tags.length, deviceName).run();

  await env.DB.prepare(`
    DELETE FROM cloud_backups
    WHERE id NOT IN (SELECT id FROM cloud_backups ORDER BY id DESC LIMIT ?)
  `).bind(MAX_BACKUPS).run();

  return jsonResponse({
    ok: true,
    duplicate: false,
    id: result.meta.last_row_id,
    videoCount: payload.videos.length,
    tagCount: payload.tags.length,
  }, 201);
}

async function listBackups(env) {
  const result = await env.DB.prepare(`
    SELECT id, video_count AS videoCount, tag_count AS tagCount,
           device_name AS deviceName, created_at AS createdAt
    FROM cloud_backups ORDER BY id DESC LIMIT ?
  `).bind(MAX_BACKUPS).all();
  return jsonResponse({ backups: result.results || [] });
}

async function getBackup(url, env) {
  const requestedId = url.searchParams.get('id');
  const row = requestedId
    ? await env.DB.prepare('SELECT id, data, created_at FROM cloud_backups WHERE id = ?').bind(requestedId).first()
    : await env.DB.prepare('SELECT id, data, created_at FROM cloud_backups ORDER BY id DESC LIMIT 1').first();

  if (!row) return jsonError('云端还没有备份', 404);
  return jsonResponse({ id: row.id, createdAt: row.created_at, data: JSON.parse(row.data) });
}

async function handleCloudData(request, env) {
  const authStatus = getAuthorizationStatus(request, env);
  if (authStatus === 'not_configured') return jsonError('Cloudflare 尚未配置 ADMIN_PASSWORD', 503);
  if (authStatus !== 'authorized') return jsonError('管理员密码错误', 401);
  await ensureSchema(env.DB);

  const url = new URL(request.url);
  if (request.method === 'PUT') return uploadBackup(request, env);
  if (request.method === 'GET' && url.searchParams.get('action') === 'list') return listBackups(env);
  if (request.method === 'GET') return getBackup(url, env);
  return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, PUT' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/cloud-data') {
      try {
        return await handleCloudData(request, env);
      } catch (error) {
        console.error('Cloud data API failed:', error);
        return jsonError('云端服务暂时不可用', 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
