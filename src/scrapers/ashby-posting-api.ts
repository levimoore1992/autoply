import { z } from 'zod';
import type { JobData } from '../types';

const PostingSchema = z.object({
  title: z.string().min(1),
  jobUrl: z.string().url(),
  descriptionPlain: z.string().min(1),
  location: z.string().optional(),
  employmentType: z.string().optional(),
  isRemote: z.boolean().optional(),
});

/** Read an Ashby posting without launching a second browser.
 * API contract: https://developers.ashbyhq.com/docs/public-job-posting-api
 */
export async function loadAshbyPosting(
  url: string,
  request: (url: string, init?: RequestInit) => Promise<Response> = fetch
): Promise<JobData> {
  const parsed = new URL(url);
  const [board, postingId] = parsed.pathname.split('/').filter(Boolean);
  if (parsed.hostname !== 'jobs.ashbyhq.com' || !board || !postingId || !/^[\w-]+$/.test(board)) {
    throw new Error('Invalid Ashby posting URL');
  }
  const canonical = `https://jobs.ashbyhq.com/${board}/${postingId}`;
  const response = await request(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`,
    {
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) throw new Error(`Ashby job board request failed (${response.status})`);
  const data = z.object({ jobs: z.array(PostingSchema) }).parse(await response.json());
  const posting = data.jobs.find(
    (job) => new URL(job.jobUrl).pathname.replace(/\/$/, '') === `/${board}/${postingId}`
  );
  if (!posting) throw new Error('This job is no longer listed on the Ashby job board');
  return {
    url: canonical,
    platform: 'ashby',
    title: posting.title,
    company: board
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' '),
    description: posting.descriptionPlain,
    location: posting.location,
    remote: posting.isRemote,
    job_type: posting.employmentType,
    requirements: [],
    qualifications: [],
    form_fields: [],
    custom_questions: [],
  };
}
