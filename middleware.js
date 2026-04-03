// Edge middleware — runs before every request, zero serverless cost.
// Rate limits aggressive crawlers and blocks known bad patterns.

const RATE_LIMIT = 60;        // max requests per window per IP
const WINDOW_MS = 60 * 1000;  // 1 minute window
const BLOCK_DURATION = 1800;   // block for 30 minutes after exceeding limit

// In-memory store (per edge region, resets on cold start — acceptable)
const ipHits = new Map();
const blocked = new Map();

export default function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const host = request.headers.get('host') || '';

  // Subdomain routing: partners.sibylcap.com -> /partners/*
  if (host.startsWith('partners.')) {
    if (!path.startsWith('/api/') && !path.startsWith('/partners/') && !path.startsWith('/images/')) {
      const mapped = path === '/' ? '/partners/index.html'
        : path === '/dashboard' ? '/partners/dashboard.html'
        : path.startsWith('/dashboard/') ? '/partners/dashboard.html'
        : path === '/messages' ? '/partners/messages.html'
        : null;
      if (mapped) {
        const rewriteUrl = new URL(mapped, request.url);
        return fetch(rewriteUrl, { headers: request.headers });
      }
    }
  }

  // Static assets: skip rate limiting entirely
  if (
    path.startsWith('/images/') ||
    path.startsWith('/files/') ||
    path.endsWith('.css') ||
    path.endsWith('.js') && !path.startsWith('/api/') ||
    path.endsWith('.png') ||
    path.endsWith('.jpg') ||
    path.endsWith('.svg') ||
    path.endsWith('.ico') ||
    path.endsWith('.woff2')
  ) {
    return;
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();

  // Check if IP is currently blocked
  const blockExpiry = blocked.get(ip);
  if (blockExpiry && now < blockExpiry) {
    return new Response('rate limited. try again later.', {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil((blockExpiry - now) / 1000)),
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store',
      },
    });
  } else if (blockExpiry) {
    blocked.delete(ip);
  }

  // Sliding window rate limit
  let record = ipHits.get(ip);
  if (!record || now - record.start > WINDOW_MS) {
    record = { start: now, count: 0 };
    ipHits.set(ip, record);
  }
  record.count++;
  ipHits.set(ip, record);

  if (record.count > RATE_LIMIT) {
    blocked.set(ip, now + BLOCK_DURATION * 1000);
    ipHits.delete(ip);

    return new Response('rate limited. too many requests.', {
      status: 429,
      headers: {
        'Retry-After': String(BLOCK_DURATION),
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store',
      },
    });
  }

  // API-specific: stricter limit for expensive endpoints
  if (path.startsWith('/api/')) {
    const apiKey = `api:${ip}`;
    let apiRecord = ipHits.get(apiKey);
    if (!apiRecord || now - apiRecord.start > WINDOW_MS) {
      apiRecord = { start: now, count: 0 };
    }
    apiRecord.count++;
    ipHits.set(apiKey, apiRecord);

    // 20 API calls per minute per IP (vs 60 for pages)
    if (apiRecord.count > 20) {
      return new Response(JSON.stringify({
        error: 'rate limited. max 20 API requests per minute.',
        retry_after: 60,
      }), {
        status: 429,
        headers: {
          'Retry-After': '60',
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    }
  }

  // Cleanup: prune stale entries every ~1000 requests to prevent memory leak
  if (ipHits.size > 5000) {
    for (const [key, val] of ipHits) {
      if (now - val.start > WINDOW_MS * 2) ipHits.delete(key);
    }
  }
  if (blocked.size > 1000) {
    for (const [key, val] of blocked) {
      if (now > val) blocked.delete(key);
    }
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
