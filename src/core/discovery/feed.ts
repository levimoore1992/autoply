import { z } from 'zod';
import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { join } from 'path';
import { getAutoplyDir } from '../../db';
import type { DiscoveredJob } from '../../types/discovery';

const HOUR = 60 * 60 * 1000;
const FEED_URL = 'https://jobicy.com/api/jobs?count=100';
const JobSchema = z.object({
  id: z.union([z.string(), z.number()]),
  url: z.string().url(),
  jobTitle: z.string(),
  companyName: z.string(),
  jobGeo: z.string(),
  jobType: z.array(z.string()).default([]),
  jobDescription: z.string(),
  pubDate: z.string(),
});
const FeedSchema = z.object({ jobs: z.array(z.unknown()) });
const SnapshotSchema = z.object({ fetchedAt: z.number(), jobs: z.array(JobSchema) });
type Snapshot = z.infer<typeof SnapshotSchema>;

function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Math.min(Number(code), 0x10ffff))
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Only accept canonical listing links from the feed provider. */
export function isJobicyListing(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'jobicy.com' &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^\/jobs\/[^/]+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

/** Hourly disk cache survives API restarts and coalesces concurrent searches. */
export class PublicJobFeed {
  private pending?: Promise<{ jobs: DiscoveredJob[]; fetchedAt: string; stale: boolean }>;
  private lastAttempt = 0;
  constructor(
    private readonly directory = getAutoplyDir(),
    private readonly fetchFeed: (url: string, options?: RequestInit) => Promise<Response> = fetch
  ) {}

  async load(): Promise<{ jobs: DiscoveredJob[]; fetchedAt: string; stale: boolean }> {
    if (this.pending) return this.pending;
    this.pending = this.loadSnapshot().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async loadSnapshot() {
    const path = join(this.directory, 'public-jobs.json');
    let cached: Snapshot | undefined;
    try {
      cached = SnapshotSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    } catch {
      /* No usable cache. */
    }
    const now = Date.now();
    const fresh = cached && now - cached.fetchedAt < HOUR;
    let stale = false;
    if (!fresh) {
      try {
        if (now - this.lastAttempt < HOUR)
          throw new Error('Feed refresh unavailable; try again in an hour.');
        this.lastAttempt = now;
        const response = await this.fetchFeed(FEED_URL, {
          signal: AbortSignal.timeout(60_000),
          redirect: 'error',
        });
        if (!response.ok) throw new Error(`Job feed returned ${response.status}`);
        const body = await response.text();
        if (body.length > 5_000_000) throw new Error('Job feed response too large');
        const raw = FeedSchema.parse(JSON.parse(body));
        const jobs = raw.jobs.flatMap((job) => {
          const parsed = JobSchema.safeParse(job);
          return parsed.success && isJobicyListing(parsed.data.url) ? [parsed.data] : [];
        });
        if (raw.jobs.length && !jobs.length) throw new Error('Job feed format changed');
        cached = { fetchedAt: now, jobs };
        await mkdir(this.directory, { recursive: true });
        await writeFile(`${path}.tmp`, JSON.stringify(cached));
        await rename(`${path}.tmp`, path);
      } catch (error) {
        if (!cached) throw error;
        stale = true;
      }
    }
    if (!cached) throw new Error('No job feed available');
    return {
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
      stale,
      jobs: cached.jobs.map(
        (job): DiscoveredJob => ({
          id: String(job.id),
          url: job.url,
          title: plainText(job.jobTitle),
          company: plainText(job.companyName),
          location: plainText(job.jobGeo),
          jobType: job.jobType,
          description: plainText(job.jobDescription),
          publishedAt: job.pubDate,
        })
      ),
    };
  }
}

export const publicJobFeed = new PublicJobFeed();
