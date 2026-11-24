/** Normalize formatting without conflating negation or technology names such as C++ and C#. */
export function checkboxResponse(checked: boolean, explicitlyFilled?: boolean): string {
  return checked ? 'Yes' : explicitlyFilled === false ? 'No' : '';
}

export function normalizeAnswerQuestion(question: string): string {
  return question
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s*?.!]+$/, '');
}

/** Exclude secrets and actions that require fresh consent from reusable answers. */
export function canRememberField(type: string, label: string): boolean {
  return (
    !['file', 'password', 'hidden'].includes(type) &&
    !/password|captcha|one.?time|\bOTP\b|social.?security|\bSSN\b|passport|credit.?card|consent|agree.*terms|signature|certif.*accur/i.test(
      label
    )
  );
}
