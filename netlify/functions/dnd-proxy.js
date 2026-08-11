// Same-origin CORS proxy for custom AI APIs that block browser cross-origin requests.
// App calls: /.netlify/functions/dnd-proxy?base=<encoded base>&path=<relative path>
// Method + Authorization / x-api-key / anthropic-version / content-type are passed through.

const json = (status, obj) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json' }
});

const buildTarget = (base, path) => {
  if (!base || typeof base !== 'string' || base.length > 2048) return null;
  if (!path || typeof path !== 'string' || path.length > 512) return null;
  if (path.includes('..')) return null;
  if (!/^[A-Za-z0-9\-._/~]+$/.test(path)) return null;
  let b;
  try {
    b = new URL(base);
  } catch {
    return null;
  }
  if (b.protocol !== 'https:') return null;
  if (b.username || b.password) return null;
  const p = path.replace(/^\/+/, '');
  return `${b.origin}${b.pathname.replace(/\/+$/, '')}/${p}`;
};

export default async (req) => {
  try {
    const url = new URL(req.url);
    const target = buildTarget(url.searchParams.get('base'), url.searchParams.get('path'));
    if (!target) return json(400, { error: 'Invalid base or path' });

    const headers = new Headers();
    for (const h of ['authorization', 'x-api-key', 'anthropic-version', 'content-type']) {
      const v = req.headers.get(h);
      if (v) headers.set(h, v);
    }
    const body = req.method === 'POST' ? await req.arrayBuffer() : undefined;
    const upstream = await fetch(target, { method: req.method, headers, body, signal: req.signal });

    const pass = new Headers();
    const ct = upstream.headers.get('content-type');
    if (ct) pass.set('content-type', ct);
    return new Response(upstream.body, { status: upstream.status, headers: pass });
  } catch (e) {
    return json(502, { error: e?.message || 'Proxy upstream error' });
  }
};

export const config = { path: '/.netlify/functions/dnd-proxy' };
