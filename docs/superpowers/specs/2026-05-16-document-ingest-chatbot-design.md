# Document Ingestion via Chatbot — Design Spec

**Date:** 2026-05-16 (revised after codebase discovery)
**Project:** `bo-xuyen-health` (this repo)
**Deployed at:** https://bo-xuyen-health.vercel.app

---

## 1. Goal

Let the caregiver attach any health-related document (PDF or image) to the chatbot tab. The AI extracts structured data, automatically saves it to the appropriate Notion database, and confirms in chat with a Vietnamese summary.

Primary first use case: continuous glucose monitor (CGM) PDF reports from FreeStyle LibreView. Designed to generalize to any document type that enriches Bố Xuyên's health profile.

## 2. Non-goals

- Real-time CGM streaming (file uploads only).
- Editing or deleting Notion records via chat (writes only; edits go through Notion directly).
- Medical interpretation or recommendations — Claude always defers to Dr. Hạnh.
- Patient-facing document upload — caregiver-only feature (Bố Xuyên's view is unchanged).

## 3. Document types supported in v1

1. **CGM / Blood Glucose Reports** — period summaries (averages, time-in-range), not minute-by-minute readings.
2. **Blood Tests & Lab Results** — one Notion row per individual test (CA 19-9, HbA1c, WBC, etc.). A single lab panel PDF produces multiple rows.
3. **Chemo Session Records** — FOLFIRINOX session summaries.
4. **Doctor Visit Notes** — clinical assessments and plan changes.

## 4. User experience

### 4.1 Attachment flow

- A 📎 paperclip button appears to the left of the chat textarea.
- Tapping it opens a native file picker accepting `application/pdf,image/png,image/jpeg`.
- HEIC files are rejected with a friendly Vietnamese message asking for JPG/PNG.
- The selected file appears above the textarea as a green attachment bubble showing filename + size.
- File size > 32 MB → toast error, file rejected before API call.
- The user can optionally type a message; otherwise an auto-prompt is added (`"Phân tích và lưu tài liệu này"`).
- Hitting Send dispatches both file and message; the attachment clears from state after dispatch.

### 4.2 Progress feedback

The generic three-dot typing indicator is replaced (for document submissions only) with a staged Vietnamese status line:

1. *"Đang đọc tài liệu..."* (file being uploaded + Claude reading)
2. *"Đang trích xuất dữ liệu..."* (tool call in flight)
3. *"Đang lưu vào Notion..."* (writing to Notion)

### 4.3 Reply format

The assistant reply contains:

1. A green `✓ Đã lưu` confirmation badge stating which DB was written to and how many records.
2. A short Vietnamese summary of what was saved.
3. If applicable, a quiet *"Lần đầu tải tài liệu loại này — đã tạo cơ sở dữ liệu mới trong Notion"* line.

### 4.4 Confirm-before-save exception

Doctor visit notes that contain a **medication change** trigger a confirmation step instead of auto-saving. Inline modal with two buttons: `Lưu` and `Bỏ qua`. All other document types auto-save.

## 5. Notion database schemas

4 new databases are created automatically on first use via a `/api/document-db-create` call. Their IDs are persisted in the browser's `localStorage` keyed by document type. Every database has a required `Name` (Title) property the app auto-generates.

Schemas live in `api/_document_schemas.js` (new file) and follow the same flat-dict → Notion-properties pattern as `api/_schema.js` does for the daily log.

### 5.1 CGM / Blood Glucose

| Field | Notion type | Notes |
|---|---|---|
| Name | Title | Auto: `"CGM DD/MM–DD/MM"` |
| Period Start | Date | Required |
| Period End | Date | Required |
| Device | Rich text | e.g. "FreeStyle Libre 2" |
| Avg Glucose (mmol/L) | Number | |
| Time In Range (%) | Number | |
| Time Above Range (%) | Number | |
| Time Below Range (%) | Number | |
| Notes | Rich text | Free text from report |

**Duplicate handling:** before save, the client queries the CGM DB and checks for rows whose `[Period Start, Period End]` overlaps the new range. If any overlap, prompt the user: skip / save as new.

### 5.2 Blood Tests & Lab Results

One row per test result.

| Field | Notion type | Notes |
|---|---|---|
| Name | Title | Auto: `"<Test Name> — YYYY-MM-DD"` |
| Date | Date | Required |
| Test Name | Rich text | e.g. "CA 19-9", "HbA1c" |
| Value | Number | |
| Unit | Rich text | e.g. "U/mL", "%" |
| Reference Range | Rich text | e.g. "< 37 U/mL" |
| Status | Select | Options: Normal, High, Low, Critical |
| Lab / Facility | Rich text | e.g. "Bệnh viện Chợ Rẫy" |

### 5.3 Chemo Sessions

One row per session.

| Field | Notion type | Notes |
|---|---|---|
| Name | Title | Auto: `"<Regimen> Cycle <N> — DD/MM"` |
| Date | Date | Required |
| Cycle Number | Number | |
| Regimen | Rich text | e.g. "FOLFIRINOX" |
| Dose Reductions | Rich text | |
| Pre-meds Given | Rich text | |
| Side Effects Noted | Rich text | |
| Next Session Date | Date | |

### 5.4 Doctor Visit Notes

One row per visit.

| Field | Notion type | Notes |
|---|---|---|
| Name | Title | Auto: `"<Doctor> — YYYY-MM-DD"` |
| Date | Date | Required |
| Doctor | Rich text | e.g. "BS. Hạnh" |
| Facility | Rich text | |
| Key Findings | Rich text | Long free text |
| Plan Changes | Rich text | |
| New Medications | Rich text | Triggers confirm-before-save |
| Follow-up Date | Date | |

## 6. Architecture

### 6.1 Existing infrastructure (no migration needed)

This spec was originally written assuming the dashboard called Anthropic and Notion directly from the browser via `window.cowork`. **That assumption was wrong.** The real architecture already has:

- `api/chat.js` — Anthropic proxy with server-side `ANTHROPIC_API_KEY` + 60 req/hr rate limit
- `api/notion-search.js`, `notion-fetch.js`, `notion-create.js`, `notion-update.js` — full Notion CRUD
- `api/_schema.js` — `flatToNotionProps()` for the daily-log schema
- `api/_utils.js` — Bearer-token auth (`APP_PASSWORD`), CORS, `ALLOWED_DB_IDS` allowlist
- `public/index.html` — single-file SPA, login screen → 5 tabs, calls these endpoints via `apiFetch()`

This feature **extends** the existing surface; it does NOT replace it.

### 6.2 New backend pieces

**`api/_document_schemas.js`** — exports `DOCUMENT_SCHEMAS` keyed by type (`cgm`, `labs`, `chemo`, `doctor_notes`). Each entry contains:
- `title` — string, used as the Notion database title
- `properties` — object in Notion's `databases.create` shape (mirrors §5 tables)
- `flatToProps(record)` — converts a flat record dict to Notion property write shape

**`api/document-db-create.js`** — `POST { type }` → creates a Notion database under `NOTION_PARENT_PAGE_ID` with the right schema, returns `{ id, title }`. Bearer auth via `checkAuth`. Type must be one of the 4 valid keys.

**`api/document-save.js`** — `POST { database_id, type, records }` → for each record, validates type, calls `flatToProps`, creates a Notion page under `database_id`. Returns `{ ok: true, page_ids: [...] }`. Bearer auth. Does NOT check `ALLOWED_DB_IDS` — the type+schema gate is the safety mechanism (only the 4 known document types can write, and only with the corresponding property shape).

**`api/chat.js` extension** — accept and forward an optional `tools` field to Anthropic. Already accepts arbitrary `messages` content, so document blocks (`{ type: "document", source: { type: "base64", media_type: "application/pdf", data: "..." } }`) and image blocks pass through unchanged. Add `tools` to the forwarded body.

### 6.3 New env var

Add **`NOTION_PARENT_PAGE_ID`** to Vercel — the page where new document databases are created. The Notion integration must have this page shared with it.

### 6.4 Client-side (additions to `public/index.html`)

| Unit | Responsibility | Inputs | Outputs |
|---|---|---|---|
| `pendingAttachment` (state) | `{ name, mimeType, base64, sizeBytes }` or `null` | — | — |
| `notionDocDbIds` (state) | `{ cgm?, labs?, chemo?, doctor_notes? }` cached in `localStorage` | — | — |
| `handleFileAttach(file)` | Validate type/size, read as base64, store in `pendingAttachment`, render preview. | `File` | UI side effect |
| `clearAttachment()` | Reset state and preview bubble. | — | UI side effect |
| `submitChat()` (modified) | If `pendingAttachment` set, build a multi-content user message (`[document_block, text_block]`) and include the `save_document` tool. Otherwise unchanged. | `text` | calls `/api/chat` |
| `callAnthropicAPI(messages, options)` (modified) | Accept optional `tools` and `mode`. Forward to `/api/chat` with `tools` in body. | messages, options | full Claude response |
| `SAVE_DOCUMENT_TOOL` (new) | Anthropic tool definition with field schemas for all 4 doc types. | — | — |
| `documentSystemPromptExtension()` | Returns Vietnamese intake instructions appended to system prompt when a doc is attached. | — | string |
| `progressIndicator(stage)` | Renders the staged Vietnamese status line for document uploads. | stage | UI side effect |
| `ensureDocumentDb(type)` | Look up DB ID from `notionDocDbIds`; if missing, POST `/api/document-db-create`, cache result. Race-protected by per-type promise cache. | type | dbId |
| `extractAndSave(toolUseInput)` | Receive Claude's `tool_use.input`, generate `Name` field, run dedup/confirm gates, POST `/api/document-save`. | input | `{ ok, badgeText, summary, recordIds? }` |
| `detectDuplicateCGM(records)` | CGM-only: call `/api/notion-search` + per-page `/api/notion-fetch`, find overlapping date ranges, prompt user with skip/new modal. | records | `'skip' | 'new'` |
| `confirmMedChange(records, summary)` | Modal with two buttons. | records, summary | boolean |
| `refreshAfterSave()` | Calls existing `loadData()` so other tabs see new data (where applicable for the daily-log DB). | — | UI refresh |

### 6.5 Data flow

```
User picks file
  → handleFileAttach()  [validate, base64, preview]
User hits Send
  → submitChat()
      → progressIndicator('reading')
      → apiFetch('/api/chat', { messages: [..., { role:'user', content: [document, text] }], tools: [SAVE_DOCUMENT_TOOL], system, model, max_tokens })
            → api/chat.js forwards to Anthropic (with tools)
            → Anthropic responds stop_reason='tool_use' + tool_use block(s)
      → progressIndicator('extracting')
      → for each tool_use → extractAndSave(input)
            → if doctor_notes && mentionsMedChange → confirmMedChange()
            → if cgm → detectDuplicateCGM()
            → ensureDocumentDb(type)
            → progressIndicator('saving')
            → apiFetch('/api/document-save', { database_id, type, records })
      → refreshAfterSave()
  → addSaveSummary() — green ✓ + Vietnamese summary
```

### 6.6 The `save_document` tool definition

A single Anthropic tool with a permissive record schema (all field names from §5 mapped, optional per type; type discriminator in `document_type`):

```json
{
  "name": "save_document",
  "description": "Extract structured health data from an attached medical document and save it to Bố Xuyên's patient profile. Identify the document type and call this tool. Do not call if you cannot identify the document.",
  "input_schema": {
    "type": "object",
    "required": ["document_type", "summary_vi", "records"],
    "properties": {
      "document_type": { "type": "string", "enum": ["cgm", "labs", "chemo", "doctor_notes"] },
      "summary_vi": { "type": "string" },
      "records": {
        "type": "array",
        "minItems": 1,
        "items": { "type": "object", "additionalProperties": true }
      }
    }
  }
}
```

Claude may emit multiple `tool_use` blocks if a single PDF mixes types (e.g. visit notes + labs). The client iterates and routes each.

If `stop_reason='end_turn'` with no tool call, Claude couldn't identify the document — its text reply is shown unchanged and nothing is saved.

### 6.7 System prompt changes

When a document is attached, `buildSystemPrompt()` appends a Vietnamese instruction block telling Claude: detect the type, call `save_document`, never invent values, always include `summary_vi`, allow multiple calls for multi-type documents, refuse if type is unclear.

## 7. Error handling

| Failure | UX |
|---|---|
| File > 32 MB or unsupported type (e.g. HEIC) | Toast, file rejected, no API call. |
| Anthropic rate-limit (429 from `/api/chat`) | Existing rate-limit error surfaces as chat message *"Quá nhiều yêu cầu..."*. |
| Claude couldn't classify | Vietnamese explanation in chat (Claude's own text), no save. |
| `/api/document-save` returns 500 | Chat shows *"Lỗi lưu Notion: ..."*; extracted data preserved in the chat thread for retry/copy. |
| `/api/document-db-create` fails | Same — shown in chat with error. |
| Notion integration not shared with parent page | `document-db-create` returns 404 from Notion; surface as a setup-help message. |
| Duplicate CGM range | Inline confirm modal: `Bỏ qua` / `Lưu thêm bản mới`. |
| Med change detected in doctor notes | Inline confirm modal: `Lưu` / `Bỏ qua`. |

## 8. One-time setup (caregiver)

Already-set env vars on Vercel: `NOTION_TOKEN`, `ANTHROPIC_API_KEY`, `APP_PASSWORD`. Add one new var:

1. In Notion, pick or create a parent page where the 4 document DBs should live (e.g. "Bố Xuyên — Health Documents").
2. Click `•••` on that page → `Connections` → add the existing "Bố Xuyên Health" integration.
3. Copy the page ID (32-char hex from the URL).
4. Vercel project → Settings → Environment Variables → add `NOTION_PARENT_PAGE_ID=<id>` to Production + Preview + Development.
5. Redeploy.

The 4 databases are then created automatically when you first upload a document of each type.

## 9. Token cost transparency

First time the user uploads any document in a session, the chat shows a one-time toast: *"Tài liệu sẽ được Claude đọc. Mỗi lần tải lên dùng nhiều token hơn câu hỏi văn bản."* No per-upload cost display in v1.

## 10. Out of scope

- Editing/deleting extracted records via chat (use Notion directly).
- Bulk historical import (>1 file at a time).
- Vietnamese cursive handwriting recognition (Claude vision can attempt, accuracy not guaranteed).
- Patient-facing access to the feature.
- Server-side caching of created DB IDs (client-side cache only; clearing browser data may cause a duplicate DB to be created in Notion).

## 11. Decisions log

- **Auto-save vs preview-then-confirm?** Auto-save, with confirm-only-for-med-changes exception.
- **Separate databases vs single flexible table?** Separate per type.
- **Browser-direct vs serverless backend?** Serverless (already in place; this spec extends it).
- **Parse JSON from text vs use Anthropic `tool_use`?** `tool_use` with strict schema.
- **PDF.js text extraction vs base64 to Claude?** Base64 to Claude (handles tables/charts uniformly, single code path for PDFs and images).
- **Stay on Notion vs move to Supabase?** Stay on Notion — family non-technical workflows depend on Notion's native UI; data volume is tiny.

## 12. Implementation order (high-level)

The implementation plan (next phase) will sequence:

1. Add `api/_document_schemas.js` with all 4 schemas.
2. Add `api/document-db-create.js` (and tests).
3. Add `api/document-save.js` (and tests).
4. Extend `api/chat.js` to forward `tools`.
5. Add paperclip UI + `handleFileAttach()` + preview bubble.
6. Add `SAVE_DOCUMENT_TOOL` definition + system-prompt extension.
7. Modify `submitChat()` / `callAnthropicAPI()` to send document blocks + tools.
8. Add `extractAndSave()` + `ensureDocumentDb()` + `refreshAfterSave()`.
9. Add `detectDuplicateCGM()` + `confirmMedChange()`.
10. Add staged progress indicator + one-time cost toast.
11. Deploy + end-to-end testing with real PDFs.
