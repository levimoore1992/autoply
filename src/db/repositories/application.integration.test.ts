import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

describe('application source resume persistence', () => {
  test('upgrades an existing database and preserves snapshots after profile edits and restart', async () => {
    const home = mkdtempSync(join(tmpdir(), 'autoply-snapshot-test-'));
    try {
      // A child process isolates AUTOPLY_HOME from other tests and the real user database.
      const script = `
        import assert from 'node:assert/strict';
        import { getDb, closeDb } from ${JSON.stringify(resolve('src/db/index.ts'))};
        import { profileRepository } from ${JSON.stringify(resolve('src/db/repositories/profile.ts'))};
        import { applicationRepository } from ${JSON.stringify(resolve('src/db/repositories/application.ts'))};
        const profile = profileRepository.create({ name: 'Test', email: 'test@example.com', base_resume: 'Original', skills: [], experience: [], education: [] });
        const legacy = applicationRepository.create({ profile_id: profile.id, url: 'https://example.com/legacy', platform: 'generic', company: 'Example', job_title: 'Engineer', status: 'review_required', generated_resume: 'Legacy tailored' });
        getDb().exec('ALTER TABLE applications DROP COLUMN source_resume');
        getDb().run('DELETE FROM migrations WHERE name = ?', ['008_add_application_source_resume']);
        closeDb();
        assert.equal(applicationRepository.findById(legacy.id).generated_resume, 'Legacy tailored');
        assert.equal(applicationRepository.findById(legacy.id).source_resume, undefined);
        const draft = applicationRepository.create({ profile_id: profile.id, url: 'https://example.com/new', platform: 'generic', company: 'Example', job_title: 'Engineer', status: 'review_required', generated_resume: 'Tailored', source_resume: profile.base_resume });
        profileRepository.update(profile.id, { base_resume: 'Updated later' });
        applicationRepository.update(draft.id, { status: 'filled' });
        closeDb();
        assert.equal(applicationRepository.findById(draft.id).source_resume, 'Original');
        assert.equal(applicationRepository.findById(draft.id).status, 'filled');
        assert.equal(profileRepository.findById(profile.id).base_resume, 'Updated later');
        const { recordConfirmedSubmission } = await import(${JSON.stringify(resolve('src/core/submissions.ts'))});
        const tracked = applicationRepository.create({ profile_id: profile.id, url: 'https://jobs.ashbyhq.com/example/job', platform: 'ashby', company: 'Example', job_title: 'Engineer', status: 'review_required' });
        const confirmed = recordConfirmedSubmission(tracked.url + '/application', 'Your application was successfully submitted');
        assert.equal(confirmed.status, 'submitted');
        assert.ok(confirmed.applied_at);
        assert.equal(recordConfirmedSubmission(tracked.url, 'Your application was successfully submitted').applied_at, confirmed.applied_at);
        assert.equal(recordConfirmedSubmission('https://jobs.ashbyhq.com/example/other', 'Your application was submitted'), null);
        assert.equal(applicationRepository.findById(draft.id).status, 'filled');
        assert.throws(() => recordConfirmedSubmission(tracked.url, 'Submit Application'));
        closeDb();
      `;
      const process = Bun.spawn([Bun.argv[0], '-e', script], {
        env: { ...Bun.env, AUTOPLY_HOME: home },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const error = await new Response(process.stderr).text();
      expect(await process.exited, error).toBe(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
