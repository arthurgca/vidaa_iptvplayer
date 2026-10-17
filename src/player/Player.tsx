import { RemoteHint } from '../components/RemoteHint';
import type HlsType from 'hls.js';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/client';
import { isEpgFresh, loadEpg, peekEpg, programProgress } from '../api/epg';
import { formatTime, Image, Progress } from '../components/common';
import { useTranslate } from '../i18n/I18nContext';
import type { RemoteAction } from '../platform/remote';
import { PlayerOptions } from './PlayerOptions';
import { nextEpisode } from './history';
import { RecoveryBudget } from './recovery';
import { audioChoices, subtitleChoices, selectAudio, selectSubtitle, type TrackChoice, type TrackVideo } from './tracks';
import type { Channel, Episode, EpgNow, MediaKind, SeriesItem, VodItem } from '../types';

export interface Playable {
  type: MediaKind; id: string; item: Channel | VodItem | Episode; extension?: string;
  channels?: Channel[]; series?: SeriesItem; resumeAt?: number; episodes?: Episode[];
}

interface TechnicalInfo {
  format: string; width?: number; height?: number; frameRate?: number;
  bitrate?: number; videoCodec?: string; audioCodec?: string;
}

export const ASPECT_MODES = ['auto', '16:9', '4:3', 'zoom', 'stretch'] as const;
export type AspectMode = typeof ASPECT_MODES[number];
const ASPECT_STORAGE_KEY = 'vidaa-player-aspect-ratio';

export function isAspectMode(value: string | null): value is AspectMode {
  return ASPECT_MODES.some((mode) => mode === value);
}

export function nextAspectMode(current: AspectMode, direction = 1): AspectMode {
  const index = ASPECT_MODES.indexOf(current);
  return ASPECT_MODES[(index + direction + ASPECT_MODES.length) % ASPECT_MODES.length]!;
}

function savedAspectMode(): AspectMode {
  try {
    const value = window.localStorage.getItem(ASPECT_STORAGE_KEY);
    return isAspectMode(value) ? value : 'auto';
  } catch { return 'auto'; }
}

function saveAspectMode(mode: AspectMode) {
  try { window.localStorage.setItem(ASPECT_STORAGE_KEY, mode); } catch { /* storage may be disabled on the TV */ }
}

function streamFormat(extension: string | undefined, isHls: boolean, fallback: string) {
  if (isHls) return 'HLS';
  const value = extension?.replace(/^\./, '').toLowerCase();
  if (value === 'ts') return 'MPEG-TS';
  if (value === 'mkv') return 'Matroska';
  return value?.toUpperCase() || fallback;
}

function codecName(codec: string | undefined) {
  const value = codec?.toLowerCase();
  if (!value) return undefined;
  if (value.startsWith('avc1') || value.startsWith('avc3')) return 'H.264';
  if (value.startsWith('hev1') || value.startsWith('hvc1')) return 'HEVC';
  if (value.startsWith('av01')) return 'AV1';
  if (value.startsWith('vp09') || value.startsWith('vp9')) return 'VP9';
  if (value.startsWith('mp4a')) return 'AAC';
  if (value.startsWith('ec-3')) return 'Dolby Digital Plus';
  if (value.startsWith('ac-3')) return 'Dolby Digital';
  if (value.startsWith('opus')) return 'Opus';
  return codec;
}

function bitrateLabel(bitrate: number | undefined) {
  if (!bitrate) return undefined;
  return bitrate >= 1_000_000 ? `${(bitrate / 1_000_000).toFixed(1)} Mbps` : `${Math.round(bitrate / 1_000)} kbps`;
}

export function formatPlaybackTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const seconds = Math.floor(value);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function clampSeekTime(value: number, duration: number) {
  if (!Number.isFinite(value) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(value, duration));
}

export function parseMediaDuration(value: string | undefined) {
  if (!value) return 0;
  const normalized = value.trim().toLowerCase();
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return Math.max(0, Number(normalized));
  if (/^\d{1,2}:\d{1,2}(?::\d{1,2})?$/.test(normalized)) {
    return normalized.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  }
  const hours = Number(normalized.match(/(\d+(?:\.\d+)?)\s*h/)?.[1] || 0);
  const minutes = Number(normalized.match(/(\d+(?:\.\d+)?)\s*m/)?.[1] || 0);
  const seconds = Number(normalized.match(/(\d+(?:\.\d+)?)\s*s/)?.[1] || 0);
  return Math.max(0, hours * 3600 + minutes * 60 + seconds);
}

export const BROWSE_ROWS = 6;
export const EPG_DEBOUNCE_MS = 250;
export const PROGRESS_SAVE_INTERVAL_MS = 15_000;
let lastCheckpointAt = 0;
const checkpointTime = () => (lastCheckpointAt = Math.max(Date.now(), lastCheckpointAt + 1));

/** Rows shown around the browse cursor: centred while there is room, pinned to either end of the list otherwise. */
export function browseWindow(total: number, index: number, size = BROWSE_ROWS) {
  if (total <= size) return { start: 0, end: total };
  const start = Math.min(Math.max(0, index - Math.floor(size / 2)), total - size);
  return { start, end: start + size };
}

export function Player({ media, registerAction, close, liveChannelChanged }: { media: Playable; registerAction: (handler: ((action: RemoteAction) => boolean) | null) => void; close: () => void; liveChannelChanged?: (channel: Channel) => void }) {
  const t = useTranslate();
  const video = useRef<TrackVideo>(null); const hls = useRef<HlsType>(); const hideTimer = useRef<number>(); const resumeApplied = useRef(false);
  const generation = useRef(0); const recovery = useRef(new RecoveryBudget());
  const retryTimer = useRef<number>(); const stallTimer = useRef<number>(); const healthyTimer = useRef<number>();
  const restartAt = useRef<number>();
  const session = useRef<{ media: Playable; position: number; duration: number; completed: boolean; started: boolean; historyVersion: Promise<number> }>();
  const [attempt, setAttempt] = useState(0); const [options, setOptions] = useState(false);
  const [audio, setAudio] = useState<TrackChoice[]>([]); const [subtitles, setSubtitles] = useState<TrackChoice[]>([]);
  const [autoNext, setAutoNext] = useState(() => { try { return localStorage.getItem('vidaa-auto-next') === 'true'; } catch { return false; } });
  const [overlay, setOverlay] = useState(true); const [browsing, setBrowsing] = useState(false); const [browseIndex, setBrowseIndex] = useState(0); const [epgRevision, setEpgRevision] = useState(0);
  const [active, setActive] = useState(media); const [epg, setEpg] = useState<EpgNow>(); const [state, setState] = useState<'loading'|'playing'|'paused'|'ended'|'error'>('loading');
  const [technical, setTechnical] = useState<TechnicalInfo>({ format: t('player.tech.stream') });
  const [position, setPosition] = useState(0); const [duration, setDuration] = useState(0); const [buffered, setBuffered] = useState(0);
  const [aspectMode, setAspectMode] = useState<AspectMode>(savedAspectMode);
  const channels = active.channels || [];
  const metadataDuration = 'duration' in active.item ? parseMediaDuration(active.item.duration) : 0;
  const playableDuration = (element: HTMLVideoElement) => {
    if (Number.isFinite(element.duration) && element.duration > 0) return element.duration;
    if (element.seekable.length) {
      const seekableEnd = element.seekable.end(element.seekable.length - 1);
      if (Number.isFinite(seekableEnd) && seekableEnd > 0) return seekableEnd;
    }
    return metadataDuration;
  };
  const refreshTracks = () => {
    const element = video.current; if (!element) return;
    setAudio(audioChoices(element, hls.current)); setSubtitles(subtitleChoices(element, hls.current));
  };
  const clearRecoveryTimers = () => { window.clearTimeout(retryTimer.current); retryTimer.current = undefined; window.clearTimeout(stallTimer.current); stallTimer.current = undefined; window.clearTimeout(healthyTimer.current); };
  const fail = () => { clearRecoveryTimers(); setState('error'); };
  const recover = (repair?: () => void) => {
    if (retryTimer.current !== undefined || session.current?.completed) return;
    window.clearTimeout(healthyTimer.current); window.clearTimeout(stallTimer.current);
    const delay = recovery.current.nextDelay();
    if (delay === undefined) { fail(); return; }
    setAttempt(recovery.current.attempts); setState('loading');
    const expected = generation.current;
    retryTimer.current = window.setTimeout(() => {
      retryTimer.current = undefined;
      if (generation.current !== expected) return;
      try { if (repair) repair(); else { restartAt.current = session.current?.position; void start(); } } catch { recover(); }
    }, delay);
  };
  const start = async () => {
    const element = video.current; if (!element) return;
    const expected = ++generation.current;
    window.clearTimeout(retryTimer.current); retryTimer.current = undefined;
    window.clearTimeout(stallTimer.current); stallTimer.current = undefined;
    setState('loading'); setPosition(0); setDuration(0); setBuffered(0); resumeApplied.current = false;
    hls.current?.destroy(); hls.current = undefined; setAudio([]); setSubtitles([]);
    const url = api.playUrl(active.type, active.id, active.extension);
    const isHls = active.extension === 'm3u8' || (active.type === 'live' && url.includes('ext=m3u8'));
    setTechnical({ format: streamFormat(active.extension, isHls, t('player.tech.stream')) });
    const play = () => { void element.play().catch((error: Error) => { if (expected !== generation.current || error.name === 'AbortError') return; error.name === 'NotAllowedError' || error.name === 'NotSupportedError' ? fail() : recover(); }); };
    try {
      if (isHls && !element.canPlayType('application/vnd.apple.mpegurl')) {
        const Hls = (await import('hls.js')).default;
        if (expected !== generation.current) return;
        if (!Hls.isSupported()) { fail(); return; }
        const instance = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 30 }); hls.current = instance;
        instance.on(Hls.Events.MANIFEST_PARSED, () => { if (expected === generation.current) { refreshTracks(); play(); } });
        instance.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
          if (expected !== generation.current) return;
          const level = instance.levels[data.level]; if (!level) return;
          setTechnical((current) => ({ ...current, width: level.width || element.videoWidth || undefined, height: level.height || element.videoHeight || undefined, frameRate: level.frameRate || undefined, bitrate: level.bitrate || undefined, videoCodec: level.videoCodec, audioCodec: level.audioCodec }));
        });
        for (const event of [Hls.Events.AUDIO_TRACKS_UPDATED, Hls.Events.AUDIO_TRACK_SWITCHED, Hls.Events.SUBTITLE_TRACKS_UPDATED, Hls.Events.SUBTITLE_TRACK_SWITCH]) instance.on(event, refreshTracks);
        instance.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || expected !== generation.current) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) recover(() => instance.startLoad());
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) recover(() => instance.recoverMediaError());
          else fail();
        });
        instance.loadSource(url); instance.attachMedia(element);
      } else { element.src = url; play(); }
    } catch { if (expected === generation.current) recover(); }
  };
  const retry = () => { recovery.current.reset(); setAttempt(0); restartAt.current = session.current?.position; void start(); };
  const openOptions = () => { setBrowsing(false); refreshTracks(); setOptions(true); setOverlay(true); window.clearTimeout(hideTimer.current); };
  const closeOptions = () => { setOptions(false); show(); };
  const upcoming = active.type === 'series' ? nextEpisode(active.episodes || [], active.id) : undefined;
  const playNext = () => {
    if (!upcoming) return;
    setOptions(false); setActive({ ...active, id: upcoming.id, item: upcoming, extension: upcoming.extension, resumeAt: 0 }); show();
  };
  const toggleAutoNext = () => { const value = !autoNext; setAutoNext(value); try { localStorage.setItem('vidaa-auto-next', String(value)); } catch { /* optional preference */ } };
  const show = () => { setOverlay(true); window.clearTimeout(hideTimer.current); hideTimer.current = window.setTimeout(() => setOverlay(false), 4500); };
  const syncPlayback = () => {
    const element = video.current; if (!element) return;
    const nextDuration = playableDuration(element);
    const nextPosition = Number.isFinite(element.currentTime) ? element.currentTime : 0;
    if (session.current?.media.type === active.type && session.current.media.id === active.id && !session.current.completed && (resumeApplied.current || active.type === 'live')) { session.current.position = nextPosition; session.current.duration = nextDuration; }
    const bufferedEnd = element.buffered.length ? element.buffered.end(element.buffered.length - 1) : 0;
    setDuration(nextDuration); setPosition(nextPosition); setBuffered(nextDuration ? clampSeekTime(bufferedEnd, nextDuration) : 0);
  };
  const seekTo = (nextPosition: number) => {
    const element = video.current; if (!element || active.type === 'live') return;
    const nextDuration = playableDuration(element) || duration;
    if (!nextDuration) return;
    const target = clampSeekTime(nextPosition, nextDuration);
    element.currentTime = target; syncPlayback(); show();
  };
  const selectAspectMode = (mode: AspectMode) => { setAspectMode(mode); saveAspectMode(mode); show(); };
  const cycleAspectMode = (direction = 1) => { setAspectMode((current) => { const next = nextAspectMode(current, direction); saveAspectMode(next); return next; }); show(); };
  const applyResume = () => {
    const element = video.current; if (!element || resumeApplied.current || active.type === 'live') return;
    const nextDuration = playableDuration(element);
    const resume = restartAt.current ?? active.resumeAt;
    if (resume && !nextDuration) return;
    resumeApplied.current = true;
    if (resume) { try { element.currentTime = clampSeekTime(resume, nextDuration); } catch { resumeApplied.current = false; return; } }
    restartAt.current = undefined;
    syncPlayback();
  };
  const switchChannel = (index: number) => {
    const channel = channels[(index + channels.length) % channels.length]; if (!channel) return;
    setActive({ type: 'live', id: channel.id, item: channel, extension: channel.extension, channels }); setBrowseIndex((index + channels.length) % channels.length); setBrowsing(false); show();
  };
  useEffect(() => {
    const historyVersion = api.historyVersion();
    void historyVersion.catch(() => undefined); // Save attempts retain the failure; never send an unversioned checkpoint.
    const record = { media: active, position: active.resumeAt || 0, duration: 0, completed: false, started: false, historyVersion };
    session.current = record; recovery.current.reset(); setAttempt(0); restartAt.current = undefined;
    if (active.type === 'live') liveChannelChanged?.(active.item as Channel);
    void start();
    const checkpoint = () => { syncPlayback(); void saveSession(record); };
    const interval = window.setInterval(() => {
      if (record.started && !record.completed && !video.current?.paused) checkpoint();
    }, PROGRESS_SAVE_INTERVAL_MS);
    const hidden = () => { if (document.visibilityState === 'hidden') checkpoint(); };
    const pagehide = () => checkpoint();
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', pagehide);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', pagehide);
      generation.current++; clearRecoveryTimers();
      syncPlayback();
      if (record.started) void saveSession(record);
      hls.current?.destroy(); hls.current = undefined; window.clearTimeout(hideTimer.current);
    };
  }, [active.type, active.id]);
  useEffect(() => {
    const element = video.current; if (!element) return;
    const lists = [element.textTracks, element.audioTracks].filter((list): list is NonNullable<typeof list> => Boolean(list));
    for (const list of lists) for (const event of ['addtrack', 'removetrack', 'change']) list.addEventListener(event, refreshTracks);
    return () => { for (const list of lists) for (const event of ['addtrack', 'removetrack', 'change']) list.removeEventListener(event, refreshTracks); };
  }, [active.id]);
  useEffect(() => { let current = true; setEpg(undefined); if (active.type === 'live') void loadEpg(active.id).then((value) => { if (current) setEpg(value); }).catch(() => undefined); return () => { current = false; }; }, [active.id]);
  useEffect(() => { const index = channels.findIndex((channel) => channel.id === active.id); if (index >= 0) setBrowseIndex(index); }, [active.id]);
  // Browsing is preview only: the cursor pulls the highlighted channel's EPG after a pause, so holding a
  // D-pad key scrolls without firing a request per row, and the cache answers rows already visited.
  useEffect(() => {
    const channel = channels[browseIndex];
    if (!browsing || !channel || isEpgFresh(channel.id)) return;
    const timer = window.setTimeout(() => { void loadEpg(channel.id).then(() => setEpgRevision((value) => value + 1)).catch(() => undefined); }, EPG_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [browsing, channels[browseIndex]?.id]);
  useEffect(() => {
    const timeout = window.setTimeout(() => { if (state === 'loading') recover(); }, 18_000); return () => window.clearTimeout(timeout);
  }, [active.id, state, attempt]);
  useEffect(() => {
    registerAction((action) => {
      const element = video.current;
      if (action === 'BACK') { if (options) { closeOptions(); return true; } if (state === 'error' || state === 'ended') return false; if (browsing) { setBrowsing(false); return true; } if (overlay) { setOverlay(false); return true; } return false; }
      if (action === 'OPTIONS') { options ? closeOptions() : openOptions(); return true; }
      if (options && (action === 'SELECT' || action.startsWith('NAV_'))) return false;
      if (action === 'NAV_DOWN' && active.type !== 'live') { openOptions(); return true; }
      if (action === 'SELECT') { if (state === 'error') { retry(); return true; } if (state === 'ended') { upcoming ? playNext() : close(); return true; } if (browsing) { switchChannel(browseIndex); return true; } overlay ? openOptions() : show(); return true; }
      if (action === 'NAV_LEFT' && active.type === 'live') { setBrowsing(true); setOverlay(true); return true; }
      if (browsing && action === 'NAV_UP') { setBrowseIndex((value) => Math.max(0, value - 1)); return true; }
      if (browsing && action === 'NAV_DOWN') { setBrowseIndex((value) => Math.min(channels.length - 1, value + 1)); return true; }
      if (browsing && (action === 'CHANNEL_UP' || action === 'CHANNEL_DOWN')) {
        setBrowseIndex((value) => Math.max(0, Math.min(channels.length - 1, value + (action === 'CHANNEL_UP' ? -BROWSE_ROWS : BROWSE_ROWS)))); return true;
      }
      if (!browsing && (action === 'NAV_UP' || action === 'CHANNEL_UP') && channels.length) { switchChannel(channels.findIndex((c) => c.id === active.id) - 1); return true; }
      if (!browsing && (action === 'NAV_DOWN' || action === 'CHANNEL_DOWN') && channels.length) { switchChannel(channels.findIndex((c) => c.id === active.id) + 1); return true; }
      if (!browsing && ((action === 'NAV_UP' && active.type !== 'live') || (action === 'NAV_RIGHT' && active.type === 'live'))) { cycleAspectMode(); return true; }
      if (action === 'NAV_LEFT' && active.type !== 'live') { seekTo((element?.currentTime || 0) - 10); return true; }
      if (action === 'NAV_RIGHT' && active.type !== 'live') { seekTo((element?.currentTime || 0) + 30); return true; }
      if ((action === 'PLAY' || action === 'PAUSE') && element) { action === 'PLAY' ? void element.play().catch(() => fail()) : element.pause(); show(); return true; }
      if (action === 'STOP') { close(); return true; }
      if ((action === 'FAST_FORWARD' || action === 'REWIND') && element && active.type !== 'live') { seekTo(element.currentTime + (action === 'FAST_FORWARD' ? 30 : -10)); return true; }
      return true;
    });
    return () => registerAction(null);
  }, [active, overlay, browsing, browseIndex, state, options, autoNext, attempt]);
  const saveSession = (record = session.current) => {
    if (!record?.started) return Promise.resolve();
    return api.watched({ type: record.media.type, id: record.media.id, item: record.media.item, series: record.media.series, position: record.position, duration: record.duration, completed: record.completed, checkpointAt: checkpointTime(), historyVersion: record.historyVersion }, true).then(() => undefined).catch(() => undefined);
  };
  const ended = () => {
    if (active.type === 'live') { recover(); return; }
    if (!session.current || session.current.completed) return;
    syncPlayback(); session.current.completed = true; session.current.started = true;
    void saveSession(); setState('ended'); setOverlay(true); window.clearTimeout(hideTimer.current);
    if (autoNext && upcoming) playNext();
  };
  const playing = () => {
    if (session.current) {
      const firstPlay = !session.current.started;
      session.current.started = true;
      applyResume(); syncPlayback();
      if (firstPlay) void saveSession();
    }
    window.clearTimeout(stallTimer.current); stallTimer.current = undefined; window.clearTimeout(retryTimer.current); retryTimer.current = undefined;
    window.clearTimeout(healthyTimer.current);
    healthyTimer.current = window.setTimeout(() => { recovery.current.reset(); setAttempt(0); }, 30_000);
    setState('playing'); updateDimensions(); refreshTracks(); if (!options) show();
  };
  const waiting = () => {
    if (state === 'ended' || state === 'error' || video.current?.paused || retryTimer.current !== undefined) return;
    if (stallTimer.current === undefined) stallTimer.current = window.setTimeout(() => { stallTimer.current = undefined; recover(); }, 8_000);
  };
  const mediaError = () => {
    if (hls.current) return; // Fatal HLS errors are handled by the engine's typed error event.
    const code = video.current?.error?.code;
    if (code === 3 || code === 4) fail(); else recover();
  };
  const updateDimensions = () => {
    const element = video.current; if (!element?.videoWidth || !element.videoHeight) return;
    setTechnical((current) => ({ ...current, width: element.videoWidth, height: element.videoHeight }));
  };
  const item = active.item; const title = item.name; const logo = 'logo' in item ? item.logo : undefined;
  const playedPercent = duration ? Math.min(100, (position / duration) * 100) : 0;
  const bufferedPercent = duration ? Math.min(100, (buffered / duration) * 100) : 0;
  const browseRange = browseWindow(channels.length, browseIndex);
  const browseRows = useMemo(() => channels.slice(browseRange.start, browseRange.end).map((channel, offset) => ({ channel, index: browseRange.start + offset, epg: peekEpg(channel.id) })), [channels, browseRange.start, browseRange.end, epgRevision]);
  const quality = technical.width && technical.height ? `${technical.width} × ${technical.height}${technical.frameRate ? ` · ${Math.round(technical.frameRate)} FPS` : ''}` : technical.frameRate ? `${Math.round(technical.frameRate)} FPS` : undefined;
  const technicalRows = [[t('player.tech.format'), technical.format], [t('player.tech.quality'), quality], [t('player.tech.video'), codecName(technical.videoCodec)], [t('player.tech.audio'), codecName(technical.audioCodec)], [t('player.tech.bitrate'), bitrateLabel(technical.bitrate)]].filter((row): row is string[] => Boolean(row[1]));
  const aspectLabels: Record<AspectMode, string> = { auto: t('player.aspect.auto'), '16:9': '16:9', '4:3': '4:3', zoom: t('player.aspect.zoom'), stretch: t('player.aspect.stretch') };
  return <main className="player-screen"><video ref={video} className={`video-aspect-${aspectMode.replace(':', '-')}`} autoplay playsInline onLoadedMetadata={() => { updateDimensions(); refreshTracks(); applyResume(); }} onDurationChange={() => { applyResume(); syncPlayback(); }} onCanPlay={applyResume} onTimeUpdate={syncPlayback} onProgress={syncPlayback} onSeeking={syncPlayback} onResize={updateDimensions} onPlaying={playing} onPause={() => { if (state === 'playing') { setState('paused'); window.clearTimeout(healthyTimer.current); window.clearTimeout(stallTimer.current); stallTimer.current = undefined; syncPlayback(); void saveSession(); } }} onWaiting={waiting} onStalled={waiting} onEnded={ended} onError={mediaError} />
    {state === 'loading' && <div className="player-status"><span className="spinner" />{attempt ? t('player.reconnecting', { attempt }) : t('player.loading')}</div>}
    {state === 'error' && <div className="player-error"><h2>{t('player.error.title')}</h2><p>{t('player.error.body')}</p><div><button onClick={retry}>{t('common.retry')}</button><button onClick={close}>{t('common.back')}</button></div><small><RemoteHint id="player.error.hint" /></small></div>}
    {browsing && <aside className="browse-bar" aria-label={t('player.browse.label')}><div className="browse-heading"><h2>{t('player.browse.title')}</h2><span>{browseIndex + 1} / {channels.length}</span></div>
      <div className="browse-rows">{browseRows.map(({ channel, index, epg: row }) => {
        const highlighted = index === browseIndex;
        return <div key={channel.id} className={`browse-row${highlighted ? ' browse-row-active' : ''}`} aria-current={highlighted ? 'true' : undefined}>
          <span className="browse-number">{channel.number || index + 1}</span><Image src={channel.logo} alt={channel.name} className="browse-logo" />
          <div className="browse-copy">
            <div className="browse-name"><strong>{channel.name}</strong>{active.id === channel.id && <b>{t('kind.live')}</b>}</div>
            <small className="browse-now">{row?.current?.title || t('common.noProgramme')}</small>
            <span className="browse-elapsed" aria-hidden="true"><i style={{ width: `${programProgress(row?.current)}%` }} /></span>
            <small className="browse-next">{row?.next ? t('player.browse.next', { time: formatTime(row.next.start), title: row.next.title }) : ''}</small>
            {highlighted && row?.current?.description && <p className="browse-description">{row.current.description}</p>}
          </div>
        </div>;
      })}</div><small className="browse-hint"><RemoteHint id="player.browse.hint" /></small></aside>}
    {state === 'ended' && <div className="player-ended"><h2>{t('player.ended')}</h2>{upcoming && <button onClick={playNext}>{t('player.nextEpisode', { name: upcoming.name })}</button>}<button onClick={close}>{t('common.back')}</button></div>}
    {options && <PlayerOptions audio={audio} subtitles={subtitles} selectAudio={(index) => { if (video.current) selectAudio(video.current, index, hls.current); refreshTracks(); }} selectSubtitle={(index) => { if (video.current) selectSubtitle(video.current, index, hls.current); refreshTracks(); }} next={upcoming ? { name: upcoming.name, play: playNext } : undefined} autoNext={active.type === 'series' ? autoNext : undefined} toggleAutoNext={toggleAutoNext} close={closeOptions} />}
    {overlay && state !== 'error' && <section className="player-overlay">
      <div className="player-now"><Image src={logo} alt={title} className="overlay-logo" /><div><span className="eyebrow">{active.type === 'live' ? t('player.liveNow') : active.type === 'movie' ? t('player.movie') : t('player.episode')}</span><h1>{title}</h1>{epg?.current && <><strong>{epg.current.title}</strong><small>{formatTime(epg.current.start)} – {formatTime(epg.current.end)}</small></>}</div></div>
      {active.type === 'live' ? <><Progress value={programProgress(epg?.current)} />{epg?.next && <div className="overlay-next"><span>{t('player.next', { time: formatTime(epg.next.start) })}</span><strong>{epg.next.title}</strong></div>}</> : <div className="playback-timeline">
        <div className="timeline-times"><span>{formatPlaybackTime(position)}</span><span>{duration ? formatPlaybackTime(duration) : '--:--'}</span></div>
        <div className="timeline-control" role="slider" aria-label={t('player.timeline.label')} aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(position)} aria-valuetext={t('player.timeline.valueText', { position: formatPlaybackTime(position), duration: duration ? formatPlaybackTime(duration) : t('player.timeline.unknown') })}><div className="timeline-track" aria-hidden="true"><div className="timeline-buffered" style={{ width: `${bufferedPercent}%` }} /><div className="timeline-played" style={{ width: `${playedPercent}%` }} /><div className="timeline-thumb" style={{ left: `${playedPercent}%` }} /></div></div>
      </div>}
      <div className="playback-tech" aria-label={t('player.tech.label')}>{technicalRows.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>
      <div className="aspect-options" role="radiogroup" aria-label={t('player.aspect.label')}><small>{t('player.aspect.label')}</small>{ASPECT_MODES.map((mode) => <button key={mode} type="button" role="radio" aria-checked={aspectMode === mode} className={aspectMode === mode ? 'active' : ''} onClick={() => selectAspectMode(mode)}>{aspectLabels[mode]}</button>)}</div>
      <button className="secondary-button player-options-button" onClick={openOptions}>{t('player.options')}</button><div className="overlay-hints">{active.type === 'live' ? <><span><RemoteHint id="player.hint.changeChannel" /></span><span><RemoteHint id="player.hint.browse" /></span><span><RemoteHint id="player.hint.aspectLive" /></span></> : <><span><RemoteHint id="player.hint.rewind" /></span><span><RemoteHint id="player.hint.forward" /></span><span><RemoteHint id="player.hint.aspectVod" /></span></>}<span><RemoteHint id="player.optionsHint" /></span><span><RemoteHint id="player.hint.exit" /></span></div>
    </section>}
  </main>;
}
