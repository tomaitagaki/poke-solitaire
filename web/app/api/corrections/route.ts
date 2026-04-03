import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type Correction = {
  type: 'split' | 'merge' | 'rename';
  timestamp: string;
  detail: string;
};

const CORRECTIONS_PATH = path.join(
  os.homedir(),
  'Library/Application Support/PokeSolitaire/corrections.json',
);

async function loadCorrections(): Promise<Correction[]> {
  try {
    const content = await fs.readFile(CORRECTIONS_PATH, 'utf8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function saveCorrections(corrections: Correction[]) {
  await fs.mkdir(path.dirname(CORRECTIONS_PATH), { recursive: true });
  await fs.writeFile(CORRECTIONS_PATH, JSON.stringify(corrections, null, 2));
}

export async function GET() {
  const corrections = await loadCorrections();
  return NextResponse.json(corrections);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, detail } = body;
  if (!type || !detail) {
    return NextResponse.json({ error: 'type and detail required' }, { status: 400 });
  }

  const corrections = await loadCorrections();
  corrections.push({
    type,
    timestamp: new Date().toISOString(),
    detail,
  });

  // Keep last 50 corrections to avoid unbounded growth
  const trimmed = corrections.slice(-50);
  await saveCorrections(trimmed);

  return NextResponse.json({ ok: true, count: trimmed.length });
}
