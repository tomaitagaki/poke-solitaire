import { DayPager } from '../components/DayPager';
import { loadLocalJournalDays } from '../lib/local-store';

export default async function Page() {
  const days = await loadLocalJournalDays();

  return (
    <main className="shell">
      <header className="hero">
        <h1>Poke Solitaire</h1>
      </header>

      <DayPager days={days} />
    </main>
  );
}
