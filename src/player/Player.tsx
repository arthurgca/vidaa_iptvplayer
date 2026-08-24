import type HlsType from 'hls.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/client';
import { formatTime, Image, Progress } from '../components/common';
import type { RemoteAction } from '../platform/remote';
import type { Channel, Episode, EpgNow, MediaKind, SeriesItem, VodItem } from '../types';

export interface Playable {
  type: MediaKind; id: string; item: Channel | VodItem | Episode; extension?: string;
  channels?: Channel[]; series?: SeriesItem; resumeAt?: number;
}

export function Player({ media, registerAction, close }: { media: Playable; registerAction: (handler: ((action: RemoteAction) => boolean) | null) => void; close: () => void }) {
  const video = useRef<HTMLVideoElement>(null); const hls = useRef<HlsType>(); const hideTimer = useRef<number>();
  const [overlay, setOverlay] = useState(true); const [mini, setMini] = useState(false); const [miniIndex, setMiniIndex] = useState(0);
  const [active, setActive] = useState(media); const [epg, setEpg] = useState<EpgNow>(); const [state, setState] = useState<'loading'|'playing'|'paused'|'error'>('loading');
  const channels = active.channels || [];
  const start = async () => {
    const element = video.current; if (!element) return;
    setState('loading'); hls.current?.destroy(); hls.current = undefined;
    const url = api.playUrl(active.type, active.id, active.extension);
    const isHls = active.extension === 'm3u8' || (active.type === 'live' && url.includes('ext=m3u8'));
    if (isHls && !element.canPlayType('application/vnd.apple.mpegurl')) {
      const Hls = (await import('hls.js')).default;
      if (!Hls.isSupported()) { setState('error'); return; }
      const instance = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 30 }); hls.current = instance;
      instance.loadSource(url); instance.attachMedia(element);
      instance.on(Hls.Events.MANIFEST_PARSED, () => void element.play().catch(() => setState('error')));
      instance.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) setState('error'); });
    } else { element.src = url; void element.play().catch(() => setState('error')); }
  };
  const show = () => { setOverlay(true); window.clearTimeout(hideTimer.current); hideTimer.current = window.setTimeout(() => setOverlay(false), 4500); };
  const switchChannel = (index: number) => {
    const channel = channels[(index + channels.length) % channels.length]; if (!channel) return;
    setActive({ type: 'live', id: channel.id, item: channel, extension: channel.extension, channels }); setMiniIndex((index + channels.length) % channels.length); setMini(false); show();
  };
  useEffect(() => { void start(); }, [active.id]);
  useEffect(() => { if (active.type === 'live') api.epg(active.id).then(setEpg).catch(() => setEpg(undefined)); }, [active.id]);
  useEffect(() => { const index = channels.findIndex((channel) => channel.id === active.id); if (index >= 0) setMiniIndex(index); }, [active.id]);
  useEffect(() => {
    const timeout = window.setTimeout(() => { if (state === 'loading') setState('error'); }, 18_000); return () => window.clearTimeout(timeout);
  }, [active.id, state]);
  useEffect(() => {
    registerAction((action) => {
      const element = video.current;
      if (action === 'BACK') { if (mini) { setMini(false); return true; } if (overlay) { setOverlay(false); return true; } return false; }
      if (action === 'SELECT') { if (state === 'error') { void start(); return true; } if (mini) { switchChannel(miniIndex); return true; } overlay ? setOverlay(false) : show(); return true; }
      if (action === 'NAV_LEFT' && active.type === 'live') { setMini(true); setOverlay(true); return true; }
      if (mini && action === 'NAV_UP') { setMiniIndex((value) => Math.max(0, value - 1)); return true; }
      if (mini && action === 'NAV_DOWN') { setMiniIndex((value) => Math.min(channels.length - 1, value + 1)); return true; }
      if (!mini && (action === 'NAV_UP' || action === 'CHANNEL_UP') && channels.length) { switchChannel(channels.findIndex((c) => c.id === active.id) - 1); return true; }
      if (!mini && (action === 'NAV_DOWN' || action === 'CHANNEL_DOWN') && channels.length) { switchChannel(channels.findIndex((c) => c.id === active.id) + 1); return true; }
      if ((action === 'PLAY' || action === 'PAUSE') && element) { action === 'PLAY' ? void element.play() : element.pause(); show(); return true; }
      if (action === 'STOP') { close(); return true; }
      if ((action === 'FAST_FORWARD' || action === 'REWIND') && element && active.type !== 'live') { element.currentTime = Math.max(0, element.currentTime + (action === 'FAST_FORWARD' ? 30 : -10)); show(); return true; }
      return true;
    });
    return () => registerAction(null);
  }, [active, overlay, mini, miniIndex, state]);
  useEffect(() => () => {
    const element = video.current;
    api.watched({ type: active.type, id: active.id, item: active.item, position: element?.currentTime || 0, duration: element?.duration || 0 }).catch(() => undefined);
    hls.current?.destroy(); window.clearTimeout(hideTimer.current);
  }, [active.id]);
  const item = active.item; const title = item.name; const logo = 'logo' in item ? item.logo : undefined;
  return <main className="player-screen"><video ref={video} autoplay playsInline onPlaying={() => { setState('playing'); show(); if (active.resumeAt && video.current) video.current.currentTime = active.resumeAt; }} onPause={() => setState('paused')} onError={() => setState('error')} />
    {state === 'loading' && <div className="player-status"><span className="spinner" />Loading stream…</div>}
    {state === 'error' && <div className="player-error"><h2>Unable to play this stream</h2><p>The provider may be unavailable, or this TV may not support the stream codec or container.</p><div><button onClick={() => void start()}>Retry</button><button onClick={close}>Back</button></div><small>Press OK to retry · Back to return</small></div>}
    {mini && <aside className="mini-list"><h2>Channels</h2>{channels.slice(Math.max(0, miniIndex - 4), miniIndex + 5).map((channel) => <div key={channel.id} className={channels[miniIndex]?.id === channel.id ? 'mini-selected' : ''}><Image src={channel.logo} alt={channel.name} /><span>{channel.name}</span>{active.id === channel.id && <b>LIVE</b>}</div>)}<small>OK switches channel</small></aside>}
    {overlay && state !== 'error' && <section className="player-overlay"><div className="player-now"><Image src={logo} alt={title} className="overlay-logo" /><div><span className="eyebrow">{active.type === 'live' ? 'LIVE NOW' : active.type === 'movie' ? 'MOVIE' : 'EPISODE'}</span><h1>{title}</h1>{epg?.current && <><strong>{epg.current.title}</strong><small>{formatTime(epg.current.start)} – {formatTime(epg.current.end)}</small></>}</div></div>{active.type === 'live' && <><Progress value={epg?.progress || 0} />{epg?.next && <div className="overlay-next"><span>Next · {formatTime(epg.next.start)}</span><strong>{epg.next.title}</strong></div>}</>}<div className="overlay-hints"><span>↑ ↓ Change channel</span><span>← Channel list</span><span>OK Hide info</span><span>Back Exit</span></div></section>}
  </main>;
}
