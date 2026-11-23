type Pending = Record<string, { url: string; confirmation: string }>;
interface SubmissionStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
}
const STORAGE_KEY = 'autoply_pending_submissions';
const SYNCED_KEY = 'autoply_synced_submissions';

/** Persist confirmations before sending, and retain them when the API is unavailable. */
export function createSubmissionSync(
  storage: SubmissionStorage,
  report: (entry: Pending[string]) => Promise<void>
) {
  let work = Promise.resolve();
  const serialize = (action: () => Promise<void>) => {
    work = work.catch(() => {}).then(action);
    return work;
  };
  const flushPending = async () => {
    const pending = ((await storage.get(STORAGE_KEY))[STORAGE_KEY] || {}) as Pending;
    const synced = ((await storage.get(SYNCED_KEY))[SYNCED_KEY] || {}) as Record<string, boolean>;
    for (const [key, entry] of Object.entries(pending)) {
      try {
        await report(entry);
        synced[key] = true;
        delete pending[key];
      } catch {
        /* Retry on the next browser or side-panel wakeup. */
      }
    }
    await storage.set({ [STORAGE_KEY]: pending, [SYNCED_KEY]: synced });
  };
  return {
    flush: () => serialize(flushPending),
    enqueue: (entry: Pending[string]) =>
      serialize(async () => {
        const synced = ((await storage.get(SYNCED_KEY))[SYNCED_KEY] || {}) as Record<
          string,
          boolean
        >;
        if (synced[entry.url]) return;
        const pending = ((await storage.get(STORAGE_KEY))[STORAGE_KEY] || {}) as Pending;
        pending[entry.url] = entry;
        await storage.set({ [STORAGE_KEY]: pending });
        await flushPending();
      }),
  };
}
