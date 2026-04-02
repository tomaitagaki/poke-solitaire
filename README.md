# poke-solitaire

Solitaire is a playful thread visualizer for Poke.

It turns atomic Poke interactions into vertical stacks grouped by topic. Each stack is a little card tower:

- new interactions land in the active stack for their topic
- completed stacks archive themselves
- unfinished stacks can be pinned or deferred for later

The goal is to keep the interface card-first and easy to scan, so the backend emits card-shaped payloads and the macOS app renders those same objects natively.

## Daily report flow

1. Fetch the day’s Poke conversations using a 3:00 AM cutoff.
2. Send the conversations to OpenRouter with a free model.
3. Ask the model to cluster messages by topic and summarize them as cards.
4. Render the cards in the dashboard as vertical Solitaire stacks.

## Repo layout

- backend/daily-report.ts — daily topic parsing + card formatting
- macos/ — SwiftUI app shell for the dashboard
- README.md — project map and vibe check

## Environment

The backend script expects these environment variables:

- POKE_CONVERSATIONS_URL
- POKE_API_TOKEN
- OPENROUTER_API_KEY
- OPENROUTER_MODEL
- POKE_TIME_ZONE

The default model is intentionally left configurable so you can swap in any free OpenRouter model you like.
