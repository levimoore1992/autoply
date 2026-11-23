import { describe, expect, test } from 'bun:test';
import { diffResumeLines } from './resume-diff';

describe('resume line comparison', () => {
  test('numbers replacements, additions, deletions, and unchanged context', () => {
    expect(diffResumeLines('Name\nOld role\nSkills', 'Name\nNew role\nPython\nSkills')).toEqual([
      { type: 'unchanged', text: 'Name', oldLine: 1, newLine: 1 },
      { type: 'removed', text: 'Old role', oldLine: 2, newLine: undefined },
      { type: 'added', text: 'New role', oldLine: undefined, newLine: 2 },
      { type: 'added', text: 'Python', oldLine: undefined, newLine: 3 },
      { type: 'unchanged', text: 'Skills', oldLine: 3, newLine: 4 },
    ]);
  });

  test('ignores platform line endings and final newline, but preserves content whitespace', () => {
    expect(
      diffResumeLines('Name\r\nRole\r\n', 'Name\nRole').every((line) => line.type === 'unchanged')
    ).toBe(true);
    expect(diffResumeLines(' Role', 'Role').map((line) => line.type)).toEqual(['removed', 'added']);
    expect(
      diffResumeLines('Name\u2028Role\u2029', 'Name\nRole').every(
        (line) => line.type === 'unchanged'
      )
    ).toBe(true);
  });

  test('handles empty documents and duplicate lines without losing either document', () => {
    for (const [original, tailored] of [
      ['', ''],
      ['', 'New'],
      ['Old', ''],
      ['A\nB\nA\nC', 'A\nA\nB\nC'],
      ['First\n\nLast', 'First\nMiddle\n\nLast'],
    ]) {
      const lines = diffResumeLines(original, tailored);
      expect(
        lines
          .filter((line) => line.type !== 'added')
          .map((line) => line.text)
          .join('\n')
      ).toBe(original);
      expect(
        lines
          .filter((line) => line.type !== 'removed')
          .map((line) => line.text)
          .join('\n')
      ).toBe(tailored);
    }
  });

  test('bounds large comparisons while preserving all text', () => {
    const original = Array.from({ length: 1500 }, (_, i) => `Old ${i}`).join('\n');
    const tailored = Array.from({ length: 1500 }, (_, i) => `New ${i}`).join('\n');
    const lines = diffResumeLines(original, tailored);
    expect(lines).toHaveLength(3000);
    expect(lines[1499].oldLine).toBe(1500);
    expect(lines[2999].newLine).toBe(1500);
  });
});
