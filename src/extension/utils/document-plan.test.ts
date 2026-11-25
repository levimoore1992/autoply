import { describe, expect, test } from 'bun:test';
import { planDocumentAttachments } from './document-plan';

const resume = { type: 'file', key: '_systemfield_resume', label: 'Resume *', currentValue: '' };
const cover = { type: 'file', key: 'cover-letter', label: 'Cover Letter', currentValue: '' };

describe('form document planning', () => {
  test('generates both documents when a form exposes an empty optional cover-letter upload', () => {
    expect(planDocumentAttachments([resume, cover])).toEqual({
      resume: true,
      coverLetter: true,
      generate: 'both',
    });
    expect(planDocumentAttachments([resume, cover], { resume: 'resume.pdf' }).generate).toBe(
      'cover-letter'
    );
  });
  test('preserves the already attached resume while adding a missing cover letter', () => {
    expect(
      planDocumentAttachments([{ ...resume, currentValue: 'Existing_resume.pdf' }, cover])
    ).toEqual({ resume: false, coverLetter: true, generate: 'cover-letter' });
  });
  test('does not create a cover letter for a form without its upload field', () => {
    expect(planDocumentAttachments([resume])).toEqual({
      resume: true,
      coverLetter: false,
      generate: 'resume',
    });
    expect(
      planDocumentAttachments([
        resume,
        { ...cover, type: 'textarea', label: 'Why did you attach a cover letter?' },
      ]).coverLetter
    ).toBe(false);
  });
  test('does not overwrite existing attachments or regenerate cached documents for the same job', () => {
    expect(
      planDocumentAttachments([
        { ...resume, currentValue: 'resume.pdf' },
        { ...cover, currentValue: 'cover.pdf' },
      ])
    ).toEqual({ resume: false, coverLetter: false, generate: undefined });
    expect(
      planDocumentAttachments([resume, cover], { resume: 'resume.pdf', coverLetter: 'cover.pdf' })
        .generate
    ).toBeUndefined();
  });
});
