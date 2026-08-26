import { useEffect, useState } from 'preact/hooks';
import { Focusable } from '../navigation/FocusContext';
import { formatTime } from '../components/common';
import { DpadIcon, HomeIcon } from '../components/icons';
import { useTranslate } from '../i18n/I18nContext';

const cards = ['live', 'movies', 'series', 'favorites', 'recent', 'settings'] as const;

/** A wall clock is what every TV home screen puts in this corner; it re-renders often enough to stay on the minute. */
function Clock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(timer); }, []);
  return <span className="clock">{formatTime(now)}</span>;
}

export function Home({ open }: { open: (route: string) => void }) {
  const t = useTranslate();
  return <main className="screen home-screen">
    <header className="topbar"><div><span className="eyebrow">VIDAA IPTV</span><h1>{t('home.title')}</h1></div><Clock /></header>
    <div className="home-grid">
      {cards.map((route, index) => <Focusable key={route} focusKey={`home:${route}`} group="home" index={index} columns={3} orientation="grid" onSelect={() => open(route)} className="home-card">
        <span className="home-icon"><HomeIcon name={route} /></span><span><strong>{t(`home.card.${route}`)}</strong><small>{t(`home.card.${route}.subtitle`)}</small></span>
      </Focusable>)}
    </div>
    <footer className="key-hint"><kbd className="dpad-key"><DpadIcon /></kbd> {t('home.hint.navigate')} <kbd>OK</kbd> {t('home.hint.select')} <kbd>{t('common.back')}</kbd> {t('home.hint.exit')}</footer>
  </main>;
}
