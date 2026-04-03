#!/usr/bin/env python3
"""
GEPA-powered clustering prompt optimization.

Uses past user corrections (splits, merges, renames) as training signal
to evolve the clustering prompt via DSPy's GEPA optimizer.

Usage:
  source ~/Library/Application\ Support/PokeSolitaire/.venv/bin/activate
  OPENROUTER_API_KEY=... python optimize_clustering.py
"""

import json
import os
import sys

import dspy

CORRECTIONS_PATH = os.path.expanduser(
    "~/Library/Application Support/PokeSolitaire/corrections.json"
)
SNAPSHOT_PATH = os.path.expanduser(
    os.environ.get(
        "POKE_LOCAL_SNAPSHOT_PATH",
        "~/Library/Application Support/PokeSolitaire/journal-snapshot.json",
    )
)
OPTIMIZED_PROMPT_PATH = os.path.expanduser(
    "~/Library/Application Support/PokeSolitaire/optimized-clustering-prompt.txt"
)
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")


# ── DSPy Signature ──

class ClusterMessages(dspy.Signature):
    """Segment messages into distinct conversation topic clusters."""

    messages: str = dspy.InputField(desc="Numbered message list for one day")
    corrections: str = dspy.InputField(desc="Past user corrections to learn from")
    clusters: str = dspy.OutputField(desc="JSON array of {indices, title} objects. ONE topic per group, no 'and'. Titles 3-6 words.")


# ── DSPy Module ──

class MessageClusterer(dspy.Module):
    def __init__(self):
        self.cluster = dspy.ChainOfThought(ClusterMessages)

    def forward(self, messages: str, corrections: str) -> dspy.Prediction:
        return self.cluster(messages=messages, corrections=corrections)


# ── Metric ──

def clustering_metric(example, prediction, trace=None) -> float:
    """Score clustering against known corrections. Higher = fewer corrections needed."""
    try:
        cleaned = prediction.clusters.replace("```json", "").replace("```", "").strip()
        clusters = json.loads(cleaned)

        if not isinstance(clusters, list) or len(clusters) == 0:
            return 0.0

        corrections = json.loads(example.corrections) if example.corrections else []

        score = 1.0
        penalty = 0.1

        for correction in corrections:
            detail = correction.get("detail", "").lower()
            ctype = correction.get("type", "")

            if ctype == "split":
                for c in clusters:
                    if " and " in c.get("title", "").lower():
                        score -= penalty

            elif ctype == "rename":
                if "\u2192" in detail:
                    parts = detail.split("\u2192")
                    if len(parts) >= 2:
                        old = parts[0].split('"')[-2] if '"' in parts[0] else ""
                        for c in clusters:
                            if c.get("title", "").lower().strip() == old.lower().strip():
                                score -= penalty

        # Coverage bonus
        all_indices = set()
        for c in clusters:
            all_indices.update(c.get("indices", []))
        total_msgs = example.messages.count("\n") + 1
        coverage = len(all_indices) / max(total_msgs, 1)
        score *= min(coverage, 1.0)

        return max(0.0, min(1.0, score))
    except Exception:
        return 0.0


# ── Build training data ──

def build_trainset() -> list[dspy.Example]:
    try:
        with open(SNAPSHOT_PATH) as f:
            rows = json.load(f)
    except Exception:
        print("No snapshot found")
        return []

    try:
        with open(CORRECTIONS_PATH) as f:
            corrections = json.load(f)
    except Exception:
        corrections = []

    if len(corrections) < 3:
        print(f"Only {len(corrections)} corrections — need at least 3 for optimization")
        return []

    days: dict[str, list] = {}
    for r in rows:
        day = r["sentAt"][:10]
        days.setdefault(day, []).append(r)

    examples = []
    corrections_str = json.dumps(corrections)

    for day_key, day_rows in sorted(days.items()):
        if len(day_rows) < 3:
            continue

        msg_lines = []
        for i, m in enumerate(day_rows[:50]):
            time_str = m["sentAt"][11:16]
            text = m["text"][:120].replace("\n", " ")
            msg_lines.append(f"{i}: [{time_str}] {m.get('sender', 'me')}: {text}")

        examples.append(
            dspy.Example(
                messages="\n".join(msg_lines),
                corrections=corrections_str,
            ).with_inputs("messages", "corrections")
        )

    return examples


# ── Main ──

def main():
    if not OPENROUTER_API_KEY:
        print("Set OPENROUTER_API_KEY")
        sys.exit(1)

    lm = dspy.LM(
        model="openrouter/google/gemini-2.0-flash-001",
        api_key=OPENROUTER_API_KEY,
        api_base="https://openrouter.ai/api/v1",
    )
    dspy.configure(lm=lm)

    trainset = build_trainset()
    if len(trainset) < 3:
        print("Not enough data to optimize. Collect more corrections first.")
        sys.exit(0)

    split = max(2, len(trainset) * 3 // 4)
    train = trainset[:split]
    val = trainset[split:] or train[-1:]

    print(f"Training on {len(train)} days, validating on {len(val)} days")
    print(f"Using {len(json.loads(train[0].corrections))} corrections as signal")

    student = MessageClusterer()

    try:
        optimizer = dspy.GEPA(
            metric=clustering_metric,
            max_metric_calls=30,
        )
        optimized = optimizer.compile(
            student=student,
            trainset=train,
            valset=val,
        )

        save_path = OPTIMIZED_PROMPT_PATH.replace(".txt", ".json")
        optimized.save(save_path)
        print(f"Optimized program saved to {save_path}")

        # Extract readable instructions
        try:
            instructions = optimized.cluster.signature.instructions
            if instructions:
                with open(OPTIMIZED_PROMPT_PATH, 'w') as f:
                    f.write(str(instructions))
                print(f"Instructions saved to {OPTIMIZED_PROMPT_PATH}")
                print(f"\n{str(instructions)[:500]}")
        except Exception:
            pass

    except Exception as e:
        print(f"Optimization failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
