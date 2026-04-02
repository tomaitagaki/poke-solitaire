import { DayPager } from '../components/DayPager';
import { HighlightsView } from '../components/HighlightsView';
import { loadLocalJournalDays, loadHighlights } from '../lib/local-store';

export default async function Page() {
  const [days, highlights] = await Promise.all([loadLocalJournalDays(), loadHighlights()]);

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">Poke Solitaire / Journal</p>
        <h1>Flip through days. Read the stacks. Keep the shape of the conversation.</h1>
        <p className="hero__copy">
          The local Messages archive feeds a local store, and the web dashboard turns that store into daily Solitaire boards.
        </p>
      </header>

      <DayPager days={days} />

      <HighlightsView days={days} suggestions={highlights.suggestions} />
    </main>
  );
}
