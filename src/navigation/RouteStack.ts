export interface StackEntry<T> { value: T; restoreFocus?: string }
export function pushEntry<T>(stack: StackEntry<T>[], value: T, focused: string): StackEntry<T>[] {
  if (!stack.length) return [{ value }];
  return [...stack.slice(0, -1), { ...stack[stack.length - 1]!, restoreFocus: focused }, { value }];
}
export function popEntry<T>(stack: StackEntry<T>[]): { stack: StackEntry<T>[]; restoreFocus?: string } {
  if (stack.length <= 1) return { stack };
  const next = stack.slice(0, -1);
  return { stack: next, restoreFocus: next[next.length - 1]?.restoreFocus };
}
