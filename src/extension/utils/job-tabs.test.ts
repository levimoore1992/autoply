import { afterEach, describe, expect, test } from 'bun:test';
import type { Application } from '../../types';
import { getJobUrl, getReviewJobUrls, openJobTabs } from './job-tabs';

const originalChrome = globalThis.chrome;
afterEach(() => {
  globalThis.chrome = originalChrome;
});

const application = (url: string, status: Application['status']): Application => ({
  profile_id: 1,
  url,
  platform: 'ashby',
  company: 'Example',
  job_title: 'Engineer',
  status,
});

describe('job tabs', () => {
  test('rejects internal pages, scripts, invalid URLs, and embedded credentials', () => {
    for (const url of [
      'chrome-extension://abc/page',
      'javascript:alert(1)',
      'bad',
      'https://secret:password@example.com',
    ]) {
      expect(getJobUrl(url)).toBeUndefined();
    }
    expect(getJobUrl('https://example.com/job')).toBe('https://example.com/job');
  });

  test('selects distinct review jobs without reopening submitted, filled, or failed jobs', () => {
    expect(
      getReviewJobUrls([
        application('https://example.com/one', 'review_required'),
        application('https://example.com/one', 'pending'),
        application('https://example.com/two', 'pending'),
        ...(['submitted', 'filled', 'failed'] as const).map((status) =>
          application(`https://example.com/${status}`, status)
        ),
        application('file:///secret', 'pending'),
      ])
    ).toEqual(['https://example.com/one', 'https://example.com/two']);
  });

  test('opens each URL once and activates only the first successfully opened tab', async () => {
    const calls: chrome.tabs.CreateProperties[] = [];
    globalThis.chrome = {
      tabs: {
        create: async (options: chrome.tabs.CreateProperties) => {
          calls.push(options);
          if (options.url === 'https://example.com/fail') throw new Error('Tab failed');
          return { id: calls.length };
        },
      },
    } as unknown as typeof chrome;
    expect(
      await openJobTabs([
        'https://example.com/fail',
        'https://example.com/one',
        'https://example.com/one',
        'chrome://settings',
        'https://example.com/two',
      ])
    ).toEqual({ opened: 2, failed: 1 });
    expect(calls.map((call) => call.active)).toEqual([true, true, false]);
    expect(calls.map((call) => call.url)).toEqual([
      'https://example.com/fail',
      'https://example.com/one',
      'https://example.com/two',
    ]);
  });
});
