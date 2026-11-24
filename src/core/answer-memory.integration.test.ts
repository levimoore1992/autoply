import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

describe('saved application responses', () => {
  test('persists exact profile-scoped answers, respects job scope and option changes across restart', async () => {
    const home = mkdtempSync(join(tmpdir(), 'autoply-answer-memory-'));
    try {
      const script = `
        import assert from 'node:assert/strict';
        import { closeDb } from ${JSON.stringify(resolve('src/db/index.ts'))};
        import { profileRepository } from ${JSON.stringify(resolve('src/db/repositories/profile.ts'))};
        import { savedAnswersRepository as repo } from ${JSON.stringify(resolve('src/db/repositories/saved-answers.ts'))};
        import { rememberedAnswers, answerJobScope } from ${JSON.stringify(resolve('src/core/answer-memory.ts'))};
        const profile = profileRepository.create({ name: 'Test', email: 'test@example.com', skills: [], experience: [], education: [] });
        const other = profileRepository.create({ name: 'Other', email: 'other@example.com', skills: [], experience: [], education: [] });
        const job = 'https://jobs.ashbyhq.com/example/one/application';
        repo.upsert(profile.id, 'Do you have startup experience? *', 'Yes');
        repo.upsert(profile.id, 'Why this role?', 'Specific to job one', answerJobScope(job));
        repo.upsert(profile.id, 'Years using C++?', '5');
        closeDb();
        const field = { key: 'new-dom-id', type: 'radio', label: '  Do you have STARTUP experience? ', options: ['Yes', 'No'] };
        assert.deepEqual(rememberedAnswers(profile.id, [field], job), { 'new-dom-id': 'Yes' });
        assert.deepEqual(rememberedAnswers(other.id, [field], job), {});
        assert.deepEqual(rememberedAnswers(profile.id, [{...field, label:'Do you have no startup experience?'}], job), {});
        assert.deepEqual(rememberedAnswers(profile.id, [{...field, options:['1 year','2 years']}], job), {});
        assert.deepEqual(rememberedAnswers(profile.id, [{...field, currentValue:'No'}], job), {});
        assert.deepEqual(rememberedAnswers(profile.id, [{key:'why', type:'textarea', label:'Why this role?'}], job), { why: 'Specific to job one' });
        assert.deepEqual(rememberedAnswers(profile.id, [{key:'why', type:'textarea', label:'Why this role?'}], 'https://jobs.ashbyhq.com/example/two'), {});
        assert.equal(repo.findExact(profile.id, 'Years using C#?'), null);
        repo.upsert(profile.id, field.label, 'No');
        assert.equal(repo.findExact(profile.id, field.label).answer, 'No');
        assert.equal(repo.findAll(profile.id).filter(row => row.answer === 'No').length, 1);
        const {default: Fastify} = await import('fastify');
        const {registerProfileRoutes} = await import(${JSON.stringify(resolve('src/api/routes/profile.ts'))});
        const app = Fastify(); registerProfileRoutes(app);
        const save = await app.inject({method:'POST',url:'/profile/answers',payload:{field,answer:'Yes',scope:'all',url:job}});
        assert.equal(save.statusCode,200);
        const reuse = await app.inject({method:'POST',url:'/profile/map-fields',payload:{fields:[{...field,key:'future-field'}],url:job}});
        assert.equal(reuse.statusCode,200);
        assert.equal(reuse.json().fillPlan['future-field'],'Yes');
        assert.deepEqual(reuse.json().savedKeys,['future-field']);
        const invalid = await app.inject({method:'POST',url:'/profile/answers',payload:{field,answer:'Invalid option',scope:'all',url:job}});
        assert.equal(invalid.statusCode,400);
        await app.close(); closeDb();
        process.exit(0);
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
});
