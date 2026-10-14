import { useEffect } from 'preact/hooks';
import { useTranslate } from '../i18n/I18nContext';
import { Focusable, useFocusManager } from '../navigation/FocusContext';
import type { TrackChoice } from './tracks';

export function PlayerOptions({ audio, subtitles, selectAudio, selectSubtitle, next, autoNext, toggleAutoNext, close }: {
  audio: TrackChoice[]; subtitles: TrackChoice[]; selectAudio: (index: number) => void; selectSubtitle: (index: number) => void;
  next?: { name: string; play: () => void }; autoNext?: boolean; toggleAutoNext: () => void; close: () => void;
}) {
  const t = useTranslate(); const focus = useFocusManager();
  useEffect(() => {
    focus.setScope('player-options');
    const timer = window.setTimeout(() => focus.focus('player-options:close'), 50);
    return () => { window.clearTimeout(timer); focus.setScope('root'); };
  }, []);
  let index = 0;
  return <aside className="player-options" role="dialog" aria-modal="true" aria-label={t('player.options')}>
    <h2>{t('player.options')}</h2>
    <Focusable focusKey="player-options:close" group="player-options" index={index++} orientation="vertical" onSelect={close} className="secondary-button">{t('common.back')}</Focusable>
    {next && <Focusable focusKey="player-options:next" group="player-options" index={index++} orientation="vertical" onSelect={next.play} className="primary-button">{t('player.nextEpisode', { name: next.name })}</Focusable>}
    {autoNext !== undefined && <Focusable focusKey="player-options:auto-next" group="player-options" index={index++} orientation="vertical" onSelect={toggleAutoNext} className="secondary-button">{t('player.autoNext', { value: t(autoNext ? 'player.on' : 'player.off') })}</Focusable>}
    <h3>{t('player.audio')}</h3>
    {audio.length ? audio.map((track) => <Focusable key={track.index} focusKey={`player-options:audio:${track.index}`} group="player-options" index={index++} orientation="vertical" onSelect={() => selectAudio(track.index)} className={`secondary-button${track.selected ? ' selected-option' : ''}`}>{track.selected ? '✓ ' : ''}{track.name || t('player.track', { number: track.index + 1 })}</Focusable>) : <p>{t('player.noAudio')}</p>}
    <h3>{t('player.subtitles')}</h3>
    <Focusable focusKey="player-options:subtitle:off" group="player-options" index={index++} orientation="vertical" onSelect={() => selectSubtitle(-1)} className={`secondary-button${subtitles.some((track) => track.selected) ? '' : ' selected-option'}`}>{t('player.off')}</Focusable>
    {subtitles.length ? subtitles.map((track) => <Focusable key={track.index} focusKey={`player-options:subtitle:${track.index}`} group="player-options" index={index++} orientation="vertical" onSelect={() => selectSubtitle(track.index)} className={`secondary-button${track.selected ? ' selected-option' : ''}`}>{track.selected ? '✓ ' : ''}{track.name || t('player.track', { number: track.index + 1 })}</Focusable>) : <p>{t('player.noSubtitles')}</p>}
  </aside>;
}
