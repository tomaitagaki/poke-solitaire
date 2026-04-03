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

CORRECTIONS_PATH = os.path.expanduser(
    "~/Library/Application Support/PokeSolitaire/corrections.json"
)
OPTIMIZED_PROMPT_PATH = os.path.expanduser(
    "~/Library/Application Support/PokeSolitaire/optimized-clustering-prompt.txt"
)

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
    """Group records into rough clusters separated by time gaps (pre-LLM pass)."""
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


def _load_corrections() -> str:
    try:
        with open(CORRECTIONS_PATH) as f:
            corrections = json.load(f)
        if not corrections:
            return ""
        recent = corrections[-15:]
        lines = [f"- [{c['type']}] {c['detail']}" for c in recent]
        return "\n\nLEARNINGS FROM PAST USER CORRECTIONS (apply these):\n" + "\n".join(lines)
    except Exception:
        return ""


def _load_optimized_instructions() -> str:
    """Load GEPA/DSPy-optimized clustering instructions if available."""
    try:
        with open(OPTIMIZED_PROMPT_PATH) as f:
            instructions = f.read().strip()
        if instructions:
            return f"\n\nOPTIMIZED INSTRUCTIONS (from GEPA):\n{instructions}\n"
    except Exception:
        pass
    return ""


def cluster_by_topic(records: list[dict]) -> list[list[dict]]:
    """Use LLM to segment messages by topic. Falls back to time-gap clustering."""
    if not OPENROUTER_API_KEY or len(records) == 0:
        return cluster_by_time_gap(records)

    # Group by day first, then LLM-segment each day
    days: dict[str, list[dict]] = {}
    for rec in records:
        day = rec["sentAt"][:10]
        days.setdefault(day, []).append(rec)

    all_clusters: list[list[dict]] = []

    for day_key, day_records in sorted(days.items()):
        # For small days, time-gap is fine
        if len(day_records) <= 5:
            all_clusters.extend(cluster_by_time_gap(day_records))
            continue

        # Build numbered message list for LLM
        msg_lines = []
        for i, m in enumerate(day_records):
            time_str = m["sentAt"][11:16]
            text_preview = m["text"][:120].replace("\n", " ")
            msg_lines.append(f"{i}: [{time_str}] {m['sender']}: {text_preview}")

        corrections = _load_corrections()
        optimized = _load_optimized_instructions()

        prompt = f"""You are segmenting a day of messages between "me" and "poke" into distinct conversation topics.
{optimized}

Messages for {day_key} ({len(day_records)} total):
{chr(10).join(msg_lines)}

Group these message indices by topic. Each group should be ONE coherent topic — not two topics joined with "and".
Time gaps are a hint but topic shifts matter more. A rapid back-and-forth on one topic is one group even if it spans hours.
{corrections}
Return ONLY a JSON array of objects, each with:
- "indices": array of message index numbers belonging to this topic
- "title": short title (3-6 words, ONE topic, no "and")

Example: [{{"indices": [0,1,2], "title": "GitHub token renewal"}}, {{"indices": [3,4,5,6], "title": "Tweet draft feedback"}}]"""

        try:
            content = _call_openrouter(prompt, max_tokens=1024)
            cleaned = content.replace("```json", "").replace("```", "").strip()
            groups = json.loads(cleaned)

            if not isinstance(groups, list):
                raise ValueError("Expected array")

            for group in groups:
                indices = group.get("indices", [])
                title = str(group.get("title", ""))[:80]
                cluster_msgs = [day_records[i] for i in indices if 0 <= i < len(day_records)]
                if cluster_msgs:
                    for msg in cluster_msgs:
                        msg["subject"] = title
                    all_clusters.append(cluster_msgs)

            # Check for any orphaned messages not assigned to a group
            assigned = set()
            for group in groups:
                assigned.update(group.get("indices", []))
            orphans = [day_records[i] for i in range(len(day_records)) if i not in assigned]
            if orphans:
                # Fall back to time-gap for orphans
                all_clusters.extend(cluster_by_time_gap(orphans))

        except Exception as e:
            print(f"  Topic clustering failed for {day_key}: {e}, falling back to time-gap")
            all_clusters.extend(cluster_by_time_gap(day_records))

    return all_clusters


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

    # Cluster by topic (LLM) — assigns subject to each message
    print("Clustering by topic...")
    clusters = cluster_by_topic(records)

    # For clusters that don't have subjects yet (fallback path), generate titles
    untitled = [c for c in clusters if not c[0].get("subject")]
    if untitled:
        print(f"Generating titles for {len(untitled)} untitled clusters...")
        titles = generate_titles(untitled)
        for cluster, title in zip(untitled, titles):
            for msg in cluster:
                msg["subject"] = title

    os.makedirs(os.path.dirname(SNAPSHOT_PATH), exist_ok=True)
    with open(SNAPSHOT_PATH, "w") as f:
        json.dump(records, f, indent=2)

    print(f"Wrote {len(records)} messages to {SNAPSHOT_PATH}")
    for cluster in clusters:
        title = cluster[0].get("subject", "Untitled")
        print(f"  [{len(cluster):3d} msgs] {title}")


if __name__ == "__main__":
    main()
