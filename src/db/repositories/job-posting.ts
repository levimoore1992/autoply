import { getDb } from '../index';
import type { JobData } from '../../types';

/** Persist selected public listings so document generation can use their full description. */
export function savePublicPosting(job: JobData): void {
  getDb().run(
    `INSERT INTO job_postings (url, platform, title, company, description, location)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(url) DO UPDATE SET
    title=excluded.title, company=excluded.company, description=excluded.description,
    location=excluded.location, scraped_at=CURRENT_TIMESTAMP`,
    [job.url, job.platform, job.title, job.company, job.description, job.location ?? null]
  );
}

/** Retrieve a previously selected public listing for resume tailoring. */
export function findPublicPosting(url: string): JobData | null {
  const row = getDb()
    .query<
      { title: string; company: string; description: string; location: string },
      [string]
    >('SELECT title, company, description, location FROM job_postings WHERE url = ?')
    .get(url);
  return row
    ? {
        ...row,
        url,
        platform: 'generic',
        remote: true,
        requirements: [],
        qualifications: [],
        form_fields: [],
        custom_questions: [],
      }
    : null;
}
