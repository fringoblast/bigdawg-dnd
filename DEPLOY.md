# BigDawg D&D — Live Deploys

## 🟢 v0.4.3 (built — ready to drop)
**Status:** Built, typechecked, and **zipped for drag-and-drop upload**.

**What's new:**
- **DM prompt overhaul** — prompt now feeds the AI your character's full appearance, personality, equipped weapons, custom weapon lore, spells known, spell slots, and grouped inventory. The DM should now actually see and reference what your hero looks like and is carrying.
- **Appearance & clothing** — new optional field on the character sheet (in the Personality step of the creator, and on the read-only sheet). Write things like "Slender, silver-haired high elf in deep blue robes, ink-stained fingers, weathered leather satchel."
- **Suggested actions are mandatory** — prompt now hammers the AI to end EVERY turn with 2–4 `> ` tappable suggestions. No more empty tails.
- **Anti-leak rules** — DM is explicitly told never to output raw JSON, function-call syntax, code fences, or `[STATE]…[/STATE]` tags. `stateParser` also strips any stray `{"name":"update_character_state",…}` or `<tool_call>…</tool_call>` blocks that slip through.
- **Groq default = `openai/gpt-oss-120b`** — changed from the older `llama-3.3-70b-versatile` per your request.

**Drop:** drag the `bigdawg-dnd-v0.4.3.zip` (or the `dist/` folder) onto https://app.netlify.com/drop.

## 🟡 v0.4 (built — ready to drop)
**Status:** Built, typechecked, and **zipped for drag-and-drop upload**. CLI anonymous deploy was attempted and is still blocked by Netlify's daily anonymous deploy limit.

### Option A — drag-and-drop (no CLI, no login)
1. Open https://app.netlify.com/drop in a browser
2. Drag the **`bigdawg-dnd-v0.4.zip`** (or the `dist/` folder) onto the page
3. Copy the URL Netlify gives you (e.g. `https://<random>.netlify.app`)
4. Open it on your iPhone in **Safari** → Share → **Add to Home Screen**
5. (Optional) To keep it forever, sign up free at Netlify and click **"Claim this site"** on the success page

**Files in `C:\Users\firin\Desktop\bigdawg dnd\`:**
- `dist\` — the deployable folder (`index.html` is the entrypoint)
- `bigdawg-dnd-v0.4.zip` — 251 KB zip of `dist\` for quick drag-and-drop

### Option B — CLI (when the anonymous limit resets)
```powershell
netlify login --request "v0.4 Groq provider"
npm run build
npx netlify deploy --prod --dir=dist --message "v0.4: Groq provider + provider-aware UI" --allow-anonymous
```

**What's in v0.4 (per build, ready to ship):**
- **Groq as a second provider** — alongside OpenRouter, with provider picker at the top of Settings + Onboarding step 2.
  - Groq free tier: **30 req/min, ~14,400 req/day, no credit card**
  - Default Groq model: `llama-3.3-70b-versatile`
  - ~315 tokens/sec — fastest free inference
  - Same OpenAI-compatible chat completions API
- **Single-key unified UI** — one API key field; provider segmented control above it. Placeholder and key hint switch based on provider.
- **Auto-detect provider from key** — paste a `gsk_…` key and the app auto-switches to Groq; paste a `sk-or-…` and it stays on OpenRouter.
- **Live model catalog per provider** — `Test` button now hits the active provider's `/models` endpoint and populates a search/filter list with FREE tag and context length. 24h cache.
- **Groq 2-second throttle** — client-side debounce on the Send button to avoid 429s (toast: "Groq limit: wait 2s").
- **Vision gating** — image input is automatically disabled when on Groq (it doesn't support vision in chat completions). Replaced uploader icon with a muted "🖼︎ —" placeholder.
- **Per-provider model memory** — your model choice for OpenRouter is remembered when you switch to Groq and back.
- **Refactor**: `src/lib/openrouter.ts` replaced by `src/lib/providers/{types,openrouter,groq,registry}.ts` with a `ChatProvider` interface. The `STATE_DELTA_TOOL` schema is identical; tool calls and `[STATE]…[/STATE]` fallback both still work on Groq.
- **Provider-aware summarization** — the auto-summarizer that fires every 10 messages now uses the active provider's base URL.

## 🟢 v0.3 (previous live)
**Status:** Was built (NPCs + Sessions). Use v0.4 zip instead.

**Changes since v0.2:**
- **Sessions (Stories) system** — per-character story picker (list + new-story wizard) with Open / Switch / Rename / Delete and world/hook selectors.
- **NPCs sub-tab under Character** — split nav "Hero | NPCs": list (search, status filter, color-coded dispositions), detail view (description, race, location, first appearance, editable notes, status toggle, floating ↑ Backup + Export bar), empty state with onboarding copy.
- **Auto-session creation** — when you create a character, a default session "Adventure of <hero name>" is auto-created and set active.
- **Auto-migration from v0.1/v0.2 chat history** — legacy `messagesByChar` is preserved under `_legacyMessagesByChar` and converted to per-character `migrated-<id>` sessions.
- DM can now introduce NPCs in-tool via the `npcsIntroduced` array on `update_character_state` (or the `[STATE]…[/STATE]` fallback).

## 🟢 v0.2 (still live)
**URL:** http://super-alpaca-ee3f56.netlify.app
**Password:** `My-Drop-Site`

**Changes since v0.1:**
- Pulsing red notification dot on the **World tab** when there's an active character but no active world. Tapping the World tab (or saving a world) clears it.
- **Custom weapons**: a full "Forge custom weapon" modal with name, damage dice, damage type, range, weight, cost, rarity, multi-select properties, and a **lore/notes field** that the AI reads.
- **Weapons tab** now splits into Mine / Library / Custom.
- **Tappable DM choices**: the DM's `> suggested action` lines now render as tappable gold buttons in the chat.
- **Toast fix**: all toasts now auto-dismiss after ~3.5s.

## v0.1 (still works)
**URL:** http://curious-cobbler-467d80.netlify.app
**Password:** `My-Drop-Site`

---

## 📱 Test on iPhone
1. Open the URL above in Safari → enter password
2. Share → **Add to Home Screen**
3. Launch — first run onboarding gets you a hero + key

## 🔄 Re-deploy later
```powershell
npm run build
npx netlify deploy --prod --dir=dist
```
