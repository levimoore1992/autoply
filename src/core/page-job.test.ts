import { describe, expect, test } from 'bun:test';
import { jobFromPage } from './page-job';
import type { AIProvider } from '../types';
import type { PageJobSource } from '../types/page-job';

const url = 'https://job-boards.greenhouse.io/attentive/jobs/4519138009';
const description =
  'Build scalable distributed systems. Design and maintain data pipelines with Python, SQL, Kafka, and Spark. Collaborate with the engineering team to maintain production services.';
const source: PageJobSource = { url, title: 'Software Engineer at Example', text: description };
const provider = (response: unknown): AIProvider => ({
  name: 'openai',
  isAvailable: async () => true,
  generateText: async () => (typeof response === 'string' ? response : JSON.stringify(response)),
});

describe('current-page job description', () => {
  test('uses structured JobPosting data without a scraper or an extraction AI request', async () => {
    const ai = provider({});
    ai.generateText = async () => {
      throw new Error('Should not extract again');
    };
    const result = await jobFromPage(ai, url, {
      ...source,
      structuredJob: { title: 'Data Engineer', company: 'Example', description },
    });
    expect(result.description).toBe(description);
    expect(result.platform).toBe('greenhouse');
    expect(result.title).toBe('Data Engineer');
  });
  test('extracts a job from a generic site and preserves its requirements for tailoring', async () => {
    const genericUrl = 'https://example.com/careers/123';
    const result = await jobFromPage(
      provider({
        isJobPosting: true,
        title: 'Engineer',
        company: 'Example',
        description,
        requirements: ['Kafka'],
        qualifications: ['Spark'],
      }),
      genericUrl,
      { ...source, url: genericUrl }
    );
    expect(result.platform).toBe('generic');
    expect(result.requirements).toEqual(['Kafka']);
    expect(result.qualifications).toEqual(['Spark']);
  });
  test('rejects a snapshot from another job before invoking AI', async () => {
    const ai = provider({});
    ai.generateText = async () => {
      throw new Error('Should not call AI');
    };
    await expect(jobFromPage(ai, url, { ...source, url: url + '0' })).rejects.toThrow(
      'different page'
    );
  });
  test('rejects forms, job lists, incomplete metadata and malformed AI output', async () => {
    for (const response of [
      { isJobPosting: false },
      { isJobPosting: true, title: 'Engineer', company: 'Example', description: 'Apply now' },
      'not JSON',
    ]) {
      await expect(jobFromPage(provider(response), url, source)).rejects.toThrow();
    }
    await expect(
      jobFromPage(provider({}), url, { ...source, text: 'First Name Email Resume Submit' })
    ).rejects.toThrow();
  });
  test('keeps page text in the data prompt and instructions in the system prompt', async () => {
    const ai = provider({});
    ai.generateText = async (prompt, system) => {
      expect(system).toContain('untrusted data');
      expect(prompt).toContain(description);
      return JSON.stringify({
        isJobPosting: true,
        title: 'Engineer',
        company: 'Example',
        description,
      });
    };
    expect((await jobFromPage(ai, url, source)).url).toBe(url);
  });
});
