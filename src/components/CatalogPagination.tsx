import { useTranslate } from '../i18n/I18nContext';
import { Focusable } from '../navigation/FocusContext';
import type { Page } from '../types';

interface Props {
  kind: string;
  page?: Page<unknown>;
  offset: number;
  pageSize: number;
  loading: boolean;
  change: (offset: number) => void;
  firstItem?: string;
  lastItem?: string;
  fallback: string;
}

export function CatalogPagination({ kind, page, offset, pageSize, loading, change, firstItem, lastItem, fallback }: Props) {
  const t = useTranslate();
  const previous = `${kind}:page:previous`; const next = `${kind}:page:next`;
  const hasPrevious = offset > 0;
  const hasNext = !!page && page.offset + page.items.length < page.total && page.items.length > 0;
  return <div className="catalog-pagination" aria-label={t('catalog.pagination')}>
    <Focusable focusKey={previous} group={`${kind}-pages`} index={0} orientation="horizontal" disabled={loading || !hasPrevious}
      neighbors={{ up: lastItem || firstItem || fallback, left: fallback, right: next }}
      onSelect={() => change(Math.max(0, offset - (page?.limit || pageSize)))} className="secondary-button">{t('catalog.previousPage')}</Focusable>
    <span aria-live="polite">{loading ? t('common.loading') : page ? t('catalog.range', {
      first: page.items.length ? page.offset + 1 : 0, last: page.items.length ? page.offset + page.items.length : 0, total: page.total
    }) : ''}</span>
    <Focusable focusKey={next} group={`${kind}-pages`} index={1} orientation="horizontal" disabled={loading || !hasNext}
      neighbors={{ up: lastItem || firstItem || fallback, left: hasPrevious ? previous : fallback }}
      onSelect={() => { if (page) change(page.offset + page.limit); }} className="secondary-button">{t('catalog.nextPage')}</Focusable>
  </div>;
}
