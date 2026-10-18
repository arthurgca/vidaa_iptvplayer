export type RemoteAction = 'NAV_UP'|'NAV_DOWN'|'NAV_LEFT'|'NAV_RIGHT'|'SELECT'|'BACK'|'OPTIONS'|'PLAY'|'PAUSE'|'STOP'|'FAST_FORWARD'|'REWIND'|'CHANNEL_UP'|'CHANNEL_DOWN';

const byCode: Record<number, RemoteAction> = {
  37: 'NAV_LEFT', 38: 'NAV_UP', 39: 'NAV_RIGHT', 40: 'NAV_DOWN', 13: 'SELECT',
  8: 'BACK', 461: 'BACK', 10009: 'BACK', 27: 'BACK',
  415: 'PLAY', 19: 'PAUSE', 413: 'STOP', 417: 'FAST_FORWARD', 412: 'REWIND',
  427: 'CHANNEL_UP', 428: 'CHANNEL_DOWN', 33: 'CHANNEL_UP', 34: 'CHANNEL_DOWN', 77: 'OPTIONS', 93: 'OPTIONS'
};

const byKey: Record<string, RemoteAction> = {
  ArrowLeft: 'NAV_LEFT', ArrowUp: 'NAV_UP', ArrowRight: 'NAV_RIGHT', ArrowDown: 'NAV_DOWN',
  Enter: 'SELECT', Escape: 'BACK', Backspace: 'BACK', Back: 'BACK', GoBack: 'BACK', BrowserBack: 'BACK', MediaPlay: 'PLAY', MediaPause: 'PAUSE',
  MediaStop: 'STOP', MediaFastForward: 'FAST_FORWARD', MediaRewind: 'REWIND', ContextMenu: 'OPTIONS', Menu: 'OPTIONS', Options: 'OPTIONS', m: 'OPTIONS', M: 'OPTIONS',
  ChannelUp: 'CHANNEL_UP', ChannelDown: 'CHANNEL_DOWN', PageUp: 'CHANNEL_UP', PageDown: 'CHANNEL_DOWN'
};

export function remoteAction(event: KeyboardEvent): RemoteAction | undefined {
  // TV runtimes can label a dedicated Back button as Backspace.
  const action = event.keyCode === 461 || event.keyCode === 10009 ? 'BACK' : byKey[event.key] || byCode[event.keyCode || event.which];
  // A held Back must not dismiss successive interaction layers.
  if (action === 'BACK' && event.repeat && !isTextDeletion(event)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
  return action;
}

/** Preserve keyboard deletion; Backspace on an empty field finishes editing. */
export function isTextDeletion(event: KeyboardEvent) {
  return event.target instanceof HTMLInputElement && event.target.value.length > 0
    && event.keyCode !== 461 && event.keyCode !== 10009
    && event.key === 'Backspace';
}

export function listenToRemote(handler: (action: RemoteAction, event: KeyboardEvent) => void) {
  const listener = (event: KeyboardEvent) => {
    const action = remoteAction(event);
    if (!action) return;
    const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
    if (editing) {
      if (isTextDeletion(event)) return;
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
