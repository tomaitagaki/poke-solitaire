import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { MessageRow } from '../../../../shared/journal';

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
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

  // Find subject of the first message to split
  const firstMsg = allRows.find((r) => r.id === messageIds[0]);
  if (!firstMsg?.subject) {
    return NextResponse.json({ error: 'Message not found or has no subject' }, { status: 404 });
  }

  const splitIds = new Set(messageIds as string[]);
  const newSubject = `${firstMsg.subject} (split)`;

  let count = 0;
  for (const row of allRows) {
    if (splitIds.has(row.id)) {
      row.subject = newSubject;
      count++;
    }
  }

  await fs.writeFile(snapshotPath, JSON.stringify(allRows, null, 2));

  return NextResponse.json({ ok: true, splitCount: count, newSubject });
}
