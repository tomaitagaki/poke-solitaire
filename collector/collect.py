#!/usr/bin/env python3
"""Collect messages from chat.db for a single contact, write journal-snapshot.json."""

import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone

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

APPLE_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)


def extract_text(attributed_body: bytes | None, text: str | None) -> str:
    """Extract plain text from message. Prefer text column, fall back to attributedBody."""
    if text:
        return text
    if not attributed_body:
        return ""
    try:
        # typedstream: find the text payload after the \x01+<length> marker
        # Pattern: 0x01 0x2B (<length bytes>) <UTF-8 text> 0x86 ...
        # The text block starts after \x01+ and length prefix, ends before \x86 or \x06
        idx = attributed_body.find(b'\x01\x2b')
        if idx < 0:
            return ""
        # Skip \x01\x2b and the length byte(s)
        start = idx + 2
        # The next byte(s) are length encoding; skip them
        # If high bit set, multi-byte length; otherwise single byte
        if start >= len(attributed_body):
            return ""
        length_byte = attributed_body[start]
        if length_byte & 0x80:
            # Multi-byte: skip 2 length bytes
            start += 2
        else:
            start += 1
        # Some messages have an additional control byte
        if start < len(attributed_body) and attributed_body[start] < 0x20:
            start += 1
        # Find end of text: look for \x86 or \x06 markers
        end = len(attributed_body)
        for marker in [b'\x86', b'\x06']:
            pos = attributed_body.find(marker, start)
            if pos > start:
                end = min(end, pos)
        raw_text = attributed_body[start:end]
        decoded = raw_text.decode('utf-8', errors='ignore').strip()
        return decoded
    except Exception:
        pass
    return ""


def main():
    db_path = os.path.expanduser("~/Library/Messages/chat.db")
    if not os.path.exists(db_path):
        print(f"chat.db not found at {db_path}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row

    # Calculate cutoff: DAYS_BACK days ago in Apple nanoseconds
    from datetime import timedelta
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
        # macOS timestamp: nanoseconds since 2001-01-01
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

    os.makedirs(os.path.dirname(SNAPSHOT_PATH), exist_ok=True)
    with open(SNAPSHOT_PATH, "w") as f:
        json.dump(records, f, indent=2)

    print(f"Wrote {len(records)} messages to {SNAPSHOT_PATH}")


if __name__ == "__main__":
    main()
