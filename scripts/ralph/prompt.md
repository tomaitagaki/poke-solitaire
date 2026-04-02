# Ralph Agent Instructions

Work on ONE user story per iteration.

## Startup
1. Read `scripts/ralph/prd.json` - find first story where `passes: false`
2. Read `scripts/ralph/progress.txt` - understand context
3. `git log --oneline -5`

## Implement
1. Implement the ONE selected story
2. Build/compile: `cd web && npm run build`
3. **Verify using gstack-browser-use:**
   - Start dev server if not running: `cd web && npm run dev &`
   - Navigate to http://localhost:3000
   - Snapshot the page to see interactive elements
   - Interact per the story's testing procedure
   - Take screenshot for visual evidence

## Key Files
- `web/components/BoardView.tsx` — board layout, canvas container
- `web/components/CardStack.tsx` — individual stack cards
- `web/components/DayPager.tsx` — day navigation
- `web/app/page.tsx` — root page
- `web/app/globals.css` — warm/textured styling
- `web/lib/local-store.ts` — data loading
- `shared/journal.ts` — journal model types (JournalCard, JournalDay, Tempo)

## Design Guidelines
- Warm/textured aesthetic: paper-like, warm tones (#f6f1e8 bg, #1f1d1a text)
- Card-based design system
- Spacious, journal-like feel
- Text only — no image/attachment rendering
- localStorage for client-side persistence (layouts, labels, archives, merges)

## Complete
1. If verification passes:
   - Mark `passes: true` in prd.json
   - Update progress.txt
   - `git add -A && git commit -m "feat(US-XXX): [title]"`
2. If fails: debug and retry (max 3 attempts)
3. If stuck: output `BLOCKED: [reason]`

## Stop Condition
All stories pass → output `<promise>COMPLETE</promise>`
