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
