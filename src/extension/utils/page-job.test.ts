import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

describe('active job capture guards', () => {
  test('uses accessible embedded metadata and rejects navigation or missing access', async () => {
    const home = mkdtempSync(join(tmpdir(), 'autoply-capture-test-'));
    try {
      const script = `
        import assert from 'node:assert/strict';
        const { readActiveJobPage } = await import(${JSON.stringify(resolve('src/extension/utils/page-job.ts'))});
        const url = 'https://example.com/careers/123';
        const main = { url, title: 'Apply', text: 'Application form' };
        const embedded = { url: 'https://jobs.ashbyhq.com/example/123', title: 'Engineer', text: 'Full job description', structuredJob: { title: 'Engineer', company: 'Example', description: 'Full job description' } };
        let currentUrl = url;
        let denied = false;
        globalThis.chrome = { tabs: { query: async () => [{ id: 1, url: currentUrl }], get: async () => ({ url: currentUrl }) }, scripting: { executeScript: async ({ target }) => {
          if (denied) throw new Error('No permission');
          return target.allFrames ? [{ frameId: 0, result: main }, { frameId: 1, result: embedded }] : [{ frameId: 0, result: main }];
        } } };
        const source = await readActiveJobPage(url);
        assert.equal(source.url, url);
        assert.equal(source.structuredJob.company, 'Example');
        currentUrl = 'https://example.com/careers/other';
        await assert.rejects(() => readActiveJobPage(url), /active job changed/);
        currentUrl = url; denied = true;
        await assert.rejects(() => readActiveJobPage(url), /toolbar icon/);
        denied = false;
        chrome.tabs.get = async () => ({ url: 'https://example.com/careers/other' });
        await assert.rejects(() => readActiveJobPage(url), /navigated/);
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
