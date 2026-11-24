import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

test('discovery queues validated real listings once and preserves metadata for resume generation', async () => {
  const home = mkdtempSync(join(tmpdir(), 'autoply-discovery-'));
  try {
    const script = `
      import assert from 'node:assert/strict';
      import { writeFileSync } from 'node:fs';
      import Fastify from 'fastify';
      import { registerDiscoveryRoutes } from ${JSON.stringify(resolve('src/api/routes/discovery.ts'))};
      import { profileRepository } from ${JSON.stringify(resolve('src/db/repositories/profile.ts'))};
      import { applicationRepository } from ${JSON.stringify(resolve('src/db/repositories/application.ts'))};
      import { findPublicPosting } from ${JSON.stringify(resolve('src/db/repositories/job-posting.ts'))};
      const profile = profileRepository.create({ name: 'Test', email: 'test@example.com', skills: [], experience: [], education: [] });
      const url = 'https://jobicy.com/jobs/123-software-engineer';
      writeFileSync(process.env.AUTOPLY_HOME + '/public-jobs.json', JSON.stringify({ fetchedAt: Date.now(), jobs: [
        { id: 123, url, jobTitle: 'Software Engineer', companyName: 'Example', jobGeo: 'USA', jobType: ['Full-Time'], jobDescription: '<p>Requires Python and SQL</p>', pubDate: '2026-11-23' }
      ] }));
      const app = Fastify(); registerDiscoveryRoutes(app);
      const search = () => app.inject({ method: 'POST', url: '/jobs/discover', payload: { query: 'software engineer' } });
      assert.equal((await search()).json().jobs.length, 1);
      assert.equal((await app.inject({ method: 'POST', url: '/jobs/discover', payload: { query: '' } })).statusCode, 400);
      assert.equal((await app.inject({ method: 'POST', url: '/jobs/discover/add', payload: { ids: ['forged'] } })).statusCode, 409);
      const add = () => app.inject({ method: 'POST', url: '/jobs/discover/add', payload: { ids: ['123', '123'], description: 'forged' } });
      const results = await Promise.all([add(), add()]);
      assert.equal(results.reduce((sum, result) => sum + result.json().added, 0), 1);
      const applications = applicationRepository.findAll({ profile_id: profile.id });
      assert.equal(applications.length, 1);
      assert.equal(applications[0].status, 'review_required');
      assert.equal(applications[0].generated_resume, undefined);
      assert.equal(findPublicPosting(url).description, 'Requires Python and SQL');
      assert.equal((await search()).json().jobs.length, 0);
      applicationRepository.update(applications[0].id, { status: 'submitted' });
      assert.equal((await search()).json().jobs.length, 0);
      assert.equal((await add()).json().skipped, 1);
      applicationRepository.delete(applications[0].id);
      applicationRepository.create({ profile_id: profile.id, url: url + '?ref=source', platform: 'generic', company: 'Example', job_title: 'Software Engineer', status: 'submitted' });
      assert.equal((await add()).json().skipped, 1);
      assert.equal((await search()).json().jobs.length, 0);
      await app.close();
    `;
    const child = Bun.spawn([Bun.argv[0], '-e', script], {
      env: { ...Bun.env, AUTOPLY_HOME: home },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const error = await new Response(child.stderr).text();
    expect(await child.exited, error).toBe(0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
