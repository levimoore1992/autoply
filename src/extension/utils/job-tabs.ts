/** Return a safe web URL for a job link; browser-internal and script URLs are excluded. */
export function getJobUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      return undefined;
    }
    return parsed.href;
  } catch {
    return undefined;
  }
}
import type { Application } from '../../types';

/** Collect distinct valid links for jobs that still need review. */
export function getReviewJobUrls(applications: Application[]): string[] {
  return [
    ...new Set(
      applications
        .filter((app) => ['pending', 'review_required'].includes(app.status))
        .map((app) => getJobUrl(app.url))
        .filter((url): url is string => Boolean(url))
    ),
  ];
}

/** Open jobs using the tabs API so the browser does not block multiple popups. */
export async function openJobTabs(urls: string[]): Promise<{ opened: number; failed: number }> {
  const validUrls = [...new Set(urls.map(getJobUrl).filter((url): url is string => Boolean(url)))];
  let opened = 0;
  let failed = 0;
  for (const url of validUrls) {
    try {
      await chrome.tabs.create({ url, active: opened === 0 });
      opened++;
    } catch {
      failed++;
    }
  }
  return { opened, failed };
}

/** Match a generated document to its job while allowing overview/application navigation. */
export function documentJobKey(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  parsed.pathname = parsed.pathname.replace(/\/(?:application|apply)\/?$/, '').replace(/\/$/, '');
  return parsed.href;
}
