import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function POST() {
  const collectorDir = path.resolve(process.cwd(), '..', 'collector');
  const venvPython = path.join(os.homedir(), 'Library/Application Support/PokeSolitaire/.venv/bin/python3');

  try {
    const { stdout, stderr } = await exec(venvPython, ['optimize_clustering.py'], {
      cwd: collectorDir,
      env: {
        ...process.env,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? '',
        POKE_LOCAL_SNAPSHOT_PATH: process.env.POKE_LOCAL_SNAPSHOT_PATH ?? '',
      },
      timeout: 300_000, // 5 min — optimization takes time
    });

    const output = (stdout + '\n' + stderr).trim();
    return NextResponse.json({ ok: true, output });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message, stdout: e.stdout, stderr: e.stderr },
      { status: 500 },
    );
  }
}
