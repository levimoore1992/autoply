import { describe, expect, test } from 'bun:test';
import { resumeInputPriority } from './resume-input';
import { documentJobKey } from './job-tabs';

describe('resume attachment selection', () => {
  test('prefers the required resume attachment to the parsing upload and excludes cover letters', () => {
    const field = { name: '', id: '', label: '', context: '', accept: '.pdf,.docx' };
    const parse = resumeInputPriority({ ...field, label: 'Autofill from resume' });
    const resume = resumeInputPriority({
      ...field,
      name: '_systemfield_resume',
      label: 'Resume *',
    });
    const cover = resumeInputPriority({ ...field, label: 'Cover letter' });
    expect(resume).toBeGreaterThan(parse);
    expect(cover).toBe(-1);
  });
  test('allows application navigation but keeps different jobs and job query IDs distinct', () => {
    expect(documentJobKey('https://jobs.ashbyhq.com/example/one/application')).toBe(
      documentJobKey('https://jobs.ashbyhq.com/example/one')
    );
    expect(documentJobKey('https://jobs.ashbyhq.com/example/two')).not.toBe(
      documentJobKey('https://jobs.ashbyhq.com/example/one')
    );
    expect(documentJobKey('https://example.com/apply?job=one')).not.toBe(
      documentJobKey('https://example.com/apply?job=two')
    );
  });
});
