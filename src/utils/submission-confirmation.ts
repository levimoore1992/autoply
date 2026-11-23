/** Match a supported ATS URL to a stable job identity, excluding application-page suffixes. */
export function applicationIdentity(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    const path = parsed.pathname
      .replace(/\/(?:application|apply|confirmation|success)\/?$/, '')
      .replace(/\/$/, '');
    if (parsed.hostname === 'jobs.ashbyhq.com' && /^\/[^/]+\/[^/]+$/.test(path))
      return `${parsed.hostname}${path}`;
    if (parsed.hostname === 'jobs.lever.co' && /^\/[^/]+\/[^/]+$/.test(path))
      return `${parsed.hostname}${path}`;
    if (
      ['boards.greenhouse.io', 'job-boards.greenhouse.io'].includes(parsed.hostname) &&
      /\/jobs\/\d+$/.test(path)
    )
      return `${parsed.hostname.replace('job-boards.', 'boards.')}${path}`;
    return null;
  } catch {
    return null;
  }
}

/** Require explicit success text; a click, disappearing form, or generic thank-you is insufficient. */
export function isSubmissionConfirmation(text: string): boolean {
  return (
    /\byour application (?:was |has been )?(?:successfully )?submitted\b|\bapplication (?:was |has been )?(?:successfully )?received\b|\bthank(?:s| you) for applying\b/i.test(
      text
    ) && !/\bnot\b|\bunsuccessful\b|\bfailed\b|\bunable\b/i.test(text)
  );
}
