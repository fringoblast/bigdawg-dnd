const UPSTREAM_BASE = "https://integrate.api.nvidia.com/v1";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  // Allow any header the browser wants to send (`x-stainless-*`, custom Accept variants, etc.).
  // We only actually USE a small set on the upstream request below.
  "Access-Control-Allow-Headers": "*"
};
var nim_default = async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.signal && req.signal.aborted) {
    return new Response(null, { status: 499, headers: CORS_HEADERS });
  }
  const incoming = new URL(req.url);
  const rawSubPath = incoming.pathname.replace(/^\/\.netlify\/functions\/nim\/?/, "");
  const subPath = rawSubPath.split("/").filter((seg) => seg && seg !== "." && seg !== "..").join("/");
  const safeSubPath = subPath || "models";
  const upstreamUrl = `${UPSTREAM_BASE}/${safeSubPath}${incoming.search}`;
  const upstreamHeaders = new Headers();
  const auth = req.headers.get("authorization");
  if (auth) upstreamHeaders.set("Authorization", auth);
  const contentType = req.headers.get("content-type");
  if (contentType) upstreamHeaders.set("Content-Type", contentType);
  upstreamHeaders.set("Accept", req.headers.get("accept") || "application/json");
  try {
    const init = {
      method: req.method,
      headers: upstreamHeaders
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = req.body;
      init.duplex = "half";
    }
    init.signal = req.signal;
    const upstream = await fetch(upstreamUrl, init);
    const outHeaders = new Headers();
    const contentType2 = upstream.headers.get("Content-Type");
    if (contentType2) outHeaders.set("Content-Type", contentType2);
    for (const h of ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "retry-after"]) {
      const v = upstream.headers.get(h);
      if (v) outHeaders.set(h, v);
    }
    for (const [k, v] of Object.entries(CORS_HEADERS)) outHeaders.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
  } catch (err) {
    if (err?.name === "AbortError" || req.signal?.aborted) {
      return new Response(null, { status: 499, headers: CORS_HEADERS });
    }
    const body = JSON.stringify({
      error: { message: err?.message || "Proxy upstream fetch failed", type: "proxy_error" }
    });
    return new Response(body, {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS }
    });
  }
};
export {
  nim_default as default
};
