// Background script for Autoply Copilot
// Detects job boards and enables the side panel on supported pages
import { apiFetchJson } from './utils/api-config';
import { createSubmissionSync } from './submission-sync';

const submissionSync = createSubmissionSync(chrome.storage.local, async (entry) => {
  await apiFetchJson('/applications/confirm-submission', {
    method: 'POST',
    body: JSON.stringify(entry),
    signal: AbortSignal.timeout(5000),
  });
  chrome.runtime.sendMessage({ type: 'APPLICATION_SUBMITTED' }).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  void submissionSync.flush();
});

/** Catch confirmations already open when the extension is installed/reloaded. */
async function captureOpenConfirmations(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (
      !tab.id ||
      !tab.url ||
      !/^https?:\/\/(?:jobs\.ashbyhq\.com|jobs\.lever\.co|(?:job-)?boards\.greenhouse\.io)\//.test(
        tab.url
      )
    )
      continue;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const visible = (el: Element) => {
            const rect = el.getBoundingClientRect();
            return (
              rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden'
            );
          };
          if (
            Array.from(document.querySelectorAll('button,input[type="submit"]')).some(
              (el) =>
                visible(el) &&
                /submit application|apply now/i.test(
                  el.textContent || (el as HTMLInputElement).value || ''
                )
            )
          )
            return null;
          return (
            Array.from(document.querySelectorAll('[role="status"],[role="alert"],h1,h2,h3'))
              .filter(visible)
              .map(
                (el) =>
                  (el.matches('h1,h2,h3')
                    ? el.parentElement?.innerText
                    : (el as HTMLElement).innerText) || ''
              )
              .find(
                (text) =>
                  text.length <= 1000 &&
                  /your application (?:was |has been )?(?:successfully )?submitted|application (?:was |has been )?(?:successfully )?received|thank(?:s| you) for applying/i.test(
                    text
                  ) &&
                  !/\bnot\b|\bfailed\b|\bunable\b/i.test(text)
              ) || null
          );
        },
      });
      const confirmation = results[0]?.result;
      if (confirmation) await submissionSync.enqueue({ url: tab.url, confirmation });
    } catch {
      /* A closed/restricted tab must not prevent other confirmations syncing. */
    }
  }
}
chrome.runtime.onInstalled.addListener(() => {
  void captureOpenConfirmations();
});

if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Error setting panel behavior:', error));
}

const JOB_BOARD_URLS = [
  // Supported ATS platforms (scrape-verified)
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  // Additional ATS platforms
  'icims.com',
  'breezy.hr',
  'recruitee.com',
  'jazz.co',
  'applytojob.com',
  'rippling.com',
  'oracle.com/taleo',
  'successfactors.com',
  'taleo.net',
  'kronos.com',
  'paylocity.com',
  // Job boards
  'linkedin.com/jobs',
  'indeed.com/viewjob',
  'glassdoor.com/job',
  'ziprecruiter.com/jobs',
  'monster.com/job',
  'dice.com/jobs',
  'wellfound.com/jobs',
  'ycombinator.com/jobs',
];

async function updateSidePanelForTab(tabId: number, url: string): Promise<void> {
  if (!chrome.sidePanel) return;

  const isJobBoard = JOB_BOARD_URLS.some((jobBoardUrl) => url.includes(jobBoardUrl));

  try {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel.html',
      enabled: isJobBoard,
    });
  } catch (error) {
    console.error('Error setting side panel options:', error);
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    void submissionSync.flush();
    void updateSidePanelForTab(tabId, tab.url);
  }
});

// Listener for messages from content scripts or sidepanel
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SUBMISSION_CONFIRMED') {
    if (
      _sender.id !== chrome.runtime.id ||
      !_sender.tab?.url ||
      _sender.frameId !== 0 ||
      message.url !== _sender.tab.url ||
      typeof message.confirmation !== 'string' ||
      message.confirmation.length > 1000
    ) {
      sendResponse({ success: false });
      return false;
    }
    submissionSync
      .enqueue({ url: message.url, confirmation: message.confirmation })
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }
  if (message.type === 'SYNC_SUBMISSIONS' && _sender.id === chrome.runtime.id) {
    captureOpenConfirmations()
      .then(() => submissionSync.flush())
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }
  if (message.type === 'CHECK_CONNECTION') {
    const apiBase =
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as Record<string, unknown>).__API_BASE__ === 'string'
        ? ((globalThis as Record<string, unknown>).__API_BASE__ as string)
        : 'http://localhost:8088';

    fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(5000) })
      .then((res) => res.json())
      .then((data) => sendResponse({ connected: true, data }))
      .catch(() => sendResponse({ connected: false }));
    return true; // Keep channel open
  }
});
