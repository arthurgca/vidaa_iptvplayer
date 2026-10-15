import { useEffect, useState } from 'preact/hooks';
import { activeLocaleTag } from '../i18n';
import { useTranslate } from '../i18n/I18nContext';
import { Focusable, useFocusManager } from '../navigation/FocusContext';

export function Spinner({ label }: { label?: string }) { const t = useTranslate(); return <div className="state-panel"><span className="spinner" />{label ?? t('common.loading')}</div>; }
export function Empty({ children }: { children: preact.ComponentChildren }) { return <div className="state-panel muted">{children}</div>; }
export function ErrorState({ error, retry }: { error: string; retry?: () => void }) {
  const t = useTranslate(); const focus = useFocusManager();
  useEffect(() => {
    const timer = window.setTimeout(() => { if (!focus.focus(focus.focused)) focus.focus('error:retry'); }, 50);
    return () => window.clearTimeout(timer);
  }, [error]);
  return <div className="state-panel error"><p>{error}</p>{retry && <Focusable focusKey="error:retry" group="errors" index={0} onSelect={retry}>{t('common.retry')}</Focusable>}</div>;
}
export function Image({ src, alt, className = '' }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState<string>();
  return src && failed !== src ? <img src={src} alt={alt} className={className} loading="lazy" decoding="async" onError={() => setFailed(src)} /> : <div className={`image-fallback ${className}`} aria-label={alt}>{alt.slice(0, 1).toUpperCase()}</div>;
}
export function Progress({ value }: { value: number }) { return <div className="progress"><span style={{ width: `${Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0}%` }} /></div>; }
export function formatTime(timestamp?: number, locale = activeLocaleTag()) { return timestamp ? new Date(timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : ''; }
