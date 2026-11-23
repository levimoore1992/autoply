import { describe, expect, test } from 'bun:test';
import { applicationIdentity, isSubmissionConfirmation } from './submission-confirmation';

describe('submission evidence', () => {
  test('accepts explicit ATS success but rejects validation errors and button labels', () => {
    expect(
      isSubmissionConfirmation(
        'Thank you! Your application was successfully submitted. Our team will reach out.'
      )
    ).toBe(true);
    expect(isSubmissionConfirmation('Application received')).toBe(true);
    for (const text of [
      'Submit Application',
      'Your application was not submitted',
      'Unable to submit your application',
      'Thank you for your interest',
      'Missing entry for required field',
    ])
      expect(isSubmissionConfirmation(text)).toBe(false);
  });
  test('matches overview and application URLs without mixing jobs or accepting lookalike hosts', () => {
    expect(
      applicationIdentity('https://jobs.ashbyhq.com/rescale/one/application?source=test')
    ).toBe(applicationIdentity('https://jobs.ashbyhq.com/rescale/one'));
    expect(applicationIdentity('https://jobs.ashbyhq.com/rescale/two')).not.toBe(
      applicationIdentity('https://jobs.ashbyhq.com/rescale/one')
    );
    expect(applicationIdentity('https://jobs.ashbyhq.com.evil.example/rescale/one')).toBeNull();
    expect(applicationIdentity('https://jobs.ashbyhq.com/rescale')).toBeNull();
  });
});
