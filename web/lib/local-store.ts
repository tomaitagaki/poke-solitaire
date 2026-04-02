import fs from 'node:fs/promises';
import path from 'node:path';
import { buildJournalDays, type JournalDay, type MessageRow } from '../../shared/journal';

export type HighlightSuggestion = {
  cardId: string;
  dayKey: string;
  reason: string;
};

export type HighlightsData = {
  generatedAt: string;
  suggestions: HighlightSuggestion[];
};

const SAMPLE_ROWS: MessageRow[] = [
  {
    id: 'sample-1',
    conversationId: 'travel-1',
    subject: 'Flight to Seattle',
    text: 'Confirmed the flight and sent the receipt.',
    sentAt: new Date().toISOString(),
  },
  {
    id: 'sample-2',
    conversationId: 'travel-1',
    subject: 'Flight to Seattle',
    text: 'Updated the seat and added the new itinerary note.',
    sentAt: new Date(Date.now() + 600000).toISOString(),
  },
  {
    id: 'sample-3',
    conversationId: 'finance-2',
    subject: 'Expense reimbursement',
    text: 'The reimbursement thread is complete and archived.',
    sentAt: new Date().toISOString(),
  },
];

export async function loadLocalJournalDays(): Promise<JournalDay[]> {
  const snapshotPath = process.env.POKE_LOCAL_SNAPSHOT_PATH;
  if (!snapshotPath) {
    return buildJournalDays(SAMPLE_ROWS);
  }

  try {
    const absolutePath = path.resolve(snapshotPath);
    const content = await fs.readFile(absolutePath, 'utf8');
    const rows = JSON.parse(content) as MessageRow[];
    return buildJournalDays(rows);
  } catch {
    return buildJournalDays(SAMPLE_ROWS);
  }
}

export async function loadHighlights(): Promise<HighlightsData> {
  const highlightsPath = process.env.POKE_HIGHLIGHTS_PATH;
  if (!highlightsPath) {
    return { generatedAt: '', suggestions: [] };
  }

  try {
    const absolutePath = path.resolve(highlightsPath);
    const content = await fs.readFile(absolutePath, 'utf8');
    return JSON.parse(content) as HighlightsData;
  } catch {
    return { generatedAt: '', suggestions: [] };
  }
}
