import { useEffect, useState } from 'preact/hooks';
import { api } from '../api/client';
import { useTranslate } from '../i18n/I18nContext';
import { Focusable } from '../navigation/FocusContext';
import type { SeriesItem, VodItem } from '../types';

export function FavoriteButton({ type, item, down }: { type: 'movie'|'series'; item: VodItem | SeriesItem; down?: string }) {
  const t = useTranslate();
  const [favorite, setFavorite] = useState(false);
  useEffect(() => { api.favorites().then((rows) => setFavorite(rows.some((row) => row.type === type && row.id === item.id))).catch(() => undefined); }, [type, item.id]);
  const toggle = () => {
    const action = favorite ? api.unfavorite(type, item.id) : api.favorite({ type, id: item.id, item });
    action.then(() => setFavorite(!favorite)).catch(() => undefined);
  };
  return <Focusable focusKey="details:favorite" group="details-actions" index={2} orientation="horizontal" neighbors={down ? { down, right: 'details:favorite' } : undefined} onSelect={toggle} className="secondary-button">{favorite ? t('favorite.added') : t('favorite.add')}</Focusable>;
}

