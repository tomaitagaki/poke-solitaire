import { DayPager } from '../components/DayPager';
import { HighlightsView } from '../components/HighlightsView';
import { loadLocalJournalDays, loadHighlights } from '../lib/local-store';

export default async function Page() {
  const [days, highlights] = await Promise.all([loadLocalJournalDays(), loadHighlights()]);

  return (
    <main className="shell">
      <header className="hero">
        <h1>Poke Solitaire</h1>
      </header>

      <DayPager days={days} />

      <HighlightsView days={days} suggestions={highlights.suggestions} />
    </main>
  );
}
