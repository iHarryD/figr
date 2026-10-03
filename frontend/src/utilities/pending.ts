type Entry = { resolve: (data: unknown) => void; reject: (err: Error) => void };
const _pending = new Map<string, Entry>();

export const registerPending = (id: string, cb: (data: unknown) => void): void => {
  _pending.set(id, { resolve: cb, reject: () => {} });
};

export const resolvePending = (id: string, data: unknown): void => {
  const entry = _pending.get(id);
  if (entry) { _pending.delete(id); entry.resolve(data); }
};

export const rejectPending = (id: string, err: Error): void => {
  const entry = _pending.get(id);
  if (entry) { _pending.delete(id); entry.reject(err); }
};

export const sendRequest = <T>(
  win: Window,
  msg: { id: string },
  timeoutMs = 5000,
): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(msg.id);
      reject(new Error('Request timed out'));
    }, timeoutMs);
    _pending.set(msg.id, {
      resolve: (data) => { clearTimeout(timer); resolve(data as T); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });
    win.postMessage(msg, '*');
  });
