import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/client';
import { Empty, Image, Spinner, formatTime } from '../components/common';
import { SearchField } from '../components/SearchField';
import { useTranslate } from '../i18n/I18nContext';
import { activeLocaleTag } from '../i18n';
import { Focusable, useFocusManager } from '../navigation/FocusContext';
import type { Channel, GuidePage, Program } from '../types';

const HOUR = 3600_000;
const currentHour = () => Math.floor(Date.now() / HOUR) * HOUR;

export function Guide({ category, play }: { category: string; play: (channel: Channel, channels: Channel[]) => void }) {
  const t = useTranslate(); const focus = useFocusManager();
  const [start, setStart] = useState(currentHour); const [offset, setOffset] = useState(0); const [search, setSearch] = useState('');
  const [data, setData] = useState<GuidePage>(); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Program>();
  const pendingPage = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setSelected(undefined);
    api.guide(start, offset, category, search).then((page) => { if (active) setData(page); })
      .catch((reason) => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [start, offset, category, search, revision]);
  useEffect(() => {
    if (focus.focused.startsWith('guide:channels-')) pendingPage.current = true;
    if (loading) return;
    const timer = window.setTimeout(() => {
      const first = data?.items[0];
      if (pendingPage.current && first) focus.focus(`guide:channel:${first.channel.id}`);
      else if (!focus.focus(focus.focused)) focus.focus('guide:now');
      if (first) pendingPage.current = false;
    }, 50);
    return () => window.clearTimeout(timer);
  }, [loading, data?.offset]);
  const rows = data?.items || [];
  const windowStart = data?.start || start; const windowEnd = data?.end || start + 3 * HOUR;
  const programKey = (row: number, index: number) => `guide:program:${rows[row]!.channel.id}:${index}`;
  const adjacentKey = (row: number, time: number) => {
    if (row < 0) return 'guide:now';
    if (row >= rows.length) return offset + rows.length < (data?.total || 0) ? 'guide:channels-next' : 'guide:now';
    const programs = rows[row]!.programs;
    const index = programs.findIndex((program) => program.start <= time && program.end > time);
    return programs.length ? programKey(row, index < 0 ? 0 : index) : `guide:channel:${rows[row]!.channel.id}`;
  };
  const tune = (channel: Channel) => play(channel, rows.map((row) => row.channel));
  const shift = (direction: number) => setStart(Math.max(currentHour() - 3 * HOUR, Math.min(currentHour() + 45 * HOUR, start + direction * 3 * HOUR)));
  return <main className="screen guide-screen">
    <header className="section-header"><div><span className="eyebrow">{t('live.eyebrow')}</span><h1>{t('guide.title')}</h1></div>
      <SearchField focusKey="guide:search" value={search} input={(value) => { setSearch(value); setOffset(0); }} placeholder={t('live.search')} neighbors={{ down: 'guide:now' }} />
    </header>
    <div className="guide-toolbar">
      <Focusable focusKey="guide:earlier" group="guide-toolbar" index={0} orientation="horizontal" disabled={start <= currentHour() - 3 * HOUR} neighbors={{ down: adjacentKey(0, windowStart) }} onSelect={() => shift(-1)} className="secondary-button">{t('guide.previous')}</Focusable>
      <Focusable focusKey="guide:now" group="guide-toolbar" index={1} orientation="horizontal" neighbors={{ up: 'guide:search', down: rows[0] ? `guide:channel:${rows[0].channel.id}` : undefined }} onSelect={() => { setStart(currentHour()); setRevision((value) => value + 1); }} className="secondary-button">{t('guide.now')}</Focusable>
      <Focusable focusKey="guide:later" group="guide-toolbar" index={2} orientation="horizontal" disabled={start >= currentHour() + 45 * HOUR} neighbors={{ down: adjacentKey(0, windowEnd - 1) }} onSelect={() => shift(1)} className="secondary-button">{t('guide.next')}</Focusable>
      <strong>{new Date(windowStart).toLocaleDateString(activeLocaleTag(), { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
    </div>
    {loading ? <Spinner /> : error ? <div className="state-panel error"><p>{error}</p><Focusable focusKey="guide:retry" group="guide-toolbar" index={3} onSelect={() => setRevision((value) => value + 1)}>{t('common.retry')}</Focusable></div> : !rows.length ? <Empty>{t('live.empty')}</Empty> : <>
      <div className="guide-hours"><span />{[0, 1, 2].map((hour) => <strong key={hour}>{formatTime(windowStart + hour * HOUR)}</strong>)}</div>
      <div className="guide-grid">{rows.map(({ channel, programs }, row) => <div key={channel.id} className="guide-row">
        <Focusable focusKey={`guide:channel:${channel.id}`} group="guide-channels" index={row} orientation="vertical" neighbors={{ up: row ? `guide:channel:${rows[row - 1]!.channel.id}` : 'guide:now', down: rows[row + 1] ? `guide:channel:${rows[row + 1]!.channel.id}` : ['guide:channels-next', 'guide:channels-previous', 'guide:now'], right: programs.length ? programKey(row, 0) : undefined }} onFocus={() => setSelected(undefined)} onSelect={() => tune(channel)} className="guide-channel"><Image src={channel.logo} alt={channel.name} /><strong>{channel.name}</strong></Focusable>
        <div className="guide-programs">{programs.length ? programs.map((program, index) => {
          const left = Math.max(program.start, windowStart); const right = Math.min(program.end, windowEnd); const midpoint = (left + right) / 2;
          return <div key={`${program.start}:${index}`} className="guide-program-slot" style={{ left: `${(left - windowStart) / (windowEnd - windowStart) * 100}%`, width: `${(right - left) / (windowEnd - windowStart) * 100}%` }}>
            <Focusable focusKey={programKey(row, index)} group={`guide-row:${channel.id}`} index={index} orientation="horizontal" neighbors={{ left: index ? programKey(row, index - 1) : `guide:channel:${channel.id}`, right: programs[index + 1] ? programKey(row, index + 1) : 'guide:later', up: adjacentKey(row - 1, midpoint), down: adjacentKey(row + 1, midpoint) }} onFocus={() => setSelected(program)} onSelect={() => tune(channel)} title={t('guide.live')} className={`guide-program${program.start <= Date.now() && program.end > Date.now() ? ' guide-current' : ''}`}><small>{formatTime(program.start)} – {formatTime(program.end)}</small><strong>{program.title}</strong></Focusable>
          </div>;
        }) : <span className="muted">{t('common.noProgramme')}</span>}</div>
      </div>)}</div>
      <div className="guide-toolbar guide-pagination">
        <Focusable focusKey="guide:channels-previous" group="guide-pages" index={0} orientation="horizontal" disabled={!offset} onSelect={() => setOffset(Math.max(0, offset - 6))} className="secondary-button">{t('guide.previousChannels')}</Focusable>
        <span>{t('guide.range', { first: offset + 1, last: offset + rows.length, total: data!.total })}</span>
        <Focusable focusKey="guide:channels-next" group="guide-pages" index={1} orientation="horizontal" disabled={offset + rows.length >= data!.total} onSelect={() => setOffset(offset + 6)} className="secondary-button">{t('guide.nextChannels')}</Focusable>
      </div>
    </>}
    <div className="guide-description">{selected ? <><strong>{selected.title} · {formatTime(selected.start)} – {formatTime(selected.end)} · OK: {t('guide.live')}</strong><p>{selected.description || t('guide.noDescription')}</p></> : <p>{t('guide.help')}</p>}</div>
  </main>;
}
