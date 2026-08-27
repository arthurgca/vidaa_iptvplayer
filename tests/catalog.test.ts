import { describe, expect, it } from 'vitest';
import { catalogCategoryFocusKey, catalogItemFocusKey } from '../src/screens/catalogFocus';

describe('catalog focus identity', () => {
  it('gives repeated movies and series a unique focus target without changing their media ID', () => {
    expect(catalogItemFocusKey('movies', '', '42', 0)).not.toBe(catalogItemFocusKey('movies', '', '42', 1));
    expect(catalogItemFocusKey('series', 'fantasy', '7', 0)).not.toBe(catalogItemFocusKey('series', 'subtitled', '7', 0));
  });

  it('keeps duplicate provider categories independently selectable', () => {
    expect(catalogCategoryFocusKey('movies', '9', 0)).not.toBe(catalogCategoryFocusKey('movies', '9', 1));
  });
});
