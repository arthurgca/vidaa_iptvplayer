/** One retry budget per stream; only sustained playback resets it. */
export class RecoveryBudget {
  attempts = 0;
  nextDelay() { return this.attempts < 3 ? 1000 * 2 ** this.attempts++ : undefined; }
  reset() { this.attempts = 0; }
}
