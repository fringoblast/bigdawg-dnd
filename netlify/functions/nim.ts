// Server-side proxy for NVIDIA NIM.
//
// Why this exists: `integrate.api.nvidia.com` does NOT return
// Access-Control-Allow-Origin headers in its responses, so the browser blocks
// direct fetch() calls from the BigDawg D&D app at the CORS layer — the user
// sees "load failed" even when their nvapi key is valid. This function proxies
// the request server-side (where CORS does not apply) and stamps
// CORS-friendly headers on the way back.
//
// Routes:
//   GET  /.netlify/functions/nim/models            -> https://integrate.api.nvidia.com/v1/models
//   POST /.netlify/functions/nim/chat/completions  -> https://integrate.api.nvidia.com/v1/chat/completions
//   GET  /.netlify/functions/nim/anything-else     -> https://integrate.api.nvidia.com/v1/anything-else
//
// The client forwards its existing `Authorization: Bearer <key>` header. We
// re-use it for the upstream request. The key is never logged or persisted —
// Netlify only sees it in-flight while streaming the request body.

const UPSTREAM_BASE = 'https://integrate.api.nvidia.com/v1';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  // Allow any header the browser wants to send (`x-stainless-*`, custom Accept variants, etc.).
  // We only actually USE a small set on the upstream request below.
  'Access-Control-Allow-Headers': '*'
};

export default async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // If the client already aborted before we even got here (tab closed, Stop pressed),
  // respond silently instead of letting the upstream fetch (and its error path) run.
  if (req.signal && req.signal.aborted) {
    return new Response(null, { status: 499, headers: CORS_HEADERS });
  }

  // Resolve the upstream URL. Strip the function prefix from the request path
  // so /models -> /v1/models, /chat/completions -> /v1/chat/completions, etc.
  // Defence-in-depth: sanitise subPath so a client can't escape the /v1 prefix
  // by smuggling `..` segments. Strip leading slashes + drop any `.` / `..` parts.
  const incoming = new URL(req.url);
  const rawSubPath = incoming.pathname.replace(/^\/\.netlify\/functions\/nim\/?/, '');
  const subPath = rawSubPath
    .split('/')
    .filter(seg => seg && seg !== '.' && seg !== '..')
    .join('/');
  const safeSubPath = subPath || 'models';
  const upstreamUrl = `${UPSTREAM_BASE}/${safeSubPath}${incoming.search}`;

  // Minimal, deliberate header forward. We only carry what the upstream needs;
  // everything else (cookies, browser-only fields) is dropped.
  const upstreamHeaders = new Headers();
  const auth = req.headers.get('authorization');
  if (auth) upstreamHeaders.set('Authorization', auth);
  const contentType = req.headers.get('content-type');
  if (contentType) upstreamHeaders.set('Content-Type', contentType);
  upstreamHeaders.set('Accept', req.headers.get('accept') || 'application/json');

  try {
    // Forward the body verbatim for POSTs (chat completions). duplex is
    // required by Node's native fetch when streaming the request body.
    const init: RequestInit & { duplex?: 'half' } = {
      method: req.method,
      headers: upstreamHeaders
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = req.body;
      init.duplex = 'half';
    }

    // Propagate the client's abort signal upstream so a Stop / tab close /
    // disconnect mid-stream cancels the upstream fetch — otherwise we'd leak
    // NVIDIA connection slots and drain the user's quota.
    init.signal = req.signal;
    const upstream = await fetch(upstreamUrl, init);

    // Whitelist the headers we relay back to the browser. Don't blindly clone
    // the upstream response — NVIDIA's hosted API shouldn't leak anything
    // sensitive, but a narrow pass-through keeps the attack surface small.
    // We deliberately carry: Content-Type (so SSE framing survives), any
    // client-relevant rate-limit / retry hints, and the CORS set below.
    const outHeaders = new Headers();
    const contentType = upstream.headers.get('Content-Type');
    if (contentType) outHeaders.set('Content-Type', contentType);
    for (const h of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after']) {
      const v = upstream.headers.get(h);
      if (v) outHeaders.set(h, v);
    }
    for (const [k, v] of Object.entries(CORS_HEADERS)) outHeaders.set(k, v);

    // Stream the upstream body straight back to the browser so SSE chat-completion
    // chunks arrive in real time.
    return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
  } catch (err: any) {
    // Client-initiated aborts fire AbortError below; surface them as 499 (closed
    // request, nginx convention) instead of a 502 that the toast would render
    // as a hard server error.
    if (err?.name === 'AbortError' || req.signal?.aborted) {
      return new Response(null, { status: 499, headers: CORS_HEADERS });
    }
    // Surface a structured JSON error so the client's fetch wrapper doesn't dump
    // a bare HTML page on the user.
    const body = JSON.stringify({
      error: { message: err?.message || 'Proxy upstream fetch failed', type: 'proxy_error' }
    });
    return new Response(body, {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
};
