import fs from 'node:fs/promises';
import path from 'node:path';
import { buildJournalDays, type MessageRow } from '../shared/journal';

const SNAPSHOT_PATH = path.resolve(
  process.env.POKE_LOCAL_SNAPSHOT_PATH ??
    path.join(process.env.HOME ?? '', 'Library/Application Support/PokeSolitaire/journal-snapshot.json'),
);

const HIGHLIGHTS_PATH = path.resolve(
  process.env.POKE_HIGHLIGHTS_PATH ??
    path.join(process.env.HOME ?? '', 'Library/Application Support/PokeSolitaire/highlights.json'),
);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

type HighlightSuggestion = {
  cardId: string;
  dayKey: string;
  reason: string;
};

type HighlightsFile = {
  generatedAt: string;
  suggestions: HighlightSuggestion[];
};

async function callOpenRouter(prompt: string): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not set');
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function main() {
  console.log('Loading journal snapshot...');
  let rows: MessageRow[];
  try {
    const content = await fs.readFile(SNAPSHOT_PATH, 'utf8');
    rows = JSON.parse(content) as MessageRow[];
  } catch (err) {
    console.error(`Failed to read snapshot at ${SNAPSHOT_PATH}:`, err);
    process.exit(1);
  }

  const days = buildJournalDays(rows);
  console.log(`Found ${days.length} days with ${days.reduce((n, d) => n + d.cards.length, 0)} total stacks`);

  const allSuggestions: HighlightSuggestion[] = [];

  for (const day of days) {
    if (day.cards.length === 0) continue;

    const stackDescriptions = day.cards.map((card) => {
      const msgs = card.messages.map((m) => `  [${m.sentAt}] ${m.sender ?? 'me'}: ${m.text}`).join('\n');
      return `Stack "${card.title}" (id: ${card.id}, tempo: ${card.tempo.label}, ${card.tempo.messageCount} msgs):\n${msgs}`;
    }).join('\n\n');

    const prompt = `You are analyzing a day's worth of conversation stacks from a personal journal. Your job is to identify the "highlights and bangers" — moments that are especially cool, useful, insightful, viral-worthy, or delightful.

Day: ${day.dayKey}

${stackDescriptions}

Identify 0-3 stacks that qualify as highlights. For each, return a JSON array of objects with "cardId" and "reason" fields. The reason should be a short, punchy explanation of why this is a highlight. If none qualify, return an empty array.

Return ONLY the JSON array, no other text.`;

    try {
      console.log(`Analyzing ${day.dayKey} (${day.cards.length} stacks)...`);
      const response = await callOpenRouter(prompt);
      const cleaned = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const suggestions = JSON.parse(cleaned) as Array<{ cardId: string; reason: string }>;

      for (const s of suggestions) {
        allSuggestions.push({ cardId: s.cardId, dayKey: day.dayKey, reason: s.reason });
      }
    } catch (err) {
      console.error(`Failed to analyze ${day.dayKey}:`, err);
    }
  }

  const output: HighlightsFile = {
    generatedAt: new Date().toISOString(),
    suggestions: allSuggestions,
  };

  await fs.mkdir(path.dirname(HIGHLIGHTS_PATH), { recursive: true });
  await fs.writeFile(HIGHLIGHTS_PATH, JSON.stringify(output, null, 2));
  console.log(`Wrote ${allSuggestions.length} suggestions to ${HIGHLIGHTS_PATH}`);
}

main();
