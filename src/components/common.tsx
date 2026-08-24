import { useState } from 'preact/hooks';

export function Spinner({ label = 'Loading…' }: { label?: string }) { return <div className="state-panel"><span className="spinner" />{label}</div>; }
export function Empty({ children }: { children: preact.ComponentChildren }) { return <div className="state-panel muted">{children}</div>; }
export function ErrorState({ error, retry }: { error: string; retry?: () => void }) { return <div className="state-panel error"><p>{error}</p>{retry && <button onClick={retry}>Retry</button>}</div>; }
export function Image({ src, alt, className = '' }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? <img src={src} alt={alt} className={className} loading="lazy" onError={() => setFailed(true)} /> : <div className={`image-fallback ${className}`} aria-label={alt}>{alt.slice(0, 1).toUpperCase()}</div>;
}
export function Progress({ value }: { value: number }) { return <div className="progress"><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>; }
export function formatTime(timestamp?: number) { return timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''; }
