import type { TranslationKey } from '../i18n';
import { useTranslate } from '../i18n/I18nContext';
import { DpadIcon } from './icons';

const paths = {
  ok: 'M12 16l3 3 6-7',
  back: 'M13 7 5 15l8 8M5 15h14a8 8 0 0 1 8 8',
  up: 'm8 20 8-8 8 8',
  left: 'm20 8-8 8 8 8',
  right: 'm12 8 8 8-8 8',
  vertical: 'm10 12 6-6 6 6m-6-6v20m-6-6 6 6 6-6',
  page: 'M7 4h18M7 28h18m-16-15 7-6 7 6m-14 6 7 6 7-6'
} as const;
type RemoteKey = keyof typeof paths | 'arrows';

/** Decorative SVGs plus localized accessible names, independent of TV glyph coverage. */
export function RemoteButton({ name }: { name: RemoteKey }) {
  const t = useTranslate();
  return <kbd className="remote-key" role="img" aria-label={t(`remote.${name}`)}>
    {name === 'arrows' ? <DpadIcon /> : <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {name === 'ok' && <circle cx="16" cy="16" r="12" />}
      <path d={paths[name]} />
    </svg>}
  </kbd>;
}

/** Keep icon placement in the translation so action wording/order stays localized. */
export function RemoteHint({ id }: { id: TranslationKey }) {
  const t = useTranslate();
  return <>{t(id).split(/(\{key_(?:ok|back|up|left|right|vertical|page|arrows)\})/g).map((part, index) =>
    part.startsWith('{key_') ? <RemoteButton key={index} name={part.slice(5, -1) as RemoteKey} /> : part
  )}</>;
}
