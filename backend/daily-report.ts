type PokeMessage = {
  id: string;
  role: string;
  text: string;
  sentAt: string;
};

type PokeConversation = {
  id: string;
  subject?: string;
  topicHint?: string;
  messages: PokeMessage[];
};

type Tempo = {
  label: 'slow' | 'steady' | 'rapid' | 'bursty';
  avgGapMinutes: number | null;
  spanMinutes: number;
  messageCount: number;
};

type TopicCard = {
  kind: 'card';
  id: string;
  topic: string;
  title: string;
  summary: string;
  state: 'active' | 'pinned' | 'deferred' | 'archived';
  sourceConversationIds: string[];
  interactionCount: number;
  labels: string[];
  tempo: Tempo;
};

type OpenRouterTopicResponse = {
  cards: Array<{
    topic: string;
    title: string;
    summary: string;
    state?: TopicCard['state'];
    sourceConversationIds: string[];
    labels?: string[];
    tempo?: Partial<Tempo>;
  }>;
};

const DEFAULT_TIME_ZONE = process.env.POKE_TIME_ZONE ?? 'America/New_York';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.1-8b-instruct:free';
const THREE_AM = 3;

const SYSTEM_PROMPT = [
  'You are a thread-untangling parser for Poke. Treat timestamps as a primary signal, not a minor hint.',
  'Your job is to convert noisy, non-linear conversation history into tidy Solitaire stacks.',
  'Atomic unit: a thread/task. A single message block may contain multiple atomic threads if the text shifts topic, intent, recipient, or time context.',
  'Use timestamps to split, merge, and sequence discussion. Related items may reappear after time gaps; rejoin them when the semantic thread is clearly the same.',
  'Detect context shifts such as a new request, a completion, a new recipient, a new date range, or a reply that changes subject.',
  'Classify each thread as open or done. Done threads are archivable: the work is complete, confirmed, or closed out. Open threads still need follow-up, waiting, or unresolved action.',
  'Respect the 3:00 AM cutoff. Anything at or after the cutoff belongs to today. Anything before it belongs to yesterday. If a conversation straddles the cutoff, split the timeline by timestamp and cluster each side separately when needed.',
  'Prefer smaller, accurate stacks over one oversized stack that mixes unrelated timing or intent.',
  'Return only valid JSON.',
].join(' ');

function startOfPokeDay(now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setHours(THREE_AM, 0, 0, 0);
  if (now < cutoff) {
    cutoff.setDate(cutoff.getDate() - 1);
  }
  return cutoff;
}

async function fetchPokeConversationsSince(cutoffIso: string): Promise<PokeConversation[]> {
  const baseUrl = process.env.POKE_CONVERSATIONS_URL;
  if (!baseUrl) {
    throw new Error('POKE_CONVERSATIONS_URL is required');
  }

  const response = await fetch(baseUrl + '?since=' + encodeURIComponent(cutoffIso), {
    headers: {
      Authorization: process.env.POKE_API_TOKEN ? 'Bearer ' + process.env.POKE_API_TOKEN : '',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Poke conversations: ' + response.status + ' ' + response.statusText);
  }

  return (await response.json()) as PokeConversation[];
}

function flattenTimestamps(conversations: PokeConversation[]): number[] {
  return conversations.flatMap((conversation) =>
    conversation.messages
      .map((message) => Date.parse(message.sentAt))
      .filter((time) => Number.isFinite(time))
  );
}

function computeTempo(messages: PokeMessage[]): Tempo {
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
      spanMinutes,
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

async function parseTopicsWithOpenRouter(conversations: PokeConversation[]): Promise<OpenRouterTopicResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required');
  }

  const cutoffIso = startOfPokeDay().toISOString();
  const conversationTimes = flattenTimestamps(conversations);
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/tomaitagaki/poke-solitaire',
      'X-Title': 'poke-solitaire',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: JSON.stringify({
            timezone: DEFAULT_TIME_ZONE,
            cutoffIso,
            groupingRules: [
              'Use timestamps to detect when a thread starts, pauses, resumes, and ends.',
              'If a message block contains multiple intents or topic jumps, split it into multiple atomic threads.',
              'Cluster messages across time gaps when the topic, participants, or task continuity clearly match.',
              'Mark a stack as archived when the thread appears complete, confirmed, closed, or safely handed off.',
              'Mark a stack as active when follow-up is still expected or the outcome is unresolved.',
            ],
            conversations,
            conversationTimes,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error('OpenRouter request failed: ' + response.status + ' ' + response.statusText);
  }

  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('OpenRouter response was missing card content');
  }

  return JSON.parse(text) as OpenRouterTopicResponse;
}

function formatCardsForDashboard(parsed: OpenRouterTopicResponse, conversations: PokeConversation[]): TopicCard[] {
  const byConversationId = new Map(conversations.map((conversation) => [conversation.id, conversation]));

  return parsed.cards.map((card, index) => {
    const sourceConversations = card.sourceConversationIds
      .map((conversationId) => byConversationId.get(conversationId))
      .filter((conversation): conversation is PokeConversation => Boolean(conversation));

    const allMessages = sourceConversations.flatMap((conversation) => conversation.messages);
    const interactionCount = allMessages.length;
    const safeId = (card.topic + '-' + index).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const tempo = card.tempo ?? computeTempo(allMessages);

    return {
      kind: 'card',
      id: safeId,
      topic: card.topic,
      title: card.title,
      summary: card.summary,
      state: card.state ?? 'active',
      sourceConversationIds: card.sourceConversationIds,
      interactionCount,
      labels: card.labels ?? ['solitaire', 'daily-report'],
      tempo,
    };
  });
}

export async function buildDailyCards() {
  const cutoff = startOfPokeDay();
  const conversations = await fetchPokeConversationsSince(cutoff.toISOString());
  const parsed = await parseTopicsWithOpenRouter(conversations);
  const cards = formatCardsForDashboard(parsed, conversations);

  return {
    cutoff: cutoff.toISOString(),
    timezone: DEFAULT_TIME_ZONE,
    cards,
  };
}

async function main() {
  const report = await buildDailyCards();
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
