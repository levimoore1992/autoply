import { describe, expect, test } from 'bun:test';
import { createSubmissionSync } from './submission-sync';

describe('submission sync', () => {
  test('retains offline confirmations across worker restarts and retries without losing concurrent jobs', async () => {
    let saved: Record<string, unknown> = {};
    const storage = {
      get: async () => structuredClone(saved),
      set: async (value: Record<string, unknown>) => {
        saved = structuredClone(value);
      },
    };
    const offline = createSubmissionSync(storage, async () => {
      throw new Error('Engine offline');
    });
    await Promise.all(
      ['one', 'two'].map((id) =>
        offline.enqueue({
          url: `https://jobs.ashbyhq.com/example/${id}`,
          confirmation: 'Your application was submitted',
        })
      )
    );
    expect(Object.keys(saved.autoply_pending_submissions as object)).toHaveLength(2);
    const sent: string[] = [];
    const online = createSubmissionSync(storage, async (entry) => {
      sent.push(entry.url);
    });
    await online.flush();
    await online.flush();
    await online.enqueue({ url: sent[0], confirmation: 'Your application was submitted' });
    expect(sent).toHaveLength(2);
    expect(saved.autoply_pending_submissions).toEqual({});
  });
});
