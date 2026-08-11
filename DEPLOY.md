# BigDawg D&D — Live Deploys

## 🔄 Current workflow (v1): Git push → auto-deploy (recommended)

The site now deploys from **GitHub**: every `git push` to `main` makes Netlify
rebuild and publish to the **same permanent URL**. No drag-and-drop, no new
random URLs, no data loss on redeploys.

1. `git add -A`
2. `git commit -m "what changed"`
3. `git push origin main`
4. Netlify builds (`npm run build`, publish `dist/`) in ~1 min.

Your phone's installed PWA keeps its data (IndexedDB is origin-scoped — the
origin never changes) and picks up the new version automatically.

**How to tell the AI to update the live site:** push the repo; or ask for a
"deploy" and it will build + push.

## What changed to make this possible

- **`netlify/functions/dnd-proxy.js`** — same-origin proxy so custom AI APIs
  that block browsers (CORS), like `opencode.ai/zen`, work from the browser.
  Custom APIs route through it automatically (toggle in the Add/Edit custom
  API screen). Local servers (LM Studio/Ollama) bypass it.
- **IndexedDB storage** — all app data (characters, NPCs, campaigns, worlds,
  sessions, chat, settings, API keys) moved from localStorage (~5 MB cap) to
  IndexedDB (device disk — hundreds of MB to GBs, free). First launch after
  this update auto-migrates existing data from localStorage. Image quality cap
  raised 80 KB → 400 KB.
- **Hydration gate** — app waits for stored data to load before first paint,
  so no more "empty app then data pops in" flash.

## One-time setup (already done on this machine)

- GitHub repo: see `git remote -v` (created via `gh`).
- Netlify: site linked in the Netlify dashboard to the repo (`netlify.toml`
  holds build settings — `npm run build`, publish `dist`).

## Manual fallback (no Git)

```powershell
npm run build
npx netlify deploy --prod --dir=dist
```

CLI uploads work without Git **but don't auto-update** and drop sites get
random URLs — prefer pushing.

## History

- **v1 (this)** — CORS proxy function, IndexedDB storage, git auto-deploy.
- **v0.4.3** — DM prompt overhaul (appearance, weapons, spells, inventory
  context; mandatory suggested actions; anti-leak rules), Groq default
  `openai/gpt-oss-120b`.
- **v0.4** — Groq provider, live model catalog, per-provider memory.
- **v0.3** — Sessions system, NPCs, auto-migration.
- **v0.2/v0.1** — earlier drop sites (superseded).

## 📱 Test on iPhone

1. Open the site URL in Safari → Share → **Add to Home Screen**.
2. Launch — first-run onboarding gets you a hero + key.