import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

describe('page-based document generation', () => {
  test('generates a real PDF for Greenhouse and generic pages without the missing Playwright browser', async () => {
    const home = mkdtempSync(join(tmpdir(), 'autoply-page-job-'));
    try {
      const script = `
        import assert from 'node:assert/strict';
        import { readFileSync } from 'node:fs';
        import { mock } from 'bun:test';
        const description = 'Build scalable distributed systems using Python and SQL. Design data pipelines with Kafka and Spark. Work with engineering to maintain reliable production services.';
        const job = { isJobPosting: true, title: 'Data Engineer', company: 'Example', description, requirements: ['Kafka', 'Spark'], qualifications: [] };
        const providerPath = ${JSON.stringify(resolve('src/ai/provider.ts'))};
        const originalProvider = await import(providerPath);
        mock.module(providerPath, () => ({ ...originalProvider, createAIProvider: () => ({ name: 'openai', isAvailable: async () => true, generateText: async () => JSON.stringify(job) }) }));
        const resumePath = ${JSON.stringify(resolve('src/ai/resume.ts'))};
        const originalResume = await import(resumePath);
        let tailored = 0;
        mock.module(resumePath, () => ({ ...originalResume, tailorResume: async (_provider, profile, extracted) => {
          assert.equal(profile.base_resume, 'Original candidate resume');
          assert.equal(extracted.description, description);
          assert.deepEqual(extracted.requirements, ['Kafka', 'Spark']);
          tailored++;
          return '# Test Candidate\\n\\n## Qualifications\\n- Built data pipelines with Kafka.';
        } }));
        const { profileRepository } = await import(${JSON.stringify(resolve('src/db/repositories/profile.ts'))});
        const { applicationRepository } = await import(${JSON.stringify(resolve('src/db/repositories/application.ts'))});
        const { applicationOrchestrator } = await import(${JSON.stringify(resolve('src/core/application.ts'))});
        const profile = profileRepository.create({ name: 'Test Candidate', email: 'test@example.com', base_resume: 'Original candidate resume', skills: [], experience: [], education: [] });
        for (const url of ['https://job-boards.greenhouse.io/attentive/jobs/4519138009', 'https://example.com/careers/role']) {
          const result = await applicationOrchestrator.generateDocuments(url, process.env.AUTOPLY_HOME, 'resume', { url, title: 'Data Engineer', text: description });
          assert.equal(readFileSync(result.resumePath).subarray(0, 4).toString(), '%PDF');
          assert.equal(result.sourceResume, 'Original candidate resume');
          assert.ok(result.resumeContent.includes('Qualifications'));
        }
        assert.equal(tailored, 2);
        assert.equal(applicationRepository.findAll().length, 0);
        assert.equal(profileRepository.findById(profile.id).base_resume, 'Original candidate resume');
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
