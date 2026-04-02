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
};

type OpenRouterTopicResponse = {
  cards: Array<{
    topic: string;
    title: string;
    summary: string;
    state?: TopicCard['state'];
    sourceConversationIds: string[];
    labels?: string[];
  }>;
};

const DEFAULT_TIME_ZONE = process.env.POKE_TIME_ZONE ?? 'America/New_York';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.1-8b-instruct:free';
const THREE_AM = 3;

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

async function parseTopicsWithOpenRouter(conversations: PokeConversation[]): Promise<OpenRouterTopicResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required');
  }

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
          content:
            'You group Poke conversations into playful Solitaire cards. Cluster by topic, preserve the original daily context, and return only valid JSON with a cards array.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            timezone: DEFAULT_TIME_ZONE,
            instructions: [
              'Create one card per topic cluster.',
              'Each card should have topic, title, summary, optional state, sourceConversationIds, and optional labels.',
              'Prefer compact summaries that read well in a web dashboard.',
              'Use playful but readable language.',
            ],
            conversations,
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

    const interactionCount = sourceConversations.reduce((count, conversation) => count + conversation.messages.length, 0);
    const safeId = (card.topic + '-' + index).toLowerCase().replace(/[^a-z0-9]+/g, '-');

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
