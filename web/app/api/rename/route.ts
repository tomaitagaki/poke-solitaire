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
  const { oldTitle, newTitle } = await req.json();
  if (!oldTitle || !newTitle) {
    return NextResponse.json({ error: 'oldTitle and newTitle required' }, { status: 400 });
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

  let count = 0;
  for (const row of allRows) {
    if (row.subject === oldTitle) {
      row.subject = newTitle;
      count++;
    }
  }

  await fs.writeFile(snapshotPath, JSON.stringify(allRows, null, 2));

  // GEPA: log correction
  await logCorrection('rename', `User renamed cluster "${oldTitle}" → "${newTitle}". The new title better describes the topic.`);

  return NextResponse.json({ ok: true, renamed: count });
}
