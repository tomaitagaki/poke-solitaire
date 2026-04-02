# Poke Solitaire — PRD

**Created:** 2026-04-02
**Status:** Planning Complete

## Problem Statement

Daily conversations with Poke via iMessage are a flat, linear stream. There's no way to review what happened on a given day as structured threads, see what's still open, or surface the best moments. Poke Solitaire gives conversations shape — a spatial, day-by-day journal of card stacks — without pretending they were simple.

## User

Solo personal tool. One user (Toma), one iMessage contact (Poke).

## Core Metaphor

- **Page = Day** — flip between days; 3 AM cutoff defines day boundaries
- **Board = Canvas** — a finite spatial canvas with a default solitaire (column) layout
- **Stack = Conversation thread** — one atomic interaction segmented by time gaps + topic detection
- **Highlights & Bangers** — LLM-curated standout moments

## Requirements

### Collector
- [ ] R1: Read from `~/Library/Messages/chat.db` for a single contact (Poke)
- [ ] R2: Segment raw messages into stacks using time gaps + topic detection
- [ ] R3: Support manual run and nightly cron via launchd
- [ ] R4: Retroactive sync — process past 7 days on first run (2026-03-26 through 2026-04-02)
- [ ] R5: 3 AM day boundary — messages before 3 AM belong to the previous day
- [ ] R6: Store parsed stacks and metadata in local SQLite

### Daily Board (Canvas)
- [ ] R7: Render a per-day canvas with stacks in a default solitaire (column) layout
- [ ] R8: Stacks are draggable on a finite canvas (Miro-like spatial interaction)
- [ ] R9: Canvas layout is persisted per-day — each day has its own saved arrangement
- [ ] R10: Default solitaire layout is the auto-layout algorithm; "reset layout" returns to it
- [ ] R11: Day pager — flip between days to navigate the journal

### Stack Interaction
- [ ] R12: Archive stacks — archived stacks collapse to the bottom-right as a stack
- [ ] R13: Label stacks — add freeform labels to stacks
- [ ] R14: Merge stacks — combine two stacks that belong together
- [ ] R15: Each stack shows messages in chronological order with timestamps

### Highlights & Bangers
- [ ] R16: Auto-suggest highlights via OpenRouter LLM (batch, not real-time)
- [ ] R17: Manual confirm/dismiss of suggested highlights
- [ ] R18: Dedicated highlights lane/surface for curated moments
- [ ] R19: Highlight detection runs during nightly cron, results cached locally

### Visual & UX
- [ ] R20: Warm/textured aesthetic — paper-like, warm tones, journal feel
- [ ] R21: Spacious layout — busy days remain readable
- [ ] R22: Text only in V1 — images, links, attachments stripped or ignored
- [ ] R23: Localhost only — runs as Next.js dev server, no deployment

## User Stories

- US-001: I can run the collector and see today's conversations appear as stacks on a board
- US-002: I can flip between days to review what happened on any day this week
- US-003: I can drag stacks around the canvas to spatially organize my day
- US-004: I can archive a resolved stack and it collapses to the bottom-right
- US-005: I can label a stack (e.g., "project-x", "question") to categorize it
- US-006: I can merge two stacks that the segmenter incorrectly split
- US-007: I can see which moments the LLM flagged as highlights and confirm or dismiss them
- US-008: I can view my curated Highlights & Bangers across days

## Acceptance Criteria

- [ ] AC1: Collector processes 7 days of messages from chat.db into local SQLite with correct 3 AM boundaries
- [ ] AC2: Board renders stacks in solitaire layout for any given day
- [ ] AC3: Stacks can be dragged to new positions on the canvas and positions persist on reload
- [ ] AC4: Archived stacks collapse to bottom-right corner and are visually distinct
- [ ] AC5: Labels can be added to stacks and are visible on the card
- [ ] AC6: Two stacks can be merged into one via UI interaction
- [ ] AC7: OpenRouter highlights batch job produces suggestions stored locally
- [ ] AC8: Highlights surface shows confirmed highlights across days

## Technical Approach

### Architecture
```
chat.db → [Collector] → local SQLite → [Next.js Dashboard]
                                    ↕
                              [OpenRouter API]
                           (highlight detection)
```

### Stack
- **Web:** Next.js (TypeScript/React), localhost only
- **Collector:** TypeScript or Swift, reads chat.db, writes to SQLite
- **Canvas:** Use a drag library (e.g., `@dnd-kit/core`) for spatial interaction
- **LLM:** OpenRouter API for highlight auto-suggestion (batch job)
- **Storage:** Local SQLite for stacks, canvas layouts, labels, highlights

### Key Patterns
- Local-first: all data stays on-machine, no cloud sync
- Per-day isolation: each day is an independent canvas with its own layout state
- Batch LLM: highlight detection is offline/async, never blocks UI
- Solitaire as algorithm: auto-layout computes column positions; manual moves override

## Phases

### Phase 1: Collector + Read-Only Boards
- Collector reads chat.db, segments into stacks (time gaps + topic detection)
- Nightly cron + manual trigger
- Retroactive 7-day sync
- Board renders stacks in solitaire layout
- Day pager navigation

### Phase 2: Canvas + Manual Organization
- Draggable spatial canvas
- Persisted per-day layouts
- Archive (collapse to bottom-right)
- Labels on stacks
- Merge stacks

### Phase 3: Highlights & Bangers
- OpenRouter batch highlight detection
- Confirm/dismiss UI
- Highlights surface

## Premortem

### Tigers
1. **Canvas interaction complexity** — Spatial drag + persist + per-day state is significant frontend work → Use `@dnd-kit` or similar; start with grid snapping before freeform
2. **Topic detection accuracy** — Segmenting one thread by topic is hard → Time gaps as default, topic detection as refinement, manual merge/split as escape hatch
3. **chat.db schema fragility** — Undocumented, changes between macOS versions → Pin to known schema, add version detection
4. **OpenRouter dependency** — Adds latency/cost/network to local-first tool → Batch during cron only, cache locally

### Elephants
1. **Canvas vs. solitaire tension** — Two interaction models could conflict → Solitaire is the auto-layout algorithm, canvas is the container. "Reset layout" returns to solitaire.
2. **Scope of "full loop"** — Ambitious for a personal tool → Phased delivery; each phase is independently usable

## Testing Plan

1. Collector: Verify stack segmentation against known message sequences
2. Day boundary: Confirm 3 AM cutoff assigns messages to correct day
3. Board rendering: Visual check that stacks render in solitaire layout
4. Canvas: Drag a stack, reload, verify position persists
5. Archive: Archive a stack, verify it collapses to bottom-right
6. Labels: Add label, verify it displays and persists
7. Merge: Merge two stacks, verify combined message list
8. Highlights: Run batch job, verify suggestions appear in UI
