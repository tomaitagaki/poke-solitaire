import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function POST() {
  const collectorDir = path.resolve(process.cwd(), '..', 'collector');
  const env = {
    ...process.env,
    POKE_CHAT_ID: process.env.POKE_CHAT_ID ?? '',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? '',
    POKE_LOCAL_SNAPSHOT_PATH: process.env.POKE_LOCAL_SNAPSHOT_PATH ?? '',
  };

  try {
    const { stdout, stderr } = await exec('python3', ['collect.py'], {
      cwd: collectorDir,
      env,
      timeout: 120_000,
    });

    const output = (stdout + '\n' + stderr).trim();
    return NextResponse.json({ ok: true, output });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message, stderr: e.stderr },
      { status: 500 },
    );
  }
}
