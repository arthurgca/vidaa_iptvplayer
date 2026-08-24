export type RemoteAction = 'NAV_UP'|'NAV_DOWN'|'NAV_LEFT'|'NAV_RIGHT'|'SELECT'|'BACK'|'PLAY'|'PAUSE'|'STOP'|'FAST_FORWARD'|'REWIND'|'CHANNEL_UP'|'CHANNEL_DOWN';

const byCode: Record<number, RemoteAction> = {
  37: 'NAV_LEFT', 38: 'NAV_UP', 39: 'NAV_RIGHT', 40: 'NAV_DOWN', 13: 'SELECT',
  8: 'BACK', 461: 'BACK', 10009: 'BACK', 27: 'BACK',
  415: 'PLAY', 19: 'PAUSE', 413: 'STOP', 417: 'FAST_FORWARD', 412: 'REWIND',
  427: 'CHANNEL_UP', 428: 'CHANNEL_DOWN'
};

const byKey: Record<string, RemoteAction> = {
  ArrowLeft: 'NAV_LEFT', ArrowUp: 'NAV_UP', ArrowRight: 'NAV_RIGHT', ArrowDown: 'NAV_DOWN',
  Enter: 'SELECT', Escape: 'BACK', Backspace: 'BACK', MediaPlay: 'PLAY', MediaPause: 'PAUSE',
  MediaStop: 'STOP', MediaFastForward: 'FAST_FORWARD', MediaRewind: 'REWIND'
};

export function remoteAction(event: KeyboardEvent): RemoteAction | undefined {
  return byKey[event.key] || byCode[event.keyCode || event.which];
}

export function listenToRemote(handler: (action: RemoteAction, event: KeyboardEvent) => void) {
  const listener = (event: KeyboardEvent) => {
    const action = remoteAction(event);
    if (!action) return;
    const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
    if (editing) {
      if (action === 'BACK') {
        event.preventDefault();
        const control = event.target as HTMLElement;
        control.blur();
        control.closest<HTMLElement>('[data-focus-proxy]')?.focus();
      }
      return;
    }
    event.preventDefault();
    handler(action, event);
  };
  document.addEventListener('keydown', listener, false);
  return () => document.removeEventListener('keydown', listener, false);
}
