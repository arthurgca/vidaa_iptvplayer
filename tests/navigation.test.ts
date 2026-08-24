import { describe, expect, it } from 'vitest';
import { popEntry, pushEntry } from '../src/navigation/RouteStack';

it('pops routes and restores the focus saved by the previous screen', () => {
  let stack = [{ value: 'movies' }];
  stack = pushEntry(stack, 'details', 'movie:42');
  stack = pushEntry(stack, 'player', 'details:play');
  let result = popEntry(stack);
  expect(result.stack[result.stack.length - 1]?.value).toBe('details');
  expect(result.restoreFocus).toBe('details:play');
  result = popEntry(result.stack);
  expect(result.stack[result.stack.length - 1]?.value).toBe('movies');
  expect(result.restoreFocus).toBe('movie:42');
});
