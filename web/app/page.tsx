import { buildJournalDays } from '../../shared/journal';
import { loadLocalJournalDays } from '../lib/local-store';
import { BoardView } from '../components/BoardView';

export default async function Page() {
  const days = await loadLocalJournalDays();
  const currentDay = days[days.length - 1];
  const highlights = currentDay?.cards.filter((card) => card.state === 'archived' || card.tempo.label === 'bursty').slice(0, 3) ?? [];

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">Poke Solitaire / Journal</p>
        <h1>Flip through days. Read the stacks. Keep the shape of the conversation.</h1>
        <p className="hero__copy">
          The local Messages archive feeds a local store, and the web dashboard turns that store into daily Solitaire boards.
        </p>
      </header>

      {currentDay ? <BoardView day={currentDay} /> : <p>No journal data yet.</p>}

      <section className="highlights">
        <header className="highlights__header">
          <p className="eyebrow">Highlights and Bangers</p>
          <h2>High-signal interactions</h2>
        </header>
        <div className="highlights__grid">
          {highlights.length ? (
            highlights.map((card) => (
              <article className="highlight-card" key={card.id}>
                <h3>{card.title}</h3>
                <p>{card.summary}</p>
              </article>
            ))
          ) : (
            <p>No highlights yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
