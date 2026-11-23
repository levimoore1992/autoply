import { applicationRepository } from '../db/repositories/application';
import { profileRepository } from '../db/repositories/profile';
import { applicationIdentity, isSubmissionConfirmation } from '../utils/submission-confirmation';

/** Update the current profile's tracked job once, preserving the initial submission time. */
export function recordConfirmedSubmission(url: string, confirmation: string) {
  const identity = applicationIdentity(url);
  if (!identity || !isSubmissionConfirmation(confirmation))
    throw new Error('A supported job and explicit submission confirmation are required');
  const profile = profileRepository.findFirst();
  if (!profile?.id) return null;
  const application = applicationRepository
    .findAll({ profile_id: profile.id })
    .find((row) => applicationIdentity(row.url) === identity);
  if (!application?.id) return null;
  if (application.status === 'submitted') return application;
  return applicationRepository.update(application.id, {
    status: 'submitted',
    applied_at: new Date().toISOString(),
  });
}
