# Poke Solitaire V1 — Interactive Spatial Journal

**Branch:** `feat/poke-solitaire-v1`
**Date:** 2026-04-09
**Stats:** 34 files changed, 4454 insertions(+), 149 deletions(-)

## Summary

Full V1 of the web-first journal that turns iMessage conversations with Poke into spatial card stacks on a draggable canvas, with LLM topic clustering and GEPA-powered prompt optimization.

## Collector & Data Pipeline

- Python collector reads macOS `chat.db` filtered to a single contact (`POKE_CHAT_ID`)
- Parses `attributedBody` typedstream binary for text extraction
- LLM topic clustering per day via Gemini Flash (topic > time gaps)
- LLM-generated 3-6 word single-topic titles
- 3 AM journal day boundary, 7-day default lookback

## Spatial Canvas

- `@dnd-kit` draggable cards with solitaire column default layout
- Per-day positions persisted in localStorage
- Z-index by recency (most recently touched on top)
- Drag-and-drop merge with custom dialog + glow highlight
- Cards clamped to canvas bounds
- Flex layout: pager fills viewport, canvas fills pager

## Card Interactions

- Click to expand with CSS grid animated collapse/expand (0fr to 1fr)
- Chat-style message bubbles (poke=left, me=right)
- Cherry-pick split: select mode with dots, extract selected messages
- Inline title rename (double-click)
- Archive to dedicated zone below canvas
- Freeform label chips

## GEPA Improvement Loop

- Split/merge/rename corrections logged as diagnostic feedback
- Corrections injected into LLM clustering prompt on next run
- DSPy GEPA optimizer evolves the prompt using corrections as training signal
- "GEPA" button triggers optimization (30 eval calls via Gemini Flash)

## UI/UX

- Warm journal aesthetic, paper-like textures
- Page-flip animation with blur (250ms ease-out-quart)
- Card-fan message entrance (staggered translateY)
- FittedText auto-shrinks titles/summaries
- Shadow borders, antialiased fonts, tabular-nums
- `prefers-reduced-motion` support
- Edge-to-edge layout, overscroll disabled

## API Routes

- `POST /api/collect` — re-ingest from Messages
- `POST /api/recluster` — re-cluster current day
- `POST /api/split` — cherry-pick messages out of cluster
- `POST /api/rename` — rename cluster title
- `POST /api/corrections` — log user corrections
- `POST /api/optimize` — run GEPA/DSPy optimization
