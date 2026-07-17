const BVID_PATTERN = /^BV[a-zA-Z0-9]+$/;
const BILIBILI_API = 'https://api.bilibili.com/x/web-interface/view';

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function handleBilibiliCover(request) {
  const url = new URL(request.url);
  const bvid = (url.searchParams.get('bvid') || '').trim();

  if (!BVID_PATTERN.test(bvid)) {
    return jsonError('无效的 BV 号', 400);
  }

  // 缓存最终图片响应，减少访问 B 站接口与图片源站的次数。
  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/api/bilibili-cover?bvid=${encodeURIComponent(bvid)}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const apiResponse = await fetch(`${BILIBILI_API}?bvid=${encodeURIComponent(bvid)}`, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0 (compatible; CLCK-Cover-Proxy/1.0)',
        referer: 'https://www.bilibili.com/',
      },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });

    if (!apiResponse.ok) {
      return jsonError('B站封面信息获取失败', 502);
    }

    const data = await apiResponse.json();
    const pictureUrl = data?.data?.pic;
    if (!pictureUrl) {
      return jsonError('该视频没有可用封面', 404);
    }

    const securePictureUrl = pictureUrl.replace(/^http:\/\//i, 'https://');
    const imageResponse = await fetch(securePictureUrl, {
      headers: {
        accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 (compatible; CLCK-Cover-Proxy/1.0)',
        referer: 'https://www.bilibili.com/',
      },
      cf: { cacheTtl: 604800, cacheEverything: true },
    });

    if (!imageResponse.ok) {
      return jsonError('B站封面图片加载失败', 502);
    }

    const response = new Response(imageResponse.body, {
      status: 200,
      headers: {
        'content-type': imageResponse.headers.get('content-type') || 'image/jpeg',
        'cache-control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
        'x-content-type-options': 'nosniff',
      },
    });

    await cache.put(cacheKey, response.clone());
    return response;
  } catch (error) {
    console.error('Bilibili cover proxy failed:', error);
    return jsonError('封面服务暂时不可用', 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/bilibili-cover') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
      }
      return handleBilibiliCover(request);
    }

    return env.ASSETS.fetch(request);
  },
};
