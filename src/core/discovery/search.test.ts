import { describe, expect, test } from 'bun:test';
import { isUsEligible, searchPublicJobs } from './search';
import type { DiscoveredJob } from '../../types/discovery';

const job = (changes: Partial<DiscoveredJob> = {}): DiscoveredJob => ({
  id: '1',
  url: 'https://jobicy.com/jobs/1-software-engineer',
  title: 'Senior Software Developer',
  company: 'Example',
  location: 'USA',
  jobType: ['Full-Time'],
  description: 'Software engineer with Python experience',
  publishedAt: '2026-11-23',
  ...changes,
});

describe('public job search', () => {
  test('matches role aliases in titles without treating description mentions as a matching role', () => {
    expect(
      searchPublicJobs(
        [
          job(),
          job({ id: '2', url: 'https://jobicy.com/jobs/2-marketing', title: 'Marketing Manager' }),
        ],
        'software engineer',
        'us'
      )
    ).toHaveLength(1);
    expect(
      searchPublicJobs([job({ title: 'Senior Back-End Developer' })], 'backend engineer', 'us')
    ).toHaveLength(1);
    expect(searchPublicJobs([job()], 'remote jobs', 'us')).toHaveLength(0);
    expect(searchPublicJobs([job()], 'java engineer', 'us')).toHaveLength(0);
  });
  test('respects explicit geography rather than confusing remote with worldwide eligibility', () => {
    for (const location of ['USA', 'Canada, USA', 'United States', 'Anywhere', 'Worldwide'])
      expect(isUsEligible(location)).toBe(true);
    for (const location of ['Australia', 'Austria', 'Europe', 'APAC', 'Canada'])
      expect(isUsEligible(location)).toBe(false);
    expect(searchPublicJobs([job({ location: 'Europe' })], 'software engineer', 'us')).toHaveLength(
      0
    );
    expect(
      searchPublicJobs([job({ location: 'Europe' })], 'software engineer', 'all')
    ).toHaveLength(1);
  });
  test('excludes tracked URLs, repeat feed items, and excluded companies', () => {
    expect(searchPublicJobs([job(), job()], 'software engineer', 'us')).toHaveLength(1);
    expect(
      searchPublicJobs([job()], 'software engineer', 'us', [job().url + '?ref=test'])
    ).toHaveLength(0);
    expect(searchPublicJobs([job()], 'software engineer', 'us', [], ['EXAMPLE'])).toHaveLength(0);
  });
});
