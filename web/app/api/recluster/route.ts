import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { MessageRow } from '../../../../shared/journal';

const CORRECTIONS_PATH = path.join(
  os.homedir(),
  'Library/Application Support/PokeSolitaire/corrections.json',
);

async function loadCorrections(): Promise<string> {
  try {
    const raw = await fs.readFile(CORRECTIONS_PATH, 'utf8');
    const corrections = JSON.parse(raw) as Array<{ type: string; detail: string }>;
    if (corrections.length === 0) return '';
    const recent = corrections.slice(-15);
    return '\n\nLEARNINGS FROM PAST USER CORRECTIONS (apply these):\n' +
      recent.map((c) => `- [${c.type}] ${c.detail}`).join('\n');
  } catch {
    return '';
  }
}

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

async function callOpenRouter(prompt: string): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY not set');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-001',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

export async function POST(req: NextRequest) {
  const { dayKey } = await req.json();
  if (!dayKey) return NextResponse.json({ error: 'dayKey required' }, { status: 400 });

  const snapshotPath = expandHome(
    process.env.POKE_LOCAL_SNAPSHOT_PATH ?? '~/Library/Application Support/PokeSolitaire/journal-snapshot.json'
  );

  let allRows: MessageRow[];
  try {
    const content = await fs.readFile(snapshotPath, 'utf8');
    allRows = JSON.parse(content);
  } catch {
    return NextResponse.json({ error: 'Could not read snapshot' }, { status: 500 });
  }

  // Find messages for this day (using 3AM cutoff logic)
  const dayMessages = allRows.filter((row) => {
    const d = new Date(row.sentAt);
    const cutoff = new Date(d);
    cutoff.setUTCHours(3, 0, 0, 0);
    if (d < cutoff) cutoff.setUTCDate(cutoff.getUTCDate() - 1);
    return cutoff.toISOString().slice(0, 10) === dayKey;
  });

  if (dayMessages.length === 0) {
    return NextResponse.json({ error: 'No messages for this day' }, { status: 404 });
  }

  // Build prompt
  const msgLines = dayMessages.map((m, i) => {
    const time = m.sentAt.slice(11, 16);
    const text = m.text.slice(0, 120).replace(/\n/g, ' ');
    return `${i}: [${time}] ${m.sender ?? 'me'}: ${text}`;
  });

  const corrections = await loadCorrections();

  const prompt = `You are segmenting a day of messages between "me" and "poke" into distinct conversation topics.

Messages for ${dayKey} (${dayMessages.length} total):
${msgLines.join('\n')}

Group these message indices by topic. Each group should be ONE coherent topic — not two topics joined with "and".
Time gaps are a hint but topic shifts matter more.
${corrections}
Return ONLY a JSON array of objects, each with:
- "indices": array of message index numbers belonging to this topic
- "title": short title (3-6 words, ONE topic, no "and")`;

  try {
    const content = await callOpenRouter(prompt);
    const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const groups = JSON.parse(cleaned) as Array<{ indices: number[]; title: string }>;

    // Apply titles to messages
    const assigned = new Set<number>();
    for (const group of groups) {
      const title = String(group.title).slice(0, 80);
      for (const idx of group.indices) {
        if (idx >= 0 && idx < dayMessages.length) {
          dayMessages[idx].subject = title;
          assigned.add(idx);
        }
      }
    }

    // Write back
    await fs.writeFile(snapshotPath, JSON.stringify(allRows, null, 2));

    return NextResponse.json({
      ok: true,
      clusters: groups.length,
      messages: dayMessages.length,
    });
  } catch (e) {
    return NextResponse.json({ error: `Clustering failed: ${e}` }, { status: 500 });
  }
}
