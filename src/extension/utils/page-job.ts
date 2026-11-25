import type { PageJobSource } from '../../types/page-job';
import { documentJobKey, getJobUrl } from './job-tabs';

/** Self-contained because Chrome serializes this function into the active page. Reads no field values. */
export function captureJobPage(): PageJobSource {
  const clean = (html: string) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc
      .querySelectorAll('script,style,form,input,select,textarea,button,[contenteditable]')
      .forEach((node) => node.remove());
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40_000);
  };
  const postings: Record<string, unknown>[] = [];
  const collect = (value: unknown, depth = 0) => {
    if (!value || depth > 6 || postings.length > 20) return;
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach((item) => collect(item, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    const item = value as Record<string, unknown>;
    if (
      item['@type'] === 'JobPosting' ||
      (Array.isArray(item['@type']) && item['@type'].includes('JobPosting'))
    )
      postings.push(item);
    if (item['@graph']) collect(item['@graph'], depth + 1);
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
    try {
      if ((node.textContent?.length || 0) < 200_000) collect(JSON.parse(node.textContent || ''));
    } catch {
      /* Ignore malformed metadata. */
    }
  });
  const posting =
    postings.length === 1 ? postings[0] : postings.find((item) => item.url === location.href);
  let structuredJob: PageJobSource['structuredJob'];
  if (posting && typeof posting.title === 'string' && typeof posting.description === 'string') {
    const organization = posting.hiringOrganization as { name?: unknown } | undefined;
    const description = clean(posting.description);
    if (typeof organization?.name === 'string' && description.length >= 100) {
      structuredJob = {
        title: posting.title.slice(0, 500),
        company: organization.name.slice(0, 500),
        description,
      };
    }
  }
  const selectors =
    '[itemprop="description"],#job_description,.job__description,.job__description__content,.job-post__content,.job-description,#content';
  const specific = Array.from(document.querySelectorAll<HTMLElement>(selectors)).find(
    (node) => node.innerText?.trim().length >= 100
  );
  const root = specific || document.querySelector('main,[role="main"],article') || document.body;
  const excluded =
    'script,style,noscript,svg,nav,footer,header,aside,form,input,select,textarea,button,[contenteditable],[hidden],[aria-hidden="true"]';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  let length = 0;
  let visited = 0;
  while (walker.nextNode() && visited++ < 20_000 && length < 40_000) {
    const parent = walker.currentNode.parentElement;
    if (
      !parent ||
      parent.closest(excluded) ||
      !parent.getClientRects().length ||
      getComputedStyle(parent).visibility === 'hidden'
    )
      continue;
    const value = walker.currentNode.textContent?.trim();
    if (value) {
      parts.push(value);
      length += value.length;
    }
  }
  const text = structuredJob?.description || parts.join('\n').slice(0, 40_000);
  return { url: location.href, title: document.title.slice(0, 500), text, structuredJob };
}

/** Capture the requested tab, including accessible embedded job descriptions, without broad host access. */
export async function readActiveJobPage(expectedUrl: string): Promise<PageJobSource> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (
    !tab?.id ||
    !tab.url ||
    !getJobUrl(tab.url) ||
    documentJobKey(tab.url) !== documentJobKey(expectedUrl)
  ) {
    throw new Error('The active job changed. Select its tab and try again.');
  }
  let top: chrome.scripting.InjectionResult<PageJobSource>[];
  try {
    top = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureJobPage });
  } catch {
    throw new Error(
      'Click the Autoply toolbar icon on this job tab to grant page access, or paste the job description in Generate Documents.'
    );
  }
  const main = top[0]?.result;
  if (!main || documentJobKey(main.url) !== documentJobKey(expectedUrl))
    throw new Error('The page changed while reading its job description. Try again.');
  let best = main;
  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: captureJobPage,
    });
    // Prefer explicit job metadata in an embedded ATS; otherwise keep the main page's text.
    const embedded = frames.find((frame) => frame.result?.structuredJob)?.result;
    if (embedded) best = embedded;
  } catch {
    /* Cross-origin frames may require the user to open the job directly. */
  }
  const current = await chrome.tabs.get(tab.id);
  if (!current.url || documentJobKey(current.url) !== documentJobKey(expectedUrl))
    throw new Error('The job tab navigated. Try again on the correct job.');
  return { ...best, url: main.url };
}
