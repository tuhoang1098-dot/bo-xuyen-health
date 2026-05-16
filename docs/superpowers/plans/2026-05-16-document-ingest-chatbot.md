# Document Ingestion via Chatbot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the caregiver attach any health-related PDF or image to the chatbot tab in `public/index.html`; Claude extracts structured data via `tool_use`, the app auto-saves it to one of 4 new Notion databases (CGM, Labs, Chemo, Doctor Notes), and shows a Vietnamese confirmation in chat.

**Architecture:** Adds 2 new serverless functions (`api/document-db-create.js`, `api/document-save.js`) and extends `api/chat.js` to forward `tools`. Schemas live in a new `api/_document_schemas.js`. Client changes are confined to `public/index.html`: paperclip UI, file-to-base64 handler, `SAVE_DOCUMENT_TOOL` definition, system-prompt extension, modified `submitChat()` / `callAnthropicAPI()`, and an `extractAndSave()` router.

**Tech Stack:**
- CommonJS Vercel Node functions (matching existing `api/*.js` style — no `import`/`export`)
- Raw `fetch()` to `https://api.notion.com/v1/...` (matching existing pattern — no `@notionhq/client` dependency)
- Anthropic Messages API with `document` blocks (PDF/image base64) and `tool_use`
- Existing `apiFetch()` wrapper in `public/index.html` for Bearer-authed POST calls
- `node:test` (Node 18+ built-in) for backend unit tests — no new test deps

**Spec:** [`../specs/2026-05-16-document-ingest-chatbot-design.md`](../specs/2026-05-16-document-ingest-chatbot-design.md)

---

## File Structure

**New files:**
- `api/_document_schemas.js` — `DOCUMENT_SCHEMAS` map + per-type `flatToProps` converter
- `api/document-db-create.js` — POST handler: create one of the 4 DBs in Notion
- `api/document-save.js` — POST handler: create page(s) in a given DB
- `api/_document_schemas.test.js` — node:test unit tests for schema helpers
- `api/document-db-create.test.js` — handler validation tests
- `api/document-save.test.js` — handler validation tests
- `docs/MANUAL_TESTING.md` — checklist of browser test cases

**Modified files:**
- `api/chat.js` — forward optional `tools` field to Anthropic
- `public/index.html` — chat input markup, CSS, and the JS additions described in spec §6.4
- `package.json` — add `scripts.test` so `npm test` runs the new tests

---

## Task 1: `api/_document_schemas.js` + tests

**Files:**
- Create: `api/_document_schemas.js`
- Create: `api/_document_schemas.test.js`
- Modify: `package.json` (add `test` script)

- [ ] **Step 1: Add `test` script to package.json**

Read `package.json`. Inside the top-level object, add a `scripts` block:

```json
"scripts": {
  "test": "node --test api/"
}
```

- [ ] **Step 2: Write failing tests for `_document_schemas.js`**

Create `api/_document_schemas.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { DOCUMENT_SCHEMAS, flatToProps, generateName } = require('./_document_schemas');

test('all four schemas exist with title + properties', () => {
  for (const t of ['cgm', 'labs', 'chemo', 'doctor_notes']) {
    assert.ok(DOCUMENT_SCHEMAS[t], `${t} schema missing`);
    assert.ok(DOCUMENT_SCHEMAS[t].title);
    assert.ok(DOCUMENT_SCHEMAS[t].properties.Name?.title);
  }
});

test('cgm schema has period + range fields', () => {
  const p = DOCUMENT_SCHEMAS.cgm.properties;
  assert.ok(p['Period Start'].date);
  assert.ok(p['Period End'].date);
  assert.ok(p['Avg Glucose (mmol/L)'].number);
  assert.ok(p['Time In Range (%)'].number);
});

test('labs schema has Status select with 4 options', () => {
  const opts = DOCUMENT_SCHEMAS.labs.properties.Status.select.options.map(o => o.name).sort();
  assert.deepEqual(opts, ['Critical', 'High', 'Low', 'Normal']);
});

test('flatToProps(cgm, record) builds Notion property shape', () => {
  const out = flatToProps('cgm', {
    Name: 'CGM 15/01–15/02',
    'Period Start': '2025-01-15',
    'Period End': '2025-02-15',
    Device: 'FreeStyle Libre 2',
    'Avg Glucose (mmol/L)': 7.8,
    'Time In Range (%)': 72,
    Notes: 'cháo days lower'
  });
  assert.equal(out.Name.title[0].text.content, 'CGM 15/01–15/02');
  assert.equal(out['Period Start'].date.start, '2025-01-15');
  assert.equal(out['Avg Glucose (mmol/L)'].number, 7.8);
  assert.equal(out.Device.rich_text[0].text.content, 'FreeStyle Libre 2');
});

test('flatToProps omits missing fields rather than nulling them', () => {
  const out = flatToProps('labs', { Name: 'X', Date: '2025-02-10' });
  assert.equal(out.Name.title[0].text.content, 'X');
  assert.equal(out.Date.date.start, '2025-02-10');
  assert.equal(out.Value, undefined);
  assert.equal(out['Test Name'], undefined);
});

test('flatToProps maps Status to select', () => {
  const out = flatToProps('labs', { Name: 'CA 19-9 — 2025-02-10', Date: '2025-02-10', Status: 'High' });
  assert.equal(out.Status.select.name, 'High');
});

test('flatToProps throws on unknown type', () => {
  assert.throws(() => flatToProps('banana', {}), /Unknown document type/);
});

test('generateName(cgm) formats range', () => {
  assert.equal(generateName('cgm', { 'Period Start': '2025-01-15', 'Period End': '2025-02-15' }), 'CGM 15/01–15/02');
});

test('generateName(labs) uses test name + date', () => {
  assert.equal(generateName('labs', { 'Test Name': 'CA 19-9', Date: '2025-02-10' }), 'CA 19-9 — 2025-02-10');
});

test('generateName(chemo) uses regimen + cycle + date', () => {
  assert.equal(generateName('chemo', { Regimen: 'FOLFIRINOX', 'Cycle Number': 5, Date: '2025-02-01' }), 'FOLFIRINOX Cycle 5 — 2025-02-01');
});

test('generateName(doctor_notes) uses doctor + date', () => {
  assert.equal(generateName('doctor_notes', { Doctor: 'BS. Hạnh', Date: '2025-02-10' }), 'BS. Hạnh — 2025-02-10');
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
npm test
```

Expected: failure — module not found.

- [ ] **Step 4: Implement `api/_document_schemas.js`**

```javascript
const DOCUMENT_SCHEMAS = {
  cgm: {
    title: 'CGM / Blood Glucose',
    properties: {
      Name: { title: {} },
      'Period Start': { date: {} },
      'Period End': { date: {} },
      Device: { rich_text: {} },
      'Avg Glucose (mmol/L)': { number: { format: 'number' } },
      'Time In Range (%)': { number: { format: 'number' } },
      'Time Above Range (%)': { number: { format: 'number' } },
      'Time Below Range (%)': { number: { format: 'number' } },
      Notes: { rich_text: {} }
    }
  },
  labs: {
    title: 'Blood Tests & Lab Results',
    properties: {
      Name: { title: {} },
      Date: { date: {} },
      'Test Name': { rich_text: {} },
      Value: { number: { format: 'number' } },
      Unit: { rich_text: {} },
      'Reference Range': { rich_text: {} },
      Status: {
        select: {
          options: [
            { name: 'Normal', color: 'green' },
            { name: 'High', color: 'orange' },
            { name: 'Low', color: 'blue' },
            { name: 'Critical', color: 'red' }
          ]
        }
      },
      'Lab / Facility': { rich_text: {} }
    }
  },
  chemo: {
    title: 'Chemo Sessions',
    properties: {
      Name: { title: {} },
      Date: { date: {} },
      'Cycle Number': { number: { format: 'number' } },
      Regimen: { rich_text: {} },
      'Dose Reductions': { rich_text: {} },
      'Pre-meds Given': { rich_text: {} },
      'Side Effects Noted': { rich_text: {} },
      'Next Session Date': { date: {} }
    }
  },
  doctor_notes: {
    title: 'Doctor Visit Notes',
    properties: {
      Name: { title: {} },
      Date: { date: {} },
      Doctor: { rich_text: {} },
      Facility: { rich_text: {} },
      'Key Findings': { rich_text: {} },
      'Plan Changes': { rich_text: {} },
      'New Medications': { rich_text: {} },
      'Follow-up Date': { date: {} }
    }
  }
};

function flatToProps(type, record) {
  const schema = DOCUMENT_SCHEMAS[type];
  if (!schema) throw new Error(`Unknown document type: ${type}`);
  const out = {};
  for (const [field, def] of Object.entries(schema.properties)) {
    const value = record[field];
    if (value === undefined || value === null || value === '') continue;
    if (def.title) {
      out[field] = { title: [{ type: 'text', text: { content: String(value) } }] };
    } else if (def.rich_text) {
      out[field] = { rich_text: [{ type: 'text', text: { content: String(value) } }] };
    } else if (def.number) {
      const n = typeof value === 'number' ? value : parseFloat(value);
      if (!Number.isNaN(n)) out[field] = { number: n };
    } else if (def.date) {
      out[field] = { date: { start: String(value) } };
    } else if (def.select) {
      out[field] = { select: { name: String(value) } };
    }
  }
  return out;
}

function generateName(type, record) {
  switch (type) {
    case 'cgm': {
      const fmt = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '?';
      return `CGM ${fmt(record['Period Start'])}–${fmt(record['Period End'])}`;
    }
    case 'labs':
      return `${record['Test Name'] || 'Lab'} — ${record['Date'] || ''}`;
    case 'chemo':
      return `${record['Regimen'] || 'Chemo'} Cycle ${record['Cycle Number'] || '?'} — ${record['Date'] || ''}`;
    case 'doctor_notes':
      return `${record['Doctor'] || 'Bác sĩ'} — ${record['Date'] || ''}`;
    default:
      return 'Untitled';
  }
}

module.exports = { DOCUMENT_SCHEMAS, flatToProps, generateName };
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test
```

Expected: all 10 tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/_document_schemas.js api/_document_schemas.test.js package.json
git commit -m "feat(api): document schemas + flatToProps + generateName for 4 doc types"
```

---

## Task 2: `api/document-db-create.js` + tests

**Files:**
- Create: `api/document-db-create.js`
- Create: `api/document-db-create.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// api/document-db-create.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (j) => { res.body = j; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = () => res;
  return res;
}

const ORIGINAL_PWD = process.env.APP_PASSWORD;
test.before(() => { process.env.APP_PASSWORD = 'testpw'; });
test.after(() => { process.env.APP_PASSWORD = ORIGINAL_PWD; });

const handler = require('./document-db-create');

test('OPTIONS returns 200', async () => {
  const res = mockRes();
  await handler({ method: 'OPTIONS', headers: {} }, res);
  assert.equal(res.statusCode, 200);
});

test('rejects without auth', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, body: { type: 'cgm' } }, res);
  assert.equal(res.statusCode, 401);
});

test('rejects unknown type', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer testpw' }, body: { type: 'banana' } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Unknown type/);
});

test('rejects missing type', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer testpw' }, body: {} }, res);
  assert.equal(res.statusCode, 400);
});

test('rejects missing NOTION_PARENT_PAGE_ID', async () => {
  const oldParent = process.env.NOTION_PARENT_PAGE_ID;
  delete process.env.NOTION_PARENT_PAGE_ID;
  const res = mockRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer testpw' }, body: { type: 'cgm' } }, res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /NOTION_PARENT_PAGE_ID/);
  process.env.NOTION_PARENT_PAGE_ID = oldParent;
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test
```

Expected: module not found.

- [ ] **Step 3: Implement `api/document-db-create.js`**

```javascript
const { checkAuth, cors } = require('./_utils');
const { DOCUMENT_SCHEMAS } = require('./_document_schemas');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { type } = req.body || {};
  if (!type) return res.status(400).json({ error: 'Missing type' });
  const schema = DOCUMENT_SCHEMAS[type];
  if (!schema) return res.status(400).json({ error: `Unknown type: ${type}` });

  const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
  if (!parentPageId) return res.status(500).json({ error: 'Server missing NOTION_PARENT_PAGE_ID env var' });

  const createRes = await fetch('https://api.notion.com/v1/databases', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: parentPageId },
      title: [{ type: 'text', text: { content: schema.title } }],
      properties: schema.properties
    })
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    return res.status(createRes.status).json({ error: err.message || 'Notion API error' });
  }
  const data = await createRes.json();
  return res.json({ id: data.id, title: schema.title });
};
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add api/document-db-create.js api/document-db-create.test.js
git commit -m "feat(api): /api/document-db-create endpoint for auto-creating doc DBs"
```

---

## Task 3: `api/document-save.js` + tests

**Files:**
- Create: `api/document-save.js`
- Create: `api/document-save.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// api/document-save.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (j) => { res.body = j; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = () => res;
  return res;
}

const ORIGINAL_PWD = process.env.APP_PASSWORD;
test.before(() => { process.env.APP_PASSWORD = 'testpw'; });
test.after(() => { process.env.APP_PASSWORD = ORIGINAL_PWD; });

const handler = require('./document-save');

test('OPTIONS returns 200', async () => {
  const res = mockRes();
  await handler({ method: 'OPTIONS', headers: {} }, res);
  assert.equal(res.statusCode, 200);
});

test('rejects without auth', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, body: { database_id: 'x', type: 'cgm', records: [] } }, res);
  assert.equal(res.statusCode, 401);
});

test('rejects missing database_id', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer testpw' }, body: { type: 'cgm', records: [{}] } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /database_id/);
});

test('rejects missing type', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer testpw' }, body: { database_id: 'x', records: [{}] } }, res);
  assert.equal(res.statusCode, 400);
});

test('rejects unknown type', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer testpw' }, body: { database_id: 'x', type: 'banana', records: [{}] } }, res);
  assert.equal(res.statusCode, 400);
});

test('rejects missing records', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer testpw' }, body: { database_id: 'x', type: 'cgm' } }, res);
  assert.equal(res.statusCode, 400);
});

test('rejects empty records array', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer testpw' }, body: { database_id: 'x', type: 'cgm', records: [] } }, res);
  assert.equal(res.statusCode, 400);
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test
```

- [ ] **Step 3: Implement `api/document-save.js`**

```javascript
const { checkAuth, cors } = require('./_utils');
const { DOCUMENT_SCHEMAS, flatToProps } = require('./_document_schemas');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { database_id, type, records } = req.body || {};
  if (!database_id) return res.status(400).json({ error: 'Missing database_id' });
  if (!type) return res.status(400).json({ error: 'Missing type' });
  if (!DOCUMENT_SCHEMAS[type]) return res.status(400).json({ error: `Unknown type: ${type}` });
  if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ error: 'records must be a non-empty array' });

  const pageIds = [];
  for (const record of records) {
    const properties = flatToProps(type, record);
    const createRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parent: { database_id }, properties })
    });
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      return res.status(createRes.status).json({ error: err.message || 'Notion API error', saved_so_far: pageIds });
    }
    const data = await createRes.json();
    pageIds.push(data.id);
  }
  return res.json({ ok: true, page_ids: pageIds });
};
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add api/document-save.js api/document-save.test.js
git commit -m "feat(api): /api/document-save endpoint creates Notion pages for doc types"
```

---

## Task 4: Extend `api/chat.js` to forward `tools`

**Files:**
- Modify: `api/chat.js`

- [ ] **Step 1: Locate the body-forwarding block**

In `api/chat.js`, find the destructured request body (currently `const { model, messages, system, max_tokens } = req.body || {};`) and the JSON.stringify call that builds the Anthropic request.

- [ ] **Step 2: Add `tools` to both destructure and forward**

Change the destructure to:

```javascript
const { model, messages, system, max_tokens, tools } = req.body || {};
```

Change the JSON.stringify body in the fetch call to:

```javascript
body: JSON.stringify({
  model: model || 'claude-sonnet-4-6',
  max_tokens: max_tokens || 1024,
  system,
  messages,
  ...(tools ? { tools } : {}),
}),
```

- [ ] **Step 3: Smoke test locally**

Run: `npx vercel dev`. In a separate terminal:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $APP_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Say hello"}],"system":"You are terse."}'
```

Expected: a JSON response from Anthropic with `content[0].text`. Confirms text-only chat still works.

- [ ] **Step 4: Commit**

```bash
git add api/chat.js
git commit -m "feat(api): /api/chat forwards optional tools field to Anthropic"
```

---

## Task 5: Paperclip UI + `handleFileAttach()` + preview

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add CSS for the attachment widgets**

In `public/index.html`, find the chat input styles (search for `.chat-input-area {`). Add these rules in the same `<style>` block:

```css
.chat-attach-btn {
  background: none;
  border: 1.5px solid var(--mute-2, #B5A990);
  border-radius: 10px;
  width: 38px;
  height: 38px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mute, #7B7062);
  flex-shrink: 0;
  transition: background 0.15s;
}
.chat-attach-btn:hover { background: var(--line-soft, #F3EDDF); }
.chat-attach-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.chat-attach-btn svg { width: 18px; height: 18px; }

.chat-attachment-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--jade-soft, #D6E6DC);
  border: 1.5px solid var(--jade, #2E7D5B);
  border-radius: 14px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--jade-deep, #1F5C42);
  margin: 0 var(--page-pad, 18px) 8px;
}
.chat-attachment-preview .file-icon { font-size: 20px; }
.chat-attachment-preview .file-meta { flex: 1; min-width: 0; }
.chat-attachment-preview .file-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-attachment-preview .file-size { font-size: 11px; opacity: 0.8; }
.chat-attachment-preview .remove-btn { background: none; border: none; color: var(--jade-deep, #1F5C42); font-size: 18px; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
.chat-attachment-preview .remove-btn:hover { background: rgba(46,125,91,0.15); }

.chat-progress-stage {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface, #FFFFFF);
  border-radius: 14px;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--mute, #7B7062);
  align-self: flex-start;
  max-width: 80%;
}
.chat-progress-stage::before {
  content: ''; width: 10px; height: 10px; border-radius: 50%;
  background: var(--jade, #2E7D5B); animation: pulse-dot 1.2s infinite;
}
@keyframes pulse-dot {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.2); }
}

.chat-save-badge {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--jade-soft, #D6E6DC); color: var(--jade-deep, #1F5C42);
  border-radius: 8px; padding: 6px 10px; margin-bottom: 8px;
  font-size: 12px; font-weight: 600;
}
```

- [ ] **Step 2: Add paperclip button + hidden file input + preview container**

Find the `<div class="chat-input-area">` element. Replace it with:

```html
<div class="chat-attachment-preview" id="chatAttachmentPreview" style="display:none">
  <span class="file-icon">📄</span>
  <div class="file-meta">
    <div class="file-name" id="attachFileName">—</div>
    <div class="file-size" id="attachFileSize">—</div>
  </div>
  <button class="remove-btn" onclick="clearAttachment()" title="Bỏ tài liệu">✕</button>
</div>
<div class="chat-input-area">
  <input type="file" id="chatFileInput" accept="application/pdf,image/png,image/jpeg" style="display:none" onchange="handleFileAttach(event.target.files[0])">
  <button class="chat-attach-btn" id="attachBtn" onclick="document.getElementById('chatFileInput').click()" title="Đính kèm tài liệu">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
  </button>
  <textarea class="chat-textarea" id="chatInput" placeholder="Hỏi về sức khỏe của Bố Xuyên..." rows="1"
    onkeydown="handleChatKey(event)" oninput="autoResizeTextarea(this)"></textarea>
  <button class="chat-send-btn" id="sendBtn" onclick="submitChat()" title="Gửi">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
  </button>
</div>
```

- [ ] **Step 3: Add `pendingAttachment` state**

Find the state declarations (search for `let entries = [];`). Just after the chat state block, add:

```javascript
let pendingAttachment = null;  // { name, mimeType, base64, sizeBytes } or null
```

- [ ] **Step 4: Add file handling functions**

Find the end of the chat-related JS (search for `function handleChatKey`). Just above it (or near other chat helpers), add:

```javascript
// ═══════════════════════════════════════════════════════════
// DOCUMENT INGEST — file attachment handling
// ═══════════════════════════════════════════════════════════
const MAX_ATTACHMENT_BYTES = 32 * 1024 * 1024; // 32MB (Anthropic PDF limit)
const ACCEPTED_MIME = ['application/pdf', 'image/png', 'image/jpeg'];

async function handleFileAttach(file) {
  if (!file) return;
  if (!ACCEPTED_MIME.includes(file.type)) {
    showToast('Chỉ hỗ trợ PDF, PNG, hoặc JPG. (HEIC không hỗ trợ — vui lòng chuyển đổi.)', 'error');
    document.getElementById('chatFileInput').value = '';
    return;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    showToast(`Tài liệu quá lớn (${(file.size/1024/1024).toFixed(1)}MB). Tối đa 32MB.`, 'error');
    document.getElementById('chatFileInput').value = '';
    return;
  }
  const base64 = await fileToBase64(file);
  pendingAttachment = { name: file.name, mimeType: file.type, base64, sizeBytes: file.size };
  renderAttachmentPreview();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result);
      const comma = s.indexOf(',');
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function renderAttachmentPreview() {
  const wrap = document.getElementById('chatAttachmentPreview');
  if (!pendingAttachment) { wrap.style.display = 'none'; return; }
  document.getElementById('attachFileName').textContent = pendingAttachment.name;
  const kb = pendingAttachment.sizeBytes / 1024;
  const sizeStr = kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb/1024).toFixed(1)} MB`;
  const typeStr = pendingAttachment.mimeType === 'application/pdf' ? 'PDF' : 'Hình ảnh';
  document.getElementById('attachFileSize').textContent = `${sizeStr} · ${typeStr}`;
  wrap.style.display = 'flex';
}

function clearAttachment() {
  pendingAttachment = null;
  document.getElementById('chatFileInput').value = '';
  renderAttachmentPreview();
}
```

- [ ] **Step 5: Create manual test doc + verify**

Create `docs/MANUAL_TESTING.md`:

```markdown
# Manual Testing Checklist

Run on a Vercel preview deploy (push to a non-master branch) OR `npx vercel dev`.

## Task 5: file attachment UI

- [ ] **PDF attach.** Click 📎, choose a PDF. Green bubble appears with filename + size + "PDF" label.
- [ ] **Image attach.** Same, but with PNG/JPG. Label says "Hình ảnh".
- [ ] **Remove (✕).** Click ✕ — bubble disappears.
- [ ] **Size > 32MB rejected.** Try a large file. Red toast; no bubble.
- [ ] **HEIC rejected.** Try a .heic. Red toast about format.
```

Deploy to preview, run the tests.

- [ ] **Step 6: Commit**

```bash
git add public/index.html docs/MANUAL_TESTING.md
git commit -m "feat(ui): paperclip button + handleFileAttach + preview bubble"
```

---

## Task 6: Tool definition, modified chat flow, `extractAndSave`, `ensureDocumentDb`

This is the largest task — it wires everything together. Splitting further would create circular dependencies between unwired pieces. Subagent should expect ~30 min of work and test thoroughly.

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add `notionDocDbIds` state + cost-note flag**

Just after `pendingAttachment` (from Task 5), add:

```javascript
let notionDocDbIds = {};
try { notionDocDbIds = JSON.parse(localStorage.getItem('health_doc_db_ids') || '{}'); } catch {}

let _costNoteShown = !!localStorage.getItem('health_cost_note_shown');
```

- [ ] **Step 2: Add `SAVE_DOCUMENT_TOOL` + system prompt extension**

Near the end of the chat-related JS (just after `clearAttachment`), add:

```javascript
// ═══════════════════════════════════════════════════════════
// DOCUMENT INGEST — Anthropic tool definition + prompt extension
// ═══════════════════════════════════════════════════════════
const SAVE_DOCUMENT_TOOL = {
  name: 'save_document',
  description: 'Extract structured health data from an attached medical document (CGM report, lab results, chemo session, or doctor visit notes) and save it to the patient profile. If you cannot identify the document type, do NOT call the tool — instead reply in Vietnamese explaining what you saw.',
  input_schema: {
    type: 'object',
    required: ['document_type', 'summary_vi', 'records'],
    properties: {
      document_type: { type: 'string', enum: ['cgm', 'labs', 'chemo', 'doctor_notes'] },
      summary_vi: { type: 'string', description: 'Short (1-3 sentence) Vietnamese summary shown to the caregiver.' },
      records: {
        type: 'array',
        minItems: 1,
        description: 'Records to insert. CGM = one record per period. Labs = one record per individual test. Chemo = one per session. Doctor notes = one per visit. NEVER invent values — omit fields you cannot read.',
        items: { type: 'object', additionalProperties: true }
      }
    }
  }
};

function documentSystemPromptExtension() {
  return `

---
**TÀI LIỆU ĐÍNH KÈM:** Người dùng vừa đính kèm một tài liệu y khoa. Hãy nhận diện loại tài liệu (cgm/đường huyết, labs/xét nghiệm, chemo/hóa trị, hoặc doctor_notes/ghi chú khám bệnh) và gọi tool \`save_document\` với dữ liệu đã trích xuất.

Yêu cầu nghiêm ngặt:
- KHÔNG bịa giá trị. Nếu một trường không có trong tài liệu, bỏ qua nó.
- Trường \`summary_vi\` phải bằng tiếng Việt, ngắn gọn, nêu rõ con số quan trọng.
- Nếu tài liệu chứa nhiều loại (ví dụ ghi chú khám + xét nghiệm), gọi tool nhiều lần với \`document_type\` khác nhau.
- Nếu không xác định được loại tài liệu, KHÔNG gọi tool — thay vào đó trả lời bằng tiếng Việt giải thích những gì bạn thấy và hỏi cách xử lý.

Tên trường cho từng loại:
- cgm: Period Start, Period End, Device, Avg Glucose (mmol/L), Time In Range (%), Time Above Range (%), Time Below Range (%), Notes
- labs: Date, Test Name, Value, Unit, Reference Range, Status (Normal|High|Low|Critical), Lab / Facility
- chemo: Date, Cycle Number, Regimen, Dose Reductions, Pre-meds Given, Side Effects Noted, Next Session Date
- doctor_notes: Date, Doctor, Facility, Key Findings, Plan Changes, New Medications, Follow-up Date`;
}
```

- [ ] **Step 3: Modify `buildSystemPrompt` to accept a `mode` argument**

Find `function buildSystemPrompt()` and change its signature to `function buildSystemPrompt(mode)`. Just before its final `return prompt;` line, add:

```javascript
  if (mode === 'document') prompt += documentSystemPromptExtension();
```

- [ ] **Step 4: Modify `callAnthropicAPI` to forward options + return full response**

Replace the existing `async function callAnthropicAPI(messages)` body with:

```javascript
async function callAnthropicAPI(messages, options = {}) {
  const body = {
    model: selectedModel,
    max_tokens: options.max_tokens || 2048,
    system: buildSystemPrompt(options.mode),
    messages
  };
  if (options.tools) body.tools = options.tools;
  const data = await apiFetch('/api/chat', body);
  return data; // full response — caller decides what to use
}
```

Then find the one existing call site inside `submitChat` (currently `response = await callAnthropicAPI(chatHistory);`) and change it to:

```javascript
const apiResp = await callAnthropicAPI(chatHistory);
response = apiResp.content?.[0]?.text || 'Không có phản hồi.';
```

This keeps text-only chat working with the new full-response shape.

- [ ] **Step 5: Add helpers for progress + save summary + user attachment message**

Just before `function submitChat()`, add:

```javascript
// ═══════════════════════════════════════════════════════════
// DOCUMENT INGEST — UI helpers (progress, save summary)
// ═══════════════════════════════════════════════════════════
const PROGRESS_STAGES = {
  reading: 'Đang đọc tài liệu...',
  extracting: 'Đang trích xuất dữ liệu...',
  saving: 'Đang lưu vào Notion...'
};

function showProgressStage(stage) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-progress-stage';
  div.textContent = PROGRESS_STAGES[stage] || '...';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function updateProgressStage(el, stage) {
  if (el) el.textContent = PROGRESS_STAGES[stage] || '...';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function addSaveSummary(badgeText, summaryVi) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-msg assistant';
  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar'; avatar.textContent = 'AI';
  const bubble = document.createElement('div'); bubble.className = 'msg-bubble';
  bubble.innerHTML = `<div class="chat-save-badge">✓ ${escapeHtml(badgeText)}</div>${formatMessage(summaryVi || '')}`;
  const meta = document.createElement('div'); meta.className = 'msg-meta';
  meta.textContent = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const inner = document.createElement('div'); inner.style.maxWidth = '100%';
  inner.appendChild(bubble); inner.appendChild(meta);
  div.appendChild(avatar); div.appendChild(inner);
  container.appendChild(div); container.scrollTop = container.scrollHeight;
}

function addUserMessageWithAttachment(text, attachmentName) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div'); div.className = 'chat-msg user';
  const avatar = document.createElement('div'); avatar.className = 'msg-avatar'; avatar.textContent = 'Bạn';
  const inner = document.createElement('div');
  inner.style.cssText = 'display:flex;flex-direction:column;gap:6px;align-items:flex-end';
  inner.innerHTML = `
    <div style="background:var(--jade-soft,#D6E6DC);border:1.5px solid var(--jade,#2E7D5B);border-radius:14px 4px 14px 14px;padding:8px 12px;font-size:12px;color:var(--jade-deep,#1F5C42);display:flex;align-items:center;gap:8px">
      <span style="font-size:18px">📄</span>
      <span><strong>${escapeHtml(attachmentName)}</strong></span>
    </div>
    ${text ? `<div class="msg-bubble">${formatMessage(text)}</div>` : ''}
    <div class="msg-meta">${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
  `;
  div.appendChild(avatar); div.appendChild(inner);
  container.appendChild(div); container.scrollTop = container.scrollHeight;
}

function maybeShowFirstTimeCostNote() {
  if (_costNoteShown) return;
  showToast('Tài liệu sẽ được Claude đọc. Mỗi lần tải lên dùng nhiều token hơn câu hỏi văn bản.', 'success');
  _costNoteShown = true;
  try { localStorage.setItem('health_cost_note_shown', '1'); } catch {}
}
```

- [ ] **Step 6: Add `ensureDocumentDb` + `extractAndSave` + `refreshAfterSave`**

Just after the helpers, add:

```javascript
// ═══════════════════════════════════════════════════════════
// DOCUMENT INGEST — DB lifecycle, routing, save
// ═══════════════════════════════════════════════════════════

const _ensureDbInflight = {};
async function ensureDocumentDb(type) {
  if (notionDocDbIds[type]) return notionDocDbIds[type];
  if (_ensureDbInflight[type]) return _ensureDbInflight[type];
  _ensureDbInflight[type] = (async () => {
    const { id } = await apiFetch('/api/document-db-create', { type });
    notionDocDbIds[type] = id;
    try { localStorage.setItem('health_doc_db_ids', JSON.stringify(notionDocDbIds)); } catch {}
    return id;
  })();
  try { return await _ensureDbInflight[type]; }
  finally { delete _ensureDbInflight[type]; }
}

const TYPE_LABELS_VI = {
  cgm: 'Đã lưu dữ liệu CGM',
  labs: 'Đã lưu kết quả xét nghiệm',
  chemo: 'Đã lưu hóa trị',
  doctor_notes: 'Đã lưu ghi chú khám bệnh'
};

function generateNameClient(type, record) {
  // mirror api/_document_schemas.js generateName, kept client-side
  switch (type) {
    case 'cgm': {
      const fmt = (iso) => iso ? iso.slice(8,10) + '/' + iso.slice(5,7) : '?';
      return `CGM ${fmt(record['Period Start'])}–${fmt(record['Period End'])}`;
    }
    case 'labs': return `${record['Test Name'] || 'Lab'} — ${record['Date'] || ''}`;
    case 'chemo': return `${record['Regimen'] || 'Chemo'} Cycle ${record['Cycle Number'] || '?'} — ${record['Date'] || ''}`;
    case 'doctor_notes': return `${record['Doctor'] || 'Bác sĩ'} — ${record['Date'] || ''}`;
    default: return 'Untitled';
  }
}

async function extractAndSave(input) {
  const type = input.document_type;
  const records = Array.isArray(input.records) ? input.records : [];
  const summary = input.summary_vi || '';

  if (!TYPE_LABELS_VI[type]) return { ok: false, error: `Loại không hợp lệ: ${type}` };
  if (records.length === 0) return { ok: false, error: 'Không có dữ liệu để lưu.' };

  // Auto-generate Name field
  const enriched = records.map(r => ({ ...r, Name: r.Name || generateNameClient(type, r) }));

  // Gates (stubs for Task 7 — accept everything for now)
  if (type === 'doctor_notes' && enriched.some(r => r['New Medications'])) {
    const ok = await confirmMedChange(enriched, summary);
    if (!ok) return { ok: true, badgeText: 'Đã bỏ qua (không lưu)', summary: 'Bạn đã chọn không lưu thay đổi thuốc này.' };
  }
  if (type === 'cgm') {
    const dup = await detectDuplicateCGM(enriched);
    if (dup === 'skip') return { ok: true, badgeText: 'Đã bỏ qua trùng lặp', summary: 'Đã có dữ liệu CGM trùng khoảng thời gian này.' };
  }

  try {
    const dbId = await ensureDocumentDb(type);
    const { page_ids } = await apiFetch('/api/document-save', { database_id: dbId, type, records: enriched });
    const badgeText = `${TYPE_LABELS_VI[type]} (${page_ids.length} bản ghi)`;
    return { ok: true, badgeText, summary, recordIds: page_ids };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function refreshAfterSave() {
  try { await loadData(); } catch (e) { console.warn('refresh failed', e); }
}

// Stubs replaced in Task 7
async function confirmMedChange() { console.warn('confirmMedChange stub'); return true; }
async function detectDuplicateCGM() { console.warn('detectDuplicateCGM stub'); return 'new'; }
```

- [ ] **Step 7: Replace `submitChat()` with the attachment-aware version**

Replace the entire existing `async function submitChat()` body:

```javascript
async function submitChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  const hasAttachment = !!pendingAttachment;
  if (!text && !hasAttachment) return;
  if (isResponding) return;

  const welcome = document.getElementById('chatWelcome');
  if (welcome) welcome.style.display = 'none';
  document.getElementById('chatSuggestions').style.display = 'none';

  const attachment = pendingAttachment;
  input.value = '';
  autoResizeTextarea(input);

  if (attachment) {
    addUserMessageWithAttachment(text, attachment.name);
    clearAttachment();
  } else {
    addMessage('user', text);
  }

  const userContent = attachment
    ? buildAttachmentMessageContent(attachment, text)
    : text;
  chatHistory.push({ role: 'user', content: userContent });

  isResponding = true;
  document.getElementById('sendBtn').disabled = true;
  document.getElementById('attachBtn').disabled = true;

  let progressEl = null;
  try {
    if (attachment) {
      progressEl = showProgressStage('reading');
      maybeShowFirstTimeCostNote();
      const apiResp = await callAnthropicAPI(chatHistory, { mode: 'document', tools: [SAVE_DOCUMENT_TOOL] });
      updateProgressStage(progressEl, 'extracting');

      const toolUses = (apiResp.content || []).filter(b => b.type === 'tool_use');
      const textBlocks = (apiResp.content || []).filter(b => b.type === 'text').map(b => b.text);

      if (toolUses.length === 0) {
        progressEl?.remove();
        const reply = textBlocks.join('\n\n') || 'Không nhận diện được loại tài liệu.';
        addMessage('assistant', reply);
        chatHistory.push({ role: 'assistant', content: reply });
      } else {
        updateProgressStage(progressEl, 'saving');
        const results = [];
        for (const tu of toolUses) results.push(await extractAndSave(tu.input));
        progressEl?.remove();
        for (const r of results) {
          if (r.ok) addSaveSummary(r.badgeText, r.summary);
          else addMessage('assistant', `Lỗi lưu: ${r.error}`);
        }
        await refreshAfterSave();
        chatHistory.push({ role: 'assistant', content: results.map(r => r.summary || `Lỗi: ${r.error}`).join('\n') });
      }
    } else {
      const typing = showTyping();
      const apiResp = await callAnthropicAPI(chatHistory);
      const response = apiResp.content?.[0]?.text || 'Không có phản hồi.';
      typing.remove();
      addMessage('assistant', response);
      chatHistory.push({ role: 'assistant', content: response });
    }
    saveConversation();
  } catch (err) {
    progressEl?.remove();
    addMessage('assistant', `Xin lỗi, có lỗi: ${err.message}.`);
  }
  isResponding = false;
  document.getElementById('sendBtn').disabled = false;
  document.getElementById('attachBtn').disabled = false;
  input.focus();
}

function buildAttachmentMessageContent(attachment, text) {
  const isImage = attachment.mimeType.startsWith('image/');
  const docBlock = isImage
    ? { type: 'image', source: { type: 'base64', media_type: attachment.mimeType, data: attachment.base64 } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: attachment.base64 } };
  return [docBlock, { type: 'text', text: text || 'Phân tích và lưu tài liệu này.' }];
}
```

- [ ] **Step 8: Manual test — first end-to-end ingest**

Append to `docs/MANUAL_TESTING.md`:

```markdown
## Task 6: end-to-end document ingest

> Prerequisite: `NOTION_PARENT_PAGE_ID` env var set on the Vercel preview, and the Notion integration is shared with that parent page.

- [ ] **Text-only chat still works.** Send a text message in chat — normal AI reply appears.
- [ ] **Lab PDF ingest.** Attach a simple lab report PDF, send. Watch progress: "Đang đọc..." → "Đang trích xuất..." → "Đang lưu...". Green ✓ badge appears with Vietnamese summary. Notion: a new "Blood Tests & Lab Results" DB exists under your parent page, populated with N rows.
- [ ] **CGM PDF ingest.** Same flow with a FreeStyle Libre report. CGM DB created, one row with period dates + averages.
- [ ] **Image ingest.** Attach a JPG/PNG of any health doc. Same flow.
- [ ] **Non-medical doc.** Attach a recipe PDF or similar. Claude should explain in Vietnamese it cannot identify, and NOT create any Notion rows.
- [ ] **First-upload cost toast.** First doc upload in a fresh browser shows the token cost toast once. Refresh and upload again — toast does NOT reappear (localStorage flag set).
```

Deploy to preview, run the tests.

- [ ] **Step 9: Commit**

```bash
git add public/index.html docs/MANUAL_TESTING.md
git commit -m "feat: end-to-end document ingest with tool_use, ensureDb, extractAndSave"
```

---

## Task 7: CGM dedup + med-change confirm (replaces stubs)

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Replace `detectDuplicateCGM` stub**

Find the `async function detectDuplicateCGM()` stub and replace with:

```javascript
async function detectDuplicateCGM(records) {
  const r = records[0];
  if (!r || !r['Period Start'] || !r['Period End']) return 'new';
  const dbId = notionDocDbIds.cgm;
  if (!dbId) return 'new';

  let existing = [];
  try {
    const search = await apiFetch('/api/notion-search', { database_id: dbId });
    const pages = await Promise.all((search.results || []).map(p => apiFetch('/api/notion-fetch', { page_id: p.id })));
    existing = pages.map(p => {
      const m = (p.text || '').match(/<properties>\s*(\{[\s\S]*?\})\s*<\/properties>/);
      if (!m) return null;
      try { return JSON.parse(m[1]); } catch { return null; }
    }).filter(Boolean);
  } catch { return 'new'; }

  const newStart = r['Period Start'], newEnd = r['Period End'];
  const overlap = existing.filter(e => {
    const es = e['date:Period Start:start'], ee = e['date:Period End:start'];
    return es && ee && es <= newEnd && newStart <= ee;
  });
  if (overlap.length === 0) return 'new';
  return await showDuplicateCgmPrompt(overlap, r);
}

function showDuplicateCgmPrompt(overlap, newRecord) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal';
    backdrop.style.display = 'flex';
    backdrop.innerHTML = `
      <div class="modal-content" style="max-width:420px">
        <h3>Trùng khoảng thời gian CGM</h3>
        <p style="margin:12px 0;font-size:14px">Đã có ${overlap.length} bản ghi CGM trùng khoảng <strong>${escapeHtml(newRecord['Period Start'])} – ${escapeHtml(newRecord['Period End'])}</strong>. Bạn muốn làm gì?</p>
        <div class="modal-actions" style="flex-direction:column;gap:8px">
          <button class="btn-secondary" data-act="skip">Bỏ qua (không lưu)</button>
          <button class="btn-primary" data-act="new">Lưu thêm bản mới</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.querySelectorAll('button').forEach(b => {
      b.onclick = () => { document.body.removeChild(backdrop); resolve(b.dataset.act); };
    });
  });
}
```

Note: this relies on `api/_utils.js` allowing the new CGM DB ID in `notion-search` and `notion-fetch`. The current allowlist (`ALLOWED_DB_IDS` in `_utils.js`) only has the daily-log + meds DB IDs. We need to either:
- Add a flag to bypass the allowlist for caller-supplied IDs, OR
- Remove the allowlist check from `notion-search.js` and `notion-fetch.js` (rely on auth + the Notion integration's own page-sharing as the safety boundary)

**Decision:** Remove the allowlist check from those two read endpoints. They're auth-gated and only return data the integration already has access to — there's no additional safety benefit from the in-memory allowlist for reads.

- [ ] **Step 2: Remove allowlist check from `notion-search.js`**

In `api/notion-search.js`, delete these lines:

```javascript
if (!ALLOWED_DB_IDS.has(database_id)) {
  return res.status(400).json({ error: 'Unknown database' });
}
```

Also remove the unused `ALLOWED_DB_IDS` from the `require` line:

```javascript
const { checkAuth, cors } = require('./_utils');
```

- [ ] **Step 3: Replace `confirmMedChange` stub**

Find the `async function confirmMedChange()` stub and replace with:

```javascript
async function confirmMedChange(records, summary) {
  const medChanges = records.map(r => r['New Medications']).filter(Boolean).join('\n• ');
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal';
    backdrop.style.display = 'flex';
    backdrop.innerHTML = `
      <div class="modal-content" style="max-width:480px">
        <h3>Xác nhận thay đổi thuốc</h3>
        <p style="margin:12px 0;font-size:14px">Ghi chú khám bệnh có thay đổi thuốc. Vui lòng xác nhận trước khi lưu:</p>
        <div style="background:var(--clay-tint,#FAEAE1);border-left:3px solid var(--clay,#B14A2E);padding:10px 14px;border-radius:8px;font-size:14px;margin-bottom:12px">
          • ${escapeHtml(medChanges)}
        </div>
        ${summary ? `<p style="font-size:13px;color:var(--mute,#7B7062);margin-bottom:12px">${escapeHtml(summary)}</p>` : ''}
        <div class="modal-actions">
          <button class="btn-primary" data-act="save">Lưu</button>
          <button class="btn-secondary" data-act="cancel">Bỏ qua</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.querySelectorAll('button').forEach(b => {
      b.onclick = () => { document.body.removeChild(backdrop); resolve(b.dataset.act === 'save'); };
    });
  });
}
```

- [ ] **Step 4: Append manual test cases**

```markdown
## Task 7: CGM dedup + med-change confirm

- [ ] **First CGM upload — no modal.** Upload a CGM PDF for Jan 15–Feb 15. Saved directly, no prompt.
- [ ] **Same period re-upload — modal shows.** Upload the same PDF. "Trùng khoảng thời gian CGM" modal appears.
- [ ] **Skip duplicate.** Click "Bỏ qua". Chat: "Đã bỏ qua trùng lặp". No new Notion row.
- [ ] **Save duplicate as new.** Re-upload, click "Lưu thêm bản mới". Second row added.
- [ ] **Non-overlapping period — no modal.** Upload Mar 1–Mar 14 PDF. Saved directly.
- [ ] **Doctor note WITHOUT med change — auto-saves.** Attach a notes PDF that doesn't mention any prescription/dose change. Saves directly.
- [ ] **Doctor note WITH med change — modal shows.** Attach a note saying "Tăng liều Lantus lên 10U". "Xác nhận thay đổi thuốc" modal lists the changes.
- [ ] **Confirm med change save.** Click "Lưu" — record saved.
- [ ] **Cancel med change.** Click "Bỏ qua" — nothing saved; chat: "Đã bỏ qua (không lưu)".
```

- [ ] **Step 5: Commit**

```bash
git add public/index.html api/notion-search.js docs/MANUAL_TESTING.md
git commit -m "feat: CGM dedup modal + med-change confirm modal"
```

---

## Task 8: Deploy + full end-to-end verification

**Files:** None new — Vercel + Notion configuration.

- [ ] **Step 1: Pick the parent page in Notion**

Either create a new Notion page titled "Bố Xuyên — Health Documents" at the root of your workspace, or pick an existing one. Click `•••` → `Connections` → add the existing "Bố Xuyên Health" integration.

- [ ] **Step 2: Copy the parent page ID**

From the page URL, copy the 32-character hex string (drop the dashes if present in URL form — Notion accepts both).

- [ ] **Step 3: Add `NOTION_PARENT_PAGE_ID` env var**

Vercel dashboard → project → Settings → Environment Variables → add `NOTION_PARENT_PAGE_ID=<id>` for Production, Preview, and Development.

- [ ] **Step 4: Push to master**

```bash
git push origin master
```

Vercel auto-deploys.

- [ ] **Step 5: Run the full manual test checklist**

Open https://bo-xuyen-health.vercel.app → log in → run every ✓ in `docs/MANUAL_TESTING.md` against the live site, in order. Fix any issues before declaring done.

- [ ] **Step 6: Tag release**

```bash
git tag -a v1.1-doc-ingest -m "Document ingestion via chatbot"
git push origin v1.1-doc-ingest
```

---

## Self-review notes (from author)

**Spec coverage:**
- §3 (4 doc types) → schemas in Task 1, tool in Task 6
- §4.1 (attachment flow) → Task 5
- §4.2 (staged progress) → Task 6 (helpers + submitChat)
- §4.3 (reply format) → Task 6 (`addSaveSummary`)
- §4.4 (confirm med changes) → Task 7
- §5 (schemas) → Task 1
- §5.1 (CGM dedup) → Task 7
- §6.1 (existing infra) → no work needed (verified)
- §6.2 (new backend) → Tasks 1, 2, 3, 4
- §6.3 (new env var) → Task 8
- §6.4 (client-side units) → Tasks 5, 6
- §6.5 (data flow) → Task 6 (submitChat)
- §6.6 (tool definition) → Task 6
- §6.7 (system prompt) → Task 6
- §7 (error handling) → distributed (validation in 5, API errors in 2/3, modal flows in 7)
- §8 (one-time setup) → Task 8
- §9 (cost note) → Task 6
- §10 (out of scope) → not implemented by design

**Type / name consistency:**
- `pendingAttachment` declared Task 5, used Task 6.
- `notionDocDbIds` declared Task 6 (step 1), used in `ensureDocumentDb` and `detectDuplicateCGM`.
- `SAVE_DOCUMENT_TOOL` declared Task 6 (step 2), used in step 7.
- `extractAndSave(input)` consistent across stub (step 6) and call site (step 7).
- `confirmMedChange` / `detectDuplicateCGM` stubbed in Task 6, replaced in Task 7 — signatures match.
- Server endpoints: `/api/document-db-create`, `/api/document-save` — names consistent across Tasks 2, 3, 6.
- Schema field names match between `_document_schemas.js` (Task 1), tool description (Task 6 step 2), and `generateNameClient` (Task 6 step 6).
