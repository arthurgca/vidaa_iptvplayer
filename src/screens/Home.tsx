import { Focusable } from '../navigation/FocusContext';
import { DpadIcon, HomeIcon } from '../components/icons';

const cards = [
  ['live', 'Live TV', 'Broadcast'], ['movies', 'Movies', 'Cinema'], ['series', 'Series', 'Episodes'],
  ['favorites', 'Favorites', 'Your library'], ['recent', 'Recently Watched', 'Continue'], ['settings', 'Settings', 'Provider & playback']
] as const;

export function Home({ open }: { open: (route: string) => void }) {
  return <main className="screen home-screen">
    <header className="topbar"><div><span className="eyebrow">VIDAA IPTV</span><h1>What do you want to watch?</h1></div><span className="clock">TV</span></header>
    <div className="home-grid">
      {cards.map(([route, title, subtitle], index) => <Focusable key={route} focusKey={`home:${route}`} group="home" index={index} columns={3} orientation="grid" onSelect={() => open(route)} className="home-card">
        <span className="home-icon"><HomeIcon name={route} /></span><span><strong>{title}</strong><small>{subtitle}</small></span>
      </Focusable>)}
    </div>
    <footer className="key-hint"><kbd className="dpad-key"><DpadIcon /></kbd> Navigate <kbd>OK</kbd> Select <kbd>Back</kbd> Exit</footer>
  </main>;
}
