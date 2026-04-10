import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { MessageRow } from '../../../../shared/journal';

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

const CORRECTIONS_PATH = path.join(
  os.homedir(),
  'Library/Application Support/PokeSolitaire/corrections.json',
);

async function logCorrection(type: string, detail: string) {
  let corrections = [];
  try {
    corrections = JSON.parse(await fs.readFile(CORRECTIONS_PATH, 'utf8'));
  } catch {}
  corrections.push({ type, timestamp: new Date().toISOString(), detail });
  await fs.writeFile(CORRECTIONS_PATH, JSON.stringify(corrections.slice(-50), null, 2));
}

export async function POST(req: NextRequest) {
  const { cardId, messageIds } = await req.json();
  if (!cardId || !messageIds?.length) {
    return NextResponse.json({ error: 'cardId and messageIds required' }, { status: 400 });
  }

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

  const firstMsg = allRows.find((r) => r.id === messageIds[0]);
  if (!firstMsg?.subject) {
    return NextResponse.json({ error: 'Message not found or has no subject' }, { status: 404 });
  }

  // Strip any existing "(split)" suffixes to avoid stacking
  const originalSubject = firstMsg.subject.replace(/\s*\(split\)\s*/g, '').trim();
  const splitTexts = messageIds.map((id: string) => {
    const row = allRows.find((r) => r.id === id);
    return row?.text?.slice(0, 80) ?? '';
  }).filter(Boolean);

  const splitIds = new Set(messageIds as string[]);
  const newSubject = `${originalSubject} (split)`;

  let count = 0;
  for (const row of allRows) {
    if (splitIds.has(row.id)) {
      row.subject = newSubject;
      count++;
    }
  }

  await fs.writeFile(snapshotPath, JSON.stringify(allRows, null, 2));

  // GEPA: log correction
  await logCorrection('split', `User split ${count} message(s) out of "${originalSubject}". The removed messages were: ${splitTexts.join(' | ')}. These did not belong to the "${originalSubject}" topic.`);

  return NextResponse.json({ ok: true, splitCount: count, newSubject });
}
