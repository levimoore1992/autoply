import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { publicJobFeed } from '../../core/discovery/feed';
import { listingKey, searchPublicJobs } from '../../core/discovery/search';
import { applicationRepository } from '../../db/repositories/application';
import { profileRepository } from '../../db/repositories/profile';
import { savePublicPosting } from '../../db/repositories/job-posting';
import { getDb } from '../../db';

const SearchSchema = z.object({
  query: z.string().trim().min(2).max(120),
  region: z.enum(['us', 'all']).default('us'),
});
const AddSchema = z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(50) });

/** Search real public listings and explicitly queue selected jobs for human review. */
export function registerDiscoveryRoutes(app: FastifyInstance): void {
  app.post('/jobs/discover', async (request, reply) => {
    const parsed = SearchSchema.safeParse(request.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: 'Enter a job title (2–120 characters) and a valid region.' });
    const profile = profileRepository.findFirst();
    if (!profile?.id) return reply.code(400).send({ error: 'Create a profile first.' });
    const profileId = profile.id;
    try {
      const snapshot = await publicJobFeed.load();
      const tracked = applicationRepository.findAll({ profile_id: profileId });
      return {
        ...snapshot,
        source: 'Jobicy',
        total: snapshot.jobs.length,
        jobs: searchPublicJobs(
          snapshot.jobs,
          parsed.data.query,
          parsed.data.region,
          tracked.map((job) => job.url),
          profile.preferences?.excluded_companies
        ),
      };
    } catch {
      return reply
        .code(502)
        .send({ error: 'The public job feed is unavailable. Please try again later.' });
    }
  });

  app.post('/jobs/discover/add', async (request, reply) => {
    const parsed = AddSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Select between 1 and 50 jobs.' });
    const profile = profileRepository.findFirst();
    if (!profile?.id) return reply.code(400).send({ error: 'Create a profile first.' });
    const profileId = profile.id;
    try {
      const snapshot = await publicJobFeed.load();
      const selected = [...new Set(parsed.data.ids)].map((id) =>
        snapshot.jobs.find((job) => job.id === id)
      );
      if (selected.some((job) => !job))
        return reply.code(409).send({ error: 'A listing is no longer in the feed. Search again.' });
      const result = getDb().transaction(() => {
        const tracked = new Set(
          applicationRepository
            .findAll({ profile_id: profileId })
            .map((application) => listingKey(application.url))
        );
        let added = 0;
        let skipped = 0;
        for (const job of selected) {
          if (!job) continue;
          if (tracked.has(listingKey(job.url))) {
            skipped++;
            continue;
          }
          savePublicPosting({
            ...job,
            platform: 'generic',
            remote: true,
            requirements: [],
            qualifications: [],
            form_fields: [],
            custom_questions: [],
          });
          applicationRepository.create({
            profile_id: profileId,
            url: job.url,
            platform: 'generic',
            company: job.company,
            job_title: job.title,
            status: 'review_required',
          });
          tracked.add(listingKey(job.url));
          added++;
        }
        return { added, skipped };
      })();
      return result;
    } catch {
      return reply.code(502).send({ error: 'Could not add listings. Please retry.' });
    }
  });
}
