import fs from 'node:fs/promises';
import path from 'node:path';
import { buildJournalDays, startOfJournalDay, type MessageRow } from '../shared/journal';

const DEFAULT_SNAPSHOT_PATH = path.join(
  process.env.HOME ?? process.cwd(),
  'Library',
  'Application Support',
  'PokeSolitaire',
  'journal-snapshot.json'
);

async function loadLocalMessages(): Promise<MessageRow[]> {
  const snapshotPath = process.env.POKE_LOCAL_SNAPSHOT_PATH ?? DEFAULT_SNAPSHOT_PATH;
  const content = await fs.readFile(path.resolve(snapshotPath), 'utf8');
  return JSON.parse(content) as MessageRow[];
}

export async function buildDailyReport() {
  const rows = await loadLocalMessages();
  const days = buildJournalDays(rows);
  const today = startOfJournalDay().toISOString().slice(0, 10);
  const currentDay = days.find((day) => day.dayKey === today) ?? days[days.length - 1] ?? null;

  return {
    generatedAt: new Date().toISOString(),
    currentDay,
    totalDays: days.length,
    days,
  };
}

async function main() {
  const report = await buildDailyReport();
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
