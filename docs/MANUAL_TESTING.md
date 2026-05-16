# Manual Testing Checklist

Run on a Vercel preview deploy (push to a non-master branch) OR `npx vercel dev`.

## Task 5: file attachment UI

- [ ] **PDF attach.** Click 📎, choose a PDF. Green bubble appears with filename + size + "PDF" label.
- [ ] **Image attach.** Same, but with PNG/JPG. Label says "Hình ảnh".
- [ ] **Remove (✕).** Click ✕ — bubble disappears.
- [ ] **Size > 32MB rejected.** Try a large file. Red toast; no bubble.
- [ ] **HEIC rejected.** Try a .heic. Red toast about format.

## Task 6: end-to-end document ingest

> Prerequisite: `NOTION_PARENT_PAGE_ID` env var set on the Vercel preview, and the Notion integration is shared with that parent page.

- [ ] **Text-only chat still works.** Send a text message in chat — normal AI reply appears.
- [ ] **Lab PDF ingest.** Attach a simple lab report PDF, send. Watch progress: "Đang đọc..." → "Đang trích xuất..." → "Đang lưu...". Green ✓ badge appears with Vietnamese summary. Notion: a new "Blood Tests & Lab Results" DB exists under your parent page, populated with N rows.
- [ ] **CGM PDF ingest.** Same flow with a FreeStyle Libre report. CGM DB created, one row with period dates + averages.
- [ ] **Image ingest.** Attach a JPG/PNG of any health doc. Same flow.
- [ ] **Non-medical doc.** Attach a recipe PDF or similar. Claude should explain in Vietnamese it cannot identify, and NOT create any Notion rows.
- [ ] **First-upload cost toast.** First doc upload in a fresh browser shows the token cost toast once. Refresh and upload again — toast does NOT reappear (localStorage flag set).

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

## Task 8: Deploy setup

### One-time Notion setup
1. Create (or pick) a Notion page to hold the 4 document DBs — e.g. "Bố Xuyên — Health Documents".
2. Open the page → `•••` → **Connections** → add the existing "Bố Xuyên Health" integration.
3. Copy the 32-character page ID from the URL (the hex string after the last `/` and before any `?`).

### Vercel env var
4. Vercel dashboard → project → **Settings → Environment Variables**.
5. Add `NOTION_PARENT_PAGE_ID = <page-id>` for **Production**, **Preview**, and **Development**.

### Deploy
6. Push to `master` — Vercel auto-deploys to https://bo-xuyen-health.vercel.app.
7. Log in → Chat tab → attach a lab PDF → confirm a "Blood Tests & Lab Results" DB appears under your parent page.
