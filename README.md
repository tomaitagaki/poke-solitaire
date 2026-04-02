# poke-solitaire

Poke Solitaire is now a web-first Journal for atomic Poke interactions.

The app treats each day as a single Solitaire board: vertical stacks of threads, tasks, and follow-ups, arranged so the day can be scanned, flipped, and revisited without losing shape.

Architecture

- Local Collector: a small macOS utility reads from ~/Library/Messages/chat.db and syncs into a local SQLite store.
- Web Dashboard: the primary interface is a Next.js/React app that renders daily boards, cards, and highlights.
- Local-first cache: the dashboard reads from the local store first and uses it as the source of truth for pages, stacks, and highlights.
- Cards design system: the UI stays card-based so the board reads like a tidy spread rather than a feed.

Journal model

- Each page represents a day.
- Each day is one board of vertical stacks.
- Each stack is a conversation or task with Poke.
- Users can flip through pages to move across days.
- Highlights and Bangers surfaces high-signal, successful, or especially meaningful interactions.

Temporal logic

- The 3:00 AM cutoff defines the day boundary.
- Messages before the cutoff belong to the previous day.
- Atomic threads are the smallest meaningful units.
- Spatial threads are the visual stacks created from those atomic units.
- Timestamps are a primary organizing force for grouping, splitting, and reconnecting threads across time gaps.

Current code layout

- shared/ — thread parsing, tempo scoring, and journal model types shared across surfaces
- collector/ — macOS sync utility for reading chat.db and populating the local store
- web/ — Next.js dashboard for Solitaire and Journal
- backend/ — report generation and local indexing helpers
- macos/ — legacy SwiftUI shell and supporting app code

Notes

- The web dashboard is the primary experience.
- The local Messages archive is the upstream source.
- OpenRouter is no longer the center of the architecture; the local store is.
