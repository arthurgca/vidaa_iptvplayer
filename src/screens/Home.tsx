import { Focusable } from '../navigation/FocusContext';
import { DpadIcon, HomeIcon } from '../components/icons';
import { useTranslate } from '../i18n/I18nContext';

const cards = ['live', 'movies', 'series', 'favorites', 'recent', 'settings'] as const;

export function Home({ open }: { open: (route: string) => void }) {
  const t = useTranslate();
  return <main className="screen home-screen">
    <header className="topbar"><div><span className="eyebrow">VIDAA IPTV</span><h1>{t('home.title')}</h1></div><span className="clock">TV</span></header>
    <div className="home-grid">
      {cards.map((route, index) => <Focusable key={route} focusKey={`home:${route}`} group="home" index={index} columns={3} orientation="grid" onSelect={() => open(route)} className="home-card">
        <span className="home-icon"><HomeIcon name={route} /></span><span><strong>{t(`home.card.${route}`)}</strong><small>{t(`home.card.${route}.subtitle`)}</small></span>
      </Focusable>)}
    </div>
    <footer className="key-hint"><kbd className="dpad-key"><DpadIcon /></kbd> {t('home.hint.navigate')} <kbd>OK</kbd> {t('home.hint.select')} <kbd>{t('common.back')}</kbd> {t('home.hint.exit')}</footer>
  </main>;
}
