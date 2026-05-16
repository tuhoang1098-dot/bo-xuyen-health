# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this project is

A personal health-tracking web app for **Nguyễn Sơn Xuyên** ("Bố Xuyên"), 66, the father of the project owner. Backs the family's day-to-day care for him.

Deployed at https://bo-xuyen-health.vercel.app — auto-deployed by Vercel on every push to `master` of this repo.

This is **personal medical data for a real family member**. Treat copy, recommendations, and visuals with the warmth and seriousness this implies. Do not generate flippant content. Do not produce clinical advice that bypasses his actual care team.

## People

- **Bố Xuyên (Patient)** — 66, Vietnamese, tech-comfortable on his phone. Primary user. Reads Vietnamese.
- **Project owner (Caregiver)** — Bố Xuyên's child. Reads English. Does the heavier analysis (charts, AI assistant, Notion edits).
- **Dr. Hạnh** — Bố Xuyên's oncologist. Referenced in AI prompts but not a user of the app.

## Medical context (load-bearing for any AI-generated content)

- Stage II pancreatic cancer; **total pancreatectomy** completed
- **Type 3c diabetes** (pancreatogenic) — Lantus 8U @ 9 PM, Apidra 2–6U pre-meals, Glucophage XR 500 mg morning
- **FOLFIRINOX** chemotherapy, biweekly, 12 rounds
- **Creon** (pancreatic enzyme replacement) with every meal — non-negotiable
- Other meds: Pepsin, Multivitamins, Milk Thistle, Loperamide PRN, Smecta PRN, anti-nausea PRN, pain meds PRN, G-CSF PRN
- Dumping syndrome triggered by high-sugar / high-fat foods
- Underweight (~18 BMI) — **calorie intake is critical**
- CGM data: cháo (porridge) days avg ~7.5 mmol/L, cơm (rice) days ~10.0 mmol/L

## Repo layout

```
api/                       ← Vercel Node.js serverless functions (CommonJS)
  _schema.js               ← canonical PROPERTY_SCHEMA + flatToNotionProps converter
  _utils.js                ← ALLOWED_DB_IDS allowlist + Bearer auth + CORS
  chat.js                  ← Anthropic API proxy (server-side key, rate-limited)
  health.js                ← liveness check
  notion-create.js         ← create page in allowed DB
  notion-fetch.js          ← fetch single page → flat dict in <properties>{...}</properties> envelope
  notion-search.js         ← list page IDs in a DB (allowlisted)
  notion-update.js         ← PATCH page properties
public/
  index.html               ← single-file SPA (vanilla JS + Chart.js via CDN)
  image-slot.js
  assets/                  ← static images
package.json               ← engines: node >=18, no runtime deps yet
vercel.json                ← SPA rewrite: all routes → /index.html
docs/superpowers/
  specs/                   ← design specs from brainstorming sessions
  plans/                   ← implementation plans
```

## Production environment

Three env vars MUST be set on Vercel (Production + Preview + Development):

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Used by `api/chat.js` to proxy AI calls. Never exposed to browser. |
| `NOTION_TOKEN` | Internal integration token. Used by all 4 `notion-*` functions. |
| `APP_PASSWORD` | Bearer token the client sends in `Authorization` header. Gates every `/api/*` call (except `health`). |

Login flow: user opens the site → enters `APP_PASSWORD` → it's stored in `sessionStorage.app_password` → `apiFetch()` helper attaches it as `Authorization: Bearer <pwd>` on every API call.

## Backend architecture (api/)

**CommonJS** (`require` / `module.exports`) because Vercel's default Node runtime parses these as CommonJS. Do not switch to ESM without setting `"type": "module"` in `package.json` and renaming files.

### `api/_utils.js` — auth + CORS + DB allowlist

```javascript
const ALLOWED_DB_IDS = new Set([
  'ea677d7a-a61f-4455-bf71-82e7beec4095',  // Daily Health Log
  '1058b7ac-5ea3-446c-93db-59d171b898d5',  // Medications
]);
function checkAuth(req) { /* Bearer token === process.env.APP_PASSWORD */ }
function cors(res) { /* Access-Control-Allow-Origin: * */ }
```

When adding a new Notion DB, add its ID here OR remove the allowlist guard in the relevant endpoint.

### `api/_schema.js` — PROPERTY_SCHEMA + converter

`PROPERTY_SCHEMA` is a flat `{ propertyName: notionType }` map describing every column of the daily-log DB. `flatToNotionProps(flat)` converts the client-side flat dict into Notion's nested property shape on writes.

Quirk: date fields use the key `date:<PropName>:start` on the flat side (e.g. `date:Date:start`) and get re-wrapped to `{ date: { start: "..." } }` on write. The matching reader is in `notion-fetch.js` (`notionPropsToFlat`).

To add a new property to the daily-log DB: add a row to `PROPERTY_SCHEMA` and update the matching `notionPropsToFlat` if it's a new Notion type.

### Read path: `notion-search` → `notion-fetch`

`notion-search` returns just `{ results: [{ id }, ...] }` — no properties. The client then calls `notion-fetch` per page. Each `notion-fetch` response wraps the flat properties in a `<properties>{...}</properties>` string envelope for legacy parser compatibility in `public/index.html`.

### Write path: `notion-create` / `notion-update`

Both accept `{ database_id, name?, properties }` (`page_id` instead of `database_id` for update). `properties` is the flat dict; the function converts via `flatToNotionProps`.

### `api/chat.js` — Anthropic proxy with rate limit

In-memory rate limit: **60 requests/hour per IP**. Limit resets per Vercel cold start (acceptable for a single-family app). Accepts `{ model, messages, system, max_tokens }` and forwards to `https://api.anthropic.com/v1/messages`. Returns the raw Anthropic response.

## Client architecture (public/index.html)

Single HTML file, no build step. Vanilla JS + Chart.js 4.5 via CDN. Login screen gates a 5-tab dashboard:

| Tab | Function | Notes |
|---|---|---|
| Home | `renderHome()` | Greeting, today's status strip, med schedule, chemo progress dots |
| Log | `renderLog()` | Inline daily-log form + recent-entry list (`logState` object) |
| Progress | `renderProgress()` | Charts (Chart.js) — lazy, rendered once on first tab open |
| Analysis | `renderAnalysis()` | Insights + timeline — lazy, guarded by `analysisRendered` |
| Chat | `submitChat()` / `callAnthropicAPI()` | Proxies through `/api/chat`, system prompt injects medical context + last 10 log entries |

Top-of-script constants worth knowing:
- `DS_ID` — daily-log Notion DB ID (matches `_utils.js` allowlist)
- `MEDS_DS_ID` — medication schedule DB ID
- `CHEMO_TOTAL = 12` — total chemo rounds
- `CHEMO_START_DATE = '2025-01-01'` — **placeholder**, needs updating to the real start date
- Auth wrapper: `apiFetch(url, body)` attaches `Authorization: Bearer <sessionStorage.app_password>` and handles 401 → forced re-login

## Conventions

- **Single HTML file per page** — no bundlers, no frameworks. Vanilla JS + Chart.js via CDN.
- **Vietnamese-first on patient-facing screens.** Other internal forms may stay English.
- **Patient name:** "Bố Xuyên" everywhere on patient screens (not "Ba", not "Dad").
- **Tap targets ≥ 44 px**, body text ≥ 1 rem on patient screens — non-negotiable for a 66-year-old user.
- **Don't produce medical recommendations as instructions.** Frame AI output as "things to discuss with Dr. Hạnh," never as orders.
- **Don't add clinical tooling beyond what's asked.** This is a family tracker, not an EHR.
- **CommonJS in `api/`.** ESM in `public/` (browser).
- **Never log secrets.** `NOTION_TOKEN`, `ANTHROPIC_API_KEY`, `APP_PASSWORD` must never appear in client code, in browser network responses, in commit messages, or in console logs.

## Deploying

Push to `master` → Vercel auto-deploys to https://bo-xuyen-health.vercel.app. For preview deploys, push to any other branch and Vercel will give a preview URL. Env vars are configured in the Vercel dashboard (not in this repo).

To run locally: `npx vercel dev` from repo root. Visit `http://localhost:3000`. You still need `.env.local` with the three env vars above, and the integration must be connected to your Notion workspace.

## Where to look when

- **Adding a new Notion property to the daily log:** `api/_schema.js` (PROPERTY_SCHEMA) + form/render code in `public/index.html`.
- **Adding a new Notion database:** add ID to `ALLOWED_DB_IDS` in `api/_utils.js`, add schema mapping if writes need conversion.
- **Changing AI behavior:** `buildSystemPrompt()` in `public/index.html` (line ~3185).
- **Changing rate limits:** `MAX_REQUESTS` / `WINDOW_MS` in `api/chat.js`.
- **Login UX:** `doLogin()` / `logout()` in `public/index.html` (~line 2138).

## When unsure

Ask the project owner. Especially around:
- Schema changes to the Notion DBs
- Anything that changes how data flows in or out
- New UI tone / language choices
- Anything that would surface in the AI assistant's responses
- Changes to authentication / env-var handling
