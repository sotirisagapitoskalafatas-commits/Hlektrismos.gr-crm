export type QueuedActionKind = 'check_in' | 'check_out' | 'photo' | 'note';

export type QueuedAction = {
  id: string;
  kind: QueuedActionKind;
  payload: Record<string, unknown>;
  createdAt: string;
};

const KEY = 'atlas.offline.queue';

function read(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

function write(list: QueuedAction[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full or unavailable */ }
}

export function enqueue(kind: QueuedActionKind, payload: Record<string, unknown>): QueuedAction {
  const action: QueuedAction = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    payload,
    createdAt: new Date().toISOString(),
  };
  write([...read(), action]);
  return action;
}

export function listQueue(): QueuedAction[] {
  return read();
}

export function removeQueued(id: string): void {
  write(read().filter(a => a.id !== id));
}

export function clearQueue(): void {
  write([]);
}

export function countQueue(): number {
  return read().length;
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}