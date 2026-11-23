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
