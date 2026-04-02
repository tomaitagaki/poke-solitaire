#!/usr/bin/env python3
"""Collect messages from chat.db for a single contact, write journal-snapshot.json.

Groups messages into time-gap clusters (45 min) and generates short titles
for each cluster via OpenRouter (Gemini Flash).
"""

import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timedelta, timezone

CHAT_IDENTIFIER = os.environ.get("POKE_CHAT_ID", "")
if not CHAT_IDENTIFIER:
    print("Set POKE_CHAT_ID env var to the iMessage chat identifier for Poke", file=sys.stderr)
    sys.exit(1)
DAYS_BACK = int(os.environ.get("POKE_DAYS_BACK", "7"))
SNAPSHOT_PATH = os.path.expanduser(
    os.environ.get(
        "POKE_LOCAL_SNAPSHOT_PATH",
        "~/Library/Application Support/PokeSolitaire/journal-snapshot.json",
    )
)
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
TIME_GAP_MINUTES = 45

APPLE_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)


def extract_text(attributed_body: bytes | None, text: str | None) -> str:
    """Extract plain text from message. Prefer text column, fall back to attributedBody."""
    if text:
        return text
    if not attributed_body:
        return ""
    try:
        idx = attributed_body.find(b'\x01\x2b')
        if idx < 0:
            return ""
        start = idx + 2
        if start >= len(attributed_body):
            return ""
        length_byte = attributed_body[start]
        if length_byte & 0x80:
            start += 2
        else:
            start += 1
        if start < len(attributed_body) and attributed_body[start] < 0x20:
            start += 1
        end = len(attributed_body)
        for marker in [b'\x86', b'\x06']:
            pos = attributed_body.find(marker, start)
            if pos > start:
                end = min(end, pos)
        raw_text = attributed_body[start:end]
        return raw_text.decode('utf-8', errors='ignore').strip()
    except Exception:
        pass
    return ""


def cluster_by_time_gap(records: list[dict], gap_minutes: int = TIME_GAP_MINUTES) -> list[list[dict]]:
    """Group records into clusters separated by time gaps."""
    if not records:
        return []
    clusters: list[list[dict]] = []
    current: list[dict] = [records[0]]
    for rec in records[1:]:
        prev_time = datetime.fromisoformat(current[-1]["sentAt"])
        curr_time = datetime.fromisoformat(rec["sentAt"])
        if (curr_time - prev_time).total_seconds() > gap_minutes * 60:
            clusters.append(current)
            current = [rec]
        else:
            current.append(rec)
    if current:
        clusters.append(current)
    return clusters


def _call_openrouter(prompt: str, max_tokens: int = 512) -> str:
    import urllib.request
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps({
            "model": "google/gemini-2.0-flash-001",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
        }).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    return data["choices"][0]["message"]["content"]


def _describe_cluster(cluster: list[dict], index: int) -> str:
    msgs = []
    for m in cluster[:10]:
        msgs.append(f"  [{m['sender']}]: {m['text'][:150]}")
    return f"Cluster {index+1} ({len(cluster)} msgs):\n" + "\n".join(msgs)


def generate_titles(clusters: list[list[dict]]) -> list[str]:
    """Generate short titles for each cluster via OpenRouter, in batches."""
    if not OPENROUTER_API_KEY:
        print("  No OPENROUTER_API_KEY — using first-message fallback for titles")
        return [c[0]["text"].split("\n")[0][:60] for c in clusters]

    BATCH_SIZE = 10
    all_titles: list[str] = []

    for batch_start in range(0, len(clusters), BATCH_SIZE):
        batch = clusters[batch_start:batch_start + BATCH_SIZE]
        descriptions = [_describe_cluster(c, batch_start + i) for i, c in enumerate(batch)]

        prompt = f"""Generate a short title (3-7 words) for each conversation cluster.
Capture the main topic — like a subject line. Be specific, not generic.
Return ONLY a JSON array of {len(batch)} strings. No other text.

{chr(10).join(descriptions)}"""

        try:
            content = _call_openrouter(prompt)
            cleaned = content.replace("```json", "").replace("```", "").strip()
            titles = json.loads(cleaned)
            if isinstance(titles, list) and len(titles) == len(batch):
                all_titles.extend(str(t)[:80] for t in titles)
                continue
            print(f"  Batch {batch_start//BATCH_SIZE}: count mismatch, using fallback")
        except Exception as e:
            print(f"  Batch {batch_start//BATCH_SIZE} failed: {e}, using fallback")

        all_titles.extend(c[0]["text"].split("\n")[0][:60] for c in batch)

    return all_titles


def main():
    db_path = os.path.expanduser("~/Library/Messages/chat.db")
    if not os.path.exists(db_path):
        print(f"chat.db not found at {db_path}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=DAYS_BACK)
    cutoff_ns = int((cutoff.timestamp() - APPLE_EPOCH.timestamp()) * 1_000_000_000)

    cursor = conn.execute("""
        SELECT
            message.ROWID as rowid,
            message.guid,
            chat.chat_identifier,
            message.text,
            message.attributedBody,
            message.date as date_raw,
            message.is_from_me,
            handle.id as handle_id,
            chat.display_name
        FROM message
        JOIN chat_message_join ON chat_message_join.message_id = message.ROWID
        JOIN chat ON chat.ROWID = chat_message_join.chat_id
        LEFT JOIN handle ON handle.ROWID = message.handle_id
        WHERE chat.chat_identifier = ?
          AND message.date >= ?
        ORDER BY message.date ASC
    """, (CHAT_IDENTIFIER, cutoff_ns))

    records = []
    for row in cursor:
        text = extract_text(row["attributedBody"], row["text"])
        if not text.strip():
            continue

        date_raw = row["date_raw"]
        if date_raw and date_raw > 0:
            ts = APPLE_EPOCH.timestamp() + (date_raw / 1_000_000_000)
            sent_at = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        else:
            continue

        sender = "me" if row["is_from_me"] else "poke"

        records.append({
            "id": f"{row['rowid']}-{row['guid']}",
            "threadId": None,
            "conversationId": None,
            "subject": None,
            "text": text,
            "sentAt": sent_at,
            "sender": sender,
            "recipients": [],
        })

    conn.close()
    print(f"Read {len(records)} messages")

    # Cluster by time gaps and generate titles
    clusters = cluster_by_time_gap(records)
    print(f"Formed {len(clusters)} clusters, generating titles...")
    titles = generate_titles(clusters)

    # Assign titles back as subject on each message in the cluster
    for cluster, title in zip(clusters, titles):
        for msg in cluster:
            msg["subject"] = title

    os.makedirs(os.path.dirname(SNAPSHOT_PATH), exist_ok=True)
    with open(SNAPSHOT_PATH, "w") as f:
        json.dump(records, f, indent=2)

    print(f"Wrote {len(records)} messages to {SNAPSHOT_PATH}")
    for i, (cluster, title) in enumerate(zip(clusters, titles)):
        print(f"  [{len(cluster):3d} msgs] {title}")


if __name__ == "__main__":
    main()
