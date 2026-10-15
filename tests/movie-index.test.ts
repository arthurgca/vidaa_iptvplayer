import { describe, expect, it } from 'vitest';
import { MovieIndex, movieIndex } from '../server/xtream/movieIndex';

describe('large raw Xtream movie index', () => {
  it('keeps every distinct ID, unions original categories, preserves equal titles and unknown categories', () => {
    const raw = Array.from({ length: 43534 }, (_, i) => ({ stream_id: String(i), name: i < 2 ? 'Same title' : `Filme ${i}`, category_id: String(i % 37), category_ids: [String(i % 37), 'multi'] }));
    const input = [...raw, { ...raw[12]!, category_id: 'other', category_ids: ['other'] }, { stream_id: 'orphan', name: 'No category', category_id: '', category_ids: [] }];
    const index = movieIndex(input);
    expect(movieIndex(input)).toBe(index);
    expect(movieIndex([...input])).not.toBe(index);
    const all = index.page(); expect(all.total).toBe(43535); expect(all.items).toHaveLength(120);
    const ids: string[] = [];
    for (let offset = 0; offset < all.total; offset += 120) ids.push(...index.page('', '', offset).items.map(item => item.id));
    expect(new Set(ids).size).toBe(all.total); expect(ids).toContain('orphan');
    expect(index.page('', 'Same title').items.map(item => item.id)).toEqual(['0', '1']);
    expect(index.page('multi').total).toBe(raw.length);
    expect(index.page('other').items.map(item => item.id)).toEqual(['12']);
    expect(index.page('12').items[0]?.id).toBe('12');
    expect(index.page('unknown').total).toBe(0);
    expect(index.page('', 'Filme 43533').items[0]?.id).toBe('43533');
    expect(index.page('0', 'Filme 43533').total).toBe(0);
  });
  it('supports accent-insensitive full search, bounded windows, shrinking catalogs and ID-based restoration', () => {
    const index = new MovieIndex([{ stream_id: 100, name: 'Ficção científica', category_id: 7 }, ...Array.from({ length: 400 }, (_, i) => ({ stream_id: i, name: `Movie ${i}`, category_id: 8 }))]);
    expect(index.page('', 'FICCAO').items[0]?.id).toBe('100');
    const restored = index.page('', '', 99999, 120, '350');
    expect(restored.offset).toBe(240); expect(restored.items.some(item => item.id === '350')).toBe(true);
    expect(index.page('', '', 99999).offset).toBe(360);
    expect(index.page('', '', -2, 9999).items).toHaveLength(120);
    for (let i = 0; i < 20; i++) expect(index.page('', `Movie ${i}`).total).toBeGreaterThan(0);
    expect(index.page('', 'Movie 399').total).toBe(1);
    expect(new MovieIndex([]).page('', '', 999)).toEqual({ items: [], total: 0, offset: 0, limit: 120 });
  });
  it('orders the full eligible catalog in both directions with missing values last, without changing membership', () => {
    const index = new MovieIndex([
      { stream_id: 1, name: 'Zulu', category_id: 'x', added: '300', year: '2020', rating: '9' },
      { stream_id: 2, name: 'Álpha', category_id: 'x', added: '100', release_date: '2025-04-03', rating: '7' },
      { stream_id: 3, name: 'Beta', category_id: 'y', added: '200', year: '2023', rating: '8' },
      { stream_id: 4, name: 'Unknown', category_id: 'x', added: '', year: '', rating: '0' }
    ]);
    const ids = (sort: string, category = '') => index.page(category, '', 0, 120, '', sort).items.map(item => item.id);
    expect(ids('title-asc')).toEqual(['2', '3', '4', '1']); expect(ids('title-desc')).toEqual(['1', '4', '3', '2']);
    expect(ids('added-asc')).toEqual(['2', '3', '1', '4']); expect(ids('added-desc')).toEqual(['1', '3', '2', '4']);
    expect(ids('release-asc')).toEqual(['1', '3', '2', '4']); expect(ids('release-desc')).toEqual(['2', '3', '1', '4']);
    expect(ids('rating-asc')).toEqual(['2', '3', '1', '4']); expect(ids('rating-desc')).toEqual(['1', '3', '2', '4']);
    expect(ids('rating-desc', 'x')).toEqual(['1', '2', '4']);
    expect(index.page('x', 'alpha', 0, 120, '', 'added-desc').items[0]?.id).toBe('2');
    expect(index.page('', '', 0, 1, '3', 'title-asc').items[0]?.id).toBe('3');
  });
});
