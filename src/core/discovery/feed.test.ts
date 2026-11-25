import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PublicJobFeed, isJobicyListing } from './feed';

const listing = {
  id: 123,
  url: 'https://jobicy.com/jobs/123-engineer',
  jobTitle: 'Software &amp; Systems Engineer',
  companyName: 'Example',
  jobGeo: 'USA',
  jobType: ['Full-Time'],
  jobDescription: '<p>Build software</p>',
  pubDate: '2026-11-23',
};

describe('public feed cache', () => {
  test('validates URLs, sanitizes text, coalesces requests, and persists hourly cache across instances', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'autoply-feed-'));
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return Response.json({ jobs: [listing, { ...listing, url: 'https://evil.example/jobs/1' }] });
    };
    try {
      const feed = new PublicJobFeed(directory, fetcher);
      const [first, second] = await Promise.all([feed.load(), feed.load()]);
      expect(calls).toBe(1);
      expect(first.jobs).toHaveLength(1);
      expect(first.jobs[0].title).toBe('Software & Systems Engineer');
      expect(first.jobs[0].description).toBe('Build software');
      expect(second).toEqual(first);
      expect(await new PublicJobFeed(directory, fetcher).load()).toEqual(first);
      expect(calls).toBe(1);
      const path = join(directory, 'public-jobs.json');
      const snapshot = JSON.parse(await readFile(path, 'utf8'));
      snapshot.fetchedAt -= 3_600_001;
      await writeFile(path, JSON.stringify(snapshot));
      const unavailable = async () => {
        throw new Error('offline');
      };
      const stale = await new PublicJobFeed(directory, unavailable).load();
      expect(stale.stale).toBe(true);
      expect(stale.jobs).toEqual(first.jobs);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  test('rejects failure without cache rather than returning a successful empty search', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'autoply-feed-'));
    try {
      const fetcher = async () => Response.json({ unexpected: [] });
      await expect(new PublicJobFeed(directory, fetcher).load()).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  test('rejects misleading hosts, credentials, and non-listing URLs', () => {
    expect(isJobicyListing(listing.url)).toBe(true);
    for (const value of [
      'https://jobicy.com.evil.example/jobs/1',
      'javascript:alert(1)',
      'https://user@jobicy.com/jobs/1',
      'https://jobicy.com/',
    ])
      expect(isJobicyListing(value)).toBe(false);
  });
});
