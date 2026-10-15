import { useEffect, useState } from 'preact/hooks';
import { Image, Progress } from './common';
import { Focusable, useFocusManager } from '../navigation/FocusContext';

export interface MediaCard {
  key: string; title: string; subtitle?: string; image?: string; progress?: number; contain?: boolean;
  select: () => void;
}
export interface MediaRow { id: string; title: string; cards: MediaCard[] }

/** Explicit neighbors keep off-screen cards and row boundaries predictable on a D-pad. */
export function MediaRows({ rows, scope, top, bottom, left, highlight }: {
  rows: MediaRow[]; scope: string; top: string; bottom?: string[]; left?: string;
  highlight?: (card: MediaCard) => void;
}) {
  const [memory, setMemory] = useState<Record<string, number>>({});
  const focus = useFocusManager();
  useEffect(() => {
    // Independently loaded Home rows can insert above a card someone is already browsing.
    if (rows.some((row) => row.cards.some((card) => card.key === focus.focused))) focus.focus(focus.focused);
  }, [rows.map((row) => row.id).join('|')]);
  const target = (row: MediaRow | undefined, index: number) => row?.cards[Math.min(memory[row.id] ?? index, row.cards.length - 1)]?.key;
  return <div className="media-rows poster-grid" data-scroll-key={`${scope}:rows`}>
    {rows.map((row, r) => <section className="media-row" key={row.id} aria-label={row.title}>
      <div className="row-heading"><h2>{row.title}</h2><span>{row.cards.length}</span></div>
      <div className="artwork-track" data-scroll-key={`${scope}:row:${row.id}`}>
        {row.cards.map((card, i) => <Focusable key={card.key} focusKey={card.key} group={`${scope}-shelf:${row.id}`} index={i} orientation="horizontal"
          neighbors={{ left: row.cards[i - 1]?.key || left || card.key, right: row.cards[i + 1]?.key || card.key,
            up: target(rows[r - 1], i) || top, down: target(rows[r + 1], i) || bottom || card.key }}
          onFocus={() => { setMemory((value) => value[row.id] === i ? value : { ...value, [row.id]: i }); highlight?.(card); }}
          onSelect={card.select} className={`poster-card artwork-card${card.progress !== undefined ? ' resume-card' : ''}${card.contain ? ' logo-card' : ''}`} title={card.title}>
          <div className="artwork-frame"><Image src={card.image} alt={card.title} className="poster" />
            {card.progress !== undefined && <span className="resume-glyph" aria-hidden="true">▶</span>}
            <div className="artwork-caption"><strong>{card.title}</strong><small>{card.subtitle || '\u00a0'}</small></div>
          </div>
          {card.progress !== undefined && <Progress value={card.progress} />}
        </Focusable>)}
      </div>
    </section>)}
  </div>;
}
