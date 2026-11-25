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

import { coverLetterInputPriority } from './resume-input';

describe('cover-letter attachment selection', () => {
  test('targets cover-letter fields without putting the letter in a resume or generic PDF field', () => {
    const field = { name: '', id: '', label: '', context: '', accept: '.pdf,.docx' };
    expect(coverLetterInputPriority({ ...field, label: 'Cover Letter' })).toBeGreaterThan(0);
    expect(coverLetterInputPriority({ ...field, id: 'cover_letter' })).toBeGreaterThan(0);
    expect(
      coverLetterInputPriority({
        ...field,
        name: '_systemfield_resume',
        label: 'Resume *',
        context: 'Cover Letter Resume',
      })
    ).toBe(-1);
    expect(coverLetterInputPriority(field)).toBe(-1);
    expect(resumeInputPriority({ ...field, label: 'Cover Letter' })).toBe(-1);
  });
});

import { selectedUploadFilename } from './resume-input';

describe('remote upload retention', () => {
  test('recognizes an uploaded cover letter after the ATS clears native file selection', () => {
    expect(
      selectedUploadFilename('', true, [
        'Cover Letter',
        'Levis_Letter_to_NerdWallet.pdf',
        'Replace',
      ])
    ).toBe('Levis_Letter_to_NerdWallet.pdf');
    expect(selectedUploadFilename('', false, ['Accepted file types: .pdf'])).toBe('');
    expect(selectedUploadFilename('Existing_resume.pdf', true, ['Other.pdf'])).toBe(
      'Existing_resume.pdf'
    );
  });
});
