import { describe, expect, test } from 'bun:test';
import { canRememberField, normalizeAnswerQuestion, checkboxResponse } from './answer-memory';

describe('answer reuse policy', () => {
  test('distinguishes unanswered unchecked checkboxes from explicitly filled No', () => {
    expect(checkboxResponse(false)).toBe('');
    expect(checkboxResponse(false, false)).toBe('No');
    expect(checkboxResponse(true, false)).toBe('Yes');
    expect(checkboxResponse(false, true)).toBe('');
  });
  test('normalizes case and required markers without conflating meaning', () => {
    expect(normalizeAnswerQuestion(' Do you have startup experience? *')).toBe(
      normalizeAnswerQuestion('do you have startup experience')
    );
    expect(normalizeAnswerQuestion('Years using C++?')).not.toBe(
      normalizeAnswerQuestion('Years using C#?')
    );
    expect(normalizeAnswerQuestion('Require sponsorship?')).not.toBe(
      normalizeAnswerQuestion('Do not require sponsorship?')
    );
  });
  test('does not remember secrets, files or binding consent', () => {
    expect(canRememberField('radio', 'Have you worked at a startup?')).toBe(true);
    for (const [type, label] of [
      ['password', 'Account password'],
      ['file', 'Resume'],
      ['text', 'Social security number'],
      ['checkbox', 'I agree to the terms'],
    ])
      expect(canRememberField(type, label)).toBe(false);
  });
});
