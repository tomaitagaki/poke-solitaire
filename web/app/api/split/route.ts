import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { MessageRow } from '../../../../shared/journal';

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

export async function POST(req: NextRequest) {
  const { cardId, splitAtMessageId } = await req.json();
  if (!cardId || !splitAtMessageId) {
    return NextResponse.json({ error: 'cardId and splitAtMessageId required' }, { status: 400 });
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

  // Find messages belonging to this card's subject group
  // The card ID is derived from subject + dayKey, so we need to find messages
  // that share the same subject and fall on the same day
  const splitMessage = allRows.find((r) => r.id === splitAtMessageId);
  if (!splitMessage) {
    return NextResponse.json({ error: 'Split message not found' }, { status: 404 });
  }

  const subject = splitMessage.subject;
  if (!subject) {
    return NextResponse.json({ error: 'Message has no subject to split' }, { status: 400 });
  }

  // Find all messages with this subject, sorted by time
  const groupMessages = allRows
    .filter((r) => r.subject === subject)
    .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));

  const splitIndex = groupMessages.findIndex((r) => r.id === splitAtMessageId);
  if (splitIndex <= 0) {
    return NextResponse.json({ error: 'Cannot split at first message' }, { status: 400 });
  }

  // Messages after the split point get a new subject
  const newSubject = `${subject} (split)`;
  const afterIds = new Set(groupMessages.slice(splitIndex).map((r) => r.id));

  for (const row of allRows) {
    if (afterIds.has(row.id)) {
      row.subject = newSubject;
    }
  }

  await fs.writeFile(snapshotPath, JSON.stringify(allRows, null, 2));

  return NextResponse.json({
    ok: true,
    originalCount: splitIndex,
    splitCount: groupMessages.length - splitIndex,
    newSubject,
  });
}
