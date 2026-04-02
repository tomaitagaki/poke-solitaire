export type MessageRow = {
  id: string;
  threadId?: string;
  conversationId?: string;
  subject?: string;
  text: string;
  sentAt: string;
  sender?: string;
  recipients?: string[];
};

export type Tempo = {
  label: 'slow' | 'steady' | 'rapid' | 'bursty';
  avgGapMinutes: number | null;
  spanMinutes: number;
  messageCount: number;
};

export type JournalState = 'active' | 'pinned' | 'deferred' | 'archived';

export type JournalCard = {
  id: string;
  topic: string;
  title: string;
  summary: string;
  state: JournalState;
  messageIds: string[];
  messages: MessageRow[];
  sourceConversationIds: string[];
  interactionCount: number;
  labels: string[];
  tempo: Tempo;
  dayKey: string;
};

export type JournalDay = {
  dayKey: string;
  cutoffIso: string;
  cards: JournalCard[];
};

export const THREE_AM_HOUR = 3;
export const DEFAULT_CUTOFF_MINUTES = THREE_AM_HOUR * 60;

export function startOfJournalDay(input = new Date()): Date {
  const cutoff = new Date(input);
  cutoff.setHours(THREE_AM_HOUR, 0, 0, 0);
  if (input < cutoff) {
    cutoff.setDate(cutoff.getDate() - 1);
  }
  return cutoff;
}

export function dayKeyForDate(date: Date): string {
  const cutoff = startOfJournalDay(date);
  return cutoff.toISOString().slice(0, 10);
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function topicFromRow(row: MessageRow): string {
  if (row.subject?.trim()) return normalizeText(row.subject);
  if (row.conversationId?.trim()) return `Conversation ${row.conversationId}`;
  if (row.threadId?.trim()) return `Thread ${row.threadId}`;
  return 'Untitled stack';
}

function makeCardId(topic: string, dayKey: string, index: number): string {
  return `${dayKey}-${topic}-${index}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function computeTempo(messages: MessageRow[]): Tempo {
  const times = messages
    .map((message) => Date.parse(message.sentAt))
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => a - b);

  if (times.length === 0) {
    return {
      label: 'slow',
      avgGapMinutes: null,
      spanMinutes: 0,
      messageCount: messages.length,
    };
  }

  const spanMinutes = Math.max(0, (times[times.length - 1] - times[0]) / 60000);

  if (times.length === 1) {
    return {
      label: 'slow',
      avgGapMinutes: null,
      spanMinutes: Number(spanMinutes.toFixed(1)),
      messageCount: messages.length,
    };
  }

  const gaps = [] as number[];
  for (let index = 1; index < times.length; index += 1) {
    gaps.push((times[index] - times[index - 1]) / 60000);
  }

  const avgGapMinutes = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  const bursty = gaps.some((gap) => gap <= 5) && spanMinutes <= 45;

  let label: Tempo['label'];
  if (bursty) {
    label = 'bursty';
  } else if (avgGapMinutes <= 15) {
    label = 'rapid';
  } else if (avgGapMinutes <= 60) {
    label = 'steady';
  } else {
    label = 'slow';
  }

  return {
    label,
    avgGapMinutes: Number(avgGapMinutes.toFixed(1)),
    spanMinutes: Number(spanMinutes.toFixed(1)),
    messageCount: messages.length,
  };
}

export function clusterMessagesIntoCards(rows: MessageRow[]): JournalCard[] {
  const byDay = new Map<string, MessageRow[]>();

  for (const row of rows) {
    const sentAt = new Date(row.sentAt);
    const dayKey = dayKeyForDate(sentAt);
    const existing = byDay.get(dayKey) ?? [];
    existing.push(row);
    byDay.set(dayKey, existing);
  }

  return Array.from(byDay.entries()).flatMap(([dayKey, dayRows]) => {
    const sorted = [...dayRows].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
    const threads = new Map<string, MessageRow[]>();
    const looseRows: MessageRow[] = [];

    for (const row of sorted) {
      const key = row.threadId ?? row.conversationId;
      if (!key) {
        looseRows.push(row);
        continue;
      }
      const existing = threads.get(key) ?? [];
      existing.push(row);
      threads.set(key, existing);
    }

    const grouped: MessageRow[][] = [...threads.values()];

    if (looseRows.length) {
      let currentGroup: MessageRow[] = [];
      for (const row of looseRows) {
        const last = currentGroup[currentGroup.length - 1];
        const gapMinutes = last ? (Date.parse(row.sentAt) - Date.parse(last.sentAt)) / 60000 : 0;
        if (!currentGroup.length || gapMinutes <= 45) {
          currentGroup.push(row);
        } else {
          grouped.push(currentGroup);
          currentGroup = [row];
        }
      }
      if (currentGroup.length) grouped.push(currentGroup);
    }

    return grouped.map((group, index) => {
      const topic = topicFromRow(group[0]);
      const tempo = computeTempo(group);
      const state: JournalState =
        tempo.label === 'slow' && group.length <= 1
          ? 'deferred'
          : tempo.label === 'bursty' || tempo.label === 'rapid'
          ? 'active'
          : 'pinned';
      const messagesText = group.map((row) => row.text).join(' ');
      const summary = messagesText.length > 180 ? `${normalizeText(messagesText).slice(0, 177)}...` : normalizeText(messagesText);

      return {
        id: makeCardId(topic, dayKey, index),
        topic,
        title: topic,
        summary: summary || 'No summary yet.',
        state,
        messageIds: group.map((row) => row.id),
        messages: group,
        sourceConversationIds: Array.from(new Set(group.map((row) => row.conversationId ?? row.threadId ?? row.id))),
        interactionCount: group.length,
        labels: ['cards', 'journal', state],
        tempo,
        dayKey,
      };
    });
  });
}

export function buildJournalDays(rows: MessageRow[]): JournalDay[] {
  const cards = clusterMessagesIntoCards(rows);
  const byDay = new Map<string, JournalCard[]>();

  for (const card of cards) {
    const existing = byDay.get(card.dayKey) ?? [];
    existing.push(card);
    byDay.set(card.dayKey, existing);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, dayCards]) => ({
      dayKey,
      cutoffIso: new Date(`${dayKey}T03:00:00.000Z`).toISOString(),
      cards: dayCards.sort((a, b) => a.title.localeCompare(b.title)),
    }));
}
