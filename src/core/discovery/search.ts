import type { DiscoveredJob } from '../../types/discovery';

const normalize = (value: string) =>
  value.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
const aliases = (value: string) =>
  normalize(value)
    .replace(/\bdeveloper\b/g, 'engineer')
    .replace(/\bfull ?stack\b/g, 'fullstack')
    .replace(/\bfront ?end\b/g, 'frontend')
    .replace(/\bback ?end\b/g, 'backend');

/** Ignore tracking parameters and trailing slashes when comparing listing URLs. */
export function listingKey(url: string): string {
  return url.split(/[?#]/)[0].replace(/\/$/, '');
}

/** US searches include explicitly US-eligible and worldwide listings. */
export function isUsEligible(location: string): boolean {
  return /(?:\bUnited States\b|\bUSA\b|\bUS\b|\bU\.S\.|\bAnywhere\b|\bWorldwide\b|\bGlobal\b)/i.test(
    location
  );
}

/** Match all requested role keywords in titles; never infer personal qualifications. */
export function searchPublicJobs(
  jobs: DiscoveredJob[],
  query: string,
  region: 'us' | 'all',
  trackedUrls: string[] = [],
  excludedCompanies: string[] = []
): DiscoveredJob[] {
  const keywords = [
    ...new Set(
      aliases(query)
        .split(' ')
        .filter(
          (word) =>
            word && !['job', 'jobs', 'remote', 'a', 'an', 'the', 'in', 'us', 'usa'].includes(word)
        )
    ),
  ];
  if (!keywords.length) return [];
  const tracked = new Set(trackedUrls.map(listingKey));
  const seen = new Set<string>();
  return jobs
    .filter((job) => {
      const url = listingKey(job.url);
      if (seen.has(url) || tracked.has(url)) return false;
      seen.add(url);
      return (
        (region === 'all' || isUsEligible(job.location)) &&
        !excludedCompanies.some((company) => normalize(company) === normalize(job.company)) &&
        keywords.every((keyword) =>
          aliases(job.title)
            .split(/[^a-z0-9+#.]+/)
            .includes(keyword)
        )
      );
    })
    .map((job) => ({ ...job, matchedKeywords: keywords }))
    .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
    .slice(0, 50);
}
