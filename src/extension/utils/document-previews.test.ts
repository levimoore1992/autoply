import { describe, expect, test } from 'bun:test';
import type { Application, Profile } from '../../types';
import { getApplicationPreviewDocs } from './document-previews';

const profile: Profile = {
  id: 1,
  name: 'Example',
  email: 'example@example.com',
  base_resume: 'Updated profile',
  skills: [],
  experience: [],
  education: [],
};
const application: Application = {
  profile_id: 1,
  url: 'https://example.com',
  platform: 'generic',
  company: 'Company',
  job_title: 'Engineer',
  status: 'review_required',
  generated_resume: 'Tailored',
  generated_cover_letter: 'Letter',
};

describe('document preview baseline', () => {
  test('uses the stored original even after the profile changes and includes both documents', () => {
    const docs = getApplicationPreviewDocs({ ...application, source_resume: 'Original' }, profile);
    expect(docs.map((doc) => doc.type)).toEqual(['resume', 'cover-letter']);
    expect(docs[0].originalContent).toBe('Original');
    expect(docs[0].comparisonLabel).toBe('Original resume captured at generation');
  });
  test('labels current-profile fallback for legacy drafts and avoids unrelated profiles', () => {
    const doc = getApplicationPreviewDocs(application, profile)[0];
    expect(doc.originalContent).toBe('Updated profile');
    expect(doc.comparisonLabel).toContain('snapshot unavailable');
    expect(
      getApplicationPreviewDocs(application, { ...profile, id: 2 })[0].originalContent
    ).toBeUndefined();
    expect(getApplicationPreviewDocs(application, null)[0].originalContent).toBeUndefined();
  });
});
