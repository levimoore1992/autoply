export interface DiscoveredJob {
  id: string;
  url: string;
  title: string;
  company: string;
  location: string;
  jobType: string[];
  description: string;
  publishedAt: string;
  matchedKeywords?: string[];
}

export interface DiscoveryResult {
  jobs: DiscoveredJob[];
  fetchedAt: string;
  stale: boolean;
  source: 'Jobicy';
  total: number;
}
