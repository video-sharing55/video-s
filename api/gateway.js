export const config = {
  api: {
    bodyParser: false,
  },
};

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

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

export default async function handler(req, res) {
  const rawBackendUrl = (process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');

  if (!rawBackendUrl) {
    return sendJson(res, 503, {
      error:
        'Persistent backend is not configured on this Vercel deployment. Set BACKEND_URL in Vercel Environment Variables to your persistent Node.js server URL (e.g., cPanel, Railway, Render, or VPS) so SQLite data and uploaded thumbnails are permanently stored, or deploy the ZIP directly to a persistent Node.js host.',
      setupRequired: true,
      platform: 'vercel',
    });
  }

  let backendBase;
  try {
    backendBase = new URL(rawBackendUrl);
    if (backendBase.protocol !== 'http:' && backendBase.protocol !== 'https:') {
      throw new Error('Unsupported protocol');
    }
  } catch {
    return sendJson(res, 500, {
      error: 'Invalid BACKEND_URL environment variable. Expected a full http:// or https:// URL.',
    });
  }

  const incomingHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim().toLowerCase();
  if (incomingHost && backendBase.host.toLowerCase() === incomingHost) {
    return sendJson(res, 508, {
      error: 'BACKEND_URL points to the same host as this Vercel deployment, which would cause an infinite proxy loop.',
    });
  }

  const parsedIncoming = new URL(req.url || '/', 'http://localhost');
  let targetPathname = parsedIncoming.pathname;
  if (parsedIncoming.searchParams.has('__pathname')) {
    const rewritten = parsedIncoming.searchParams.get('__pathname') || '/';
    targetPathname = rewritten.startsWith('/') ? rewritten : `/${rewritten}`;
    parsedIncoming.searchParams.delete('__pathname');
  }

  const search = parsedIncoming.searchParams.toString();
  const upstreamUrl = new URL(
    `${backendBase.pathname.replace(/\/+$/, '')}${targetPathname}${search ? `?${search}` : ''}`,
    backendBase.origin
  );

  const requestHeaders = new Headers();
  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers[headerName];
    if (typeof value === 'string' && value.length > 0) {
      requestHeaders.set(headerName, value);
    } else if (Array.isArray(value) && value.length > 0) {
      requestHeaders.set(headerName, value.join(', '));
    }
  }
  if (incomingHost) {
    requestHeaders.set('x-forwarded-host', incomingHost);
  }
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string' && forwardedProto.length > 0) {
    requestHeaders.set('x-forwarded-proto', forwardedProto);
  }

  const method = (req.method || 'GET').toUpperCase();
  const body = method !== 'GET' && method !== 'HEAD' ? await readRawBody(req) : undefined;

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method,
      headers: requestHeaders,
      body,
      redirect: 'manual',
    });

    res.statusCode = upstreamRes.status;

    upstreamRes.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (HOP_BY_HOP_RESPONSE_HEADERS.has(lower) || lower === 'set-cookie') {
        return;
      }
      res.setHeader(key, value);
    });

    const setCookies =
      typeof upstreamRes.headers.getSetCookie === 'function'
        ? upstreamRes.headers.getSetCookie()
        : upstreamRes.headers.get('set-cookie')
          ? [upstreamRes.headers.get('set-cookie')]
          : [];

    if (setCookies.length > 0) {
      res.setHeader(
        'Set-Cookie',
        setCookies.map((cookie) => cookie.replace(/;\s*Domain=[^;]+/gi, ''))
      );
    }

    const responseBuffer = Buffer.from(await upstreamRes.arrayBuffer());
    res.end(responseBuffer);
  } catch (err) {
    console.error('[vercel-gateway] Upstream proxy error:', err);
    return sendJson(res, 502, {
      error: 'Failed to reach configured BACKEND_URL.',
    });
  }
}
