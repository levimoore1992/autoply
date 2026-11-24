import { savedAnswersRepository } from '../db/repositories/saved-answers';
import { canRememberField } from '../utils/answer-memory';
import { applicationIdentity } from '../utils/submission-confirmation';
import type { DetectedApplicationField } from '../ai/application-answers';

/** Scope answers to a stable supported job identity. */
export function answerJobScope(url?: string): string {
  return url ? applicationIdentity(url) || '' : '';
}

/** Reuse only explicitly saved, profile-scoped answers compatible with the current options. */
export function rememberedAnswers(
  profileId: number,
  fields: DetectedApplicationField[],
  url?: string
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of fields) {
    if (field.currentValue?.trim() || !canRememberField(field.type, field.label)) continue;
    const saved = savedAnswersRepository.findExact(profileId, field.label, answerJobScope(url));
    if (!saved) continue;
    const option = field.options?.find(
      (option) => option.trim().toLowerCase() === saved.answer.trim().toLowerCase()
    );
    if (field.options?.length && !option) continue;
    result[field.key] = option || saved.answer;
  }
  return result;
}
