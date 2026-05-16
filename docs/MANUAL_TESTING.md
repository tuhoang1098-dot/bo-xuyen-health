# Manual Testing Checklist

Run on a Vercel preview deploy (push to a non-master branch) OR `npx vercel dev`.

## Task 5: file attachment UI

- [ ] **PDF attach.** Click 📎, choose a PDF. Green bubble appears with filename + size + "PDF" label.
- [ ] **Image attach.** Same, but with PNG/JPG. Label says "Hình ảnh".
- [ ] **Remove (✕).** Click ✕ — bubble disappears.
- [ ] **Size > 32MB rejected.** Try a large file. Red toast; no bubble.
- [ ] **HEIC rejected.** Try a .heic. Red toast about format.
