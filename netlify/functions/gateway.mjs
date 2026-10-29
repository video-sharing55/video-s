const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'authorization',
  'content-type',
  'cookie',
  'if-modified-since',
  'if-none-match',
  'range',
  'user-agent',
];

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export default async function handler(req) {
  const rawBackendUrl = (process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');

  if (!rawBackendUrl) {
    return jsonResponse(503, {
      error:
        'Persistent backend is not configured on this Netlify deployment. Set BACKEND_URL in Netlify Site Configuration -> Environment Variables to your persistent Node.js server URL (e.g., cPanel, Railway, Render, or VPS) so SQLite data and uploaded thumbnails are permanently stored, or deploy the ZIP directly to a persistent Node.js host.',
      setupRequired: true,
      platform: 'netlify',
    });
  }

  let backendBase;
  try {
    backendBase = new URL(rawBackendUrl);
    if (backendBase.protocol !== 'http:' && backendBase.protocol !== 'https:') {
      throw new Error('Unsupported protocol');
    }
  } catch {
    return jsonResponse(500, {
      error: 'Invalid BACKEND_URL environment variable. Expected a full http:// or https:// URL.',
    });
  }

  const incomingUrl = new URL(req.url);
  const incomingHost = (req.headers.get('x-forwarded-host') || incomingUrl.host || '').trim().toLowerCase();
  if (incomingHost && backendBase.host.toLowerCase() === incomingHost) {
    return jsonResponse(508, {
      error: 'BACKEND_URL points to the same host as this Netlify deployment, which would cause an infinite proxy loop.',
    });
  }

  let targetPathname = incomingUrl.pathname;
  if (targetPathname.startsWith('/.netlify/functions/gateway')) {
    targetPathname = targetPathname.slice('/.netlify/functions/gateway'.length) || '/';
  }

  const upstreamUrl = new URL(
    `${backendBase.pathname.replace(/\/+$/, '')}${targetPathname}${incomingUrl.search}`,
    backendBase.origin
  );

  const requestHeaders = new Headers();
  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(headerName);
    if (value) {
      requestHeaders.set(headerName, value);
    }
  }
  if (incomingHost) {
    requestHeaders.set('x-forwarded-host', incomingHost);
  }
  requestHeaders.set('x-forwarded-proto', incomingUrl.protocol.replace(':', '') || 'https');

  const method = (req.method || 'GET').toUpperCase();
  const body = method !== 'GET' && method !== 'HEAD' ? await req.arrayBuffer() : undefined;

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method,
      headers: requestHeaders,
      body,
      redirect: 'manual',
    });

    const responseHeaders = new Headers();
    upstreamRes.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (HOP_BY_HOP_RESPONSE_HEADERS.has(lower) || lower === 'set-cookie') {
        return;
      }
      responseHeaders.set(key, value);
    });

    const setCookies =
      typeof upstreamRes.headers.getSetCookie === 'function'
        ? upstreamRes.headers.getSetCookie()
        : upstreamRes.headers.get('set-cookie')
          ? [upstreamRes.headers.get('set-cookie')]
          : [];

    for (const cookie of setCookies) {
      responseHeaders.append('Set-Cookie', cookie.replace(/;\s*Domain=[^;]+/gi, ''));
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error('[netlify-gateway] Upstream proxy error:', err);
    return jsonResponse(502, {
      error: 'Failed to reach configured BACKEND_URL.',
    });
  }
}
