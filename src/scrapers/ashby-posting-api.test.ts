import { describe, expect, test } from 'bun:test';
import { loadAshbyPosting } from './ashby-posting-api';

describe('Ashby posting API', () => {
  test('loads the matching posting from overview or application URLs without a browser', async () => {
    const urls: string[] = [];
    const request = async (url: string) => {
      urls.push(url);
      return Response.json({
        jobs: [
          {
            title: 'Other',
            jobUrl: 'https://jobs.ashbyhq.com/example/other',
            descriptionPlain: 'Other job',
          },
          {
            title: 'Engineer',
            jobUrl: 'https://jobs.ashbyhq.com/example/target',
            descriptionPlain: 'Full description',
            isRemote: true,
          },
        ],
      });
    };
    const job = await loadAshbyPosting(
      'https://jobs.ashbyhq.com/example/target/application?source=test',
      request
    );
    expect(job.url).toBe('https://jobs.ashbyhq.com/example/target');
    expect(job.title).toBe('Engineer');
    expect(job.description).toBe('Full description');
    expect(job.remote).toBe(true);
    expect(urls).toEqual(['https://api.ashbyhq.com/posting-api/job-board/example']);
  });
  test('rejects other hosts and reports missing jobs or API failures', async () => {
    await expect(loadAshbyPosting('https://evil.example/example/id')).rejects.toThrow(
      'Invalid Ashby'
    );
    await expect(
      loadAshbyPosting('https://jobs.ashbyhq.com/example/id', async () =>
        Response.json({ jobs: [] })
      )
    ).rejects.toThrow('no longer listed');
    await expect(
      loadAshbyPosting(
        'https://jobs.ashbyhq.com/example/id',
        async () => new Response('', { status: 503 })
      )
    ).rejects.toThrow('(503)');
  });
});
