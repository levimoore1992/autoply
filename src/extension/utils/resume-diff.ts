export interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
  oldLine?: number;
  newLine?: number;
}

const MAX_DIFF_CELLS = 2_000_000;

function splitLines(text: string): string[] {
  const normalized = text.replace(/\r\n?|[\u2028\u2029]/g, '\n').replace(/\n$/, '');
  return normalized ? normalized.split('\n') : [];
}

/** Compute an exact line comparison, preserving whitespace and both documents' line numbers. */
export function diffResumeLines(original: string, tailored: string): DiffLine[] {
  const before = splitLines(original);
  const after = splitLines(tailored);
  const rows: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  const append = (type: DiffLine['type']) => {
    rows.push({
      type,
      text: type === 'added' ? after[newIndex] : before[oldIndex],
      oldLine: type === 'added' ? undefined : ++oldIndex,
      newLine: type === 'removed' ? undefined : ++newIndex,
    });
  };

  while (
    oldIndex < before.length &&
    newIndex < after.length &&
    before[oldIndex] === after[newIndex]
  ) {
    append('unchanged');
  }
  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > oldIndex && newEnd > newIndex && before[oldEnd - 1] === after[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  const oldStart = oldIndex;
  const newStart = newIndex;
  const width = newEnd - newStart + 1;
  const cells = (oldEnd - oldStart + 1) * width;

  // Bound memory for unusually large imports. This fallback still shows every exact change.
  if (cells > MAX_DIFF_CELLS) {
    while (oldIndex < oldEnd) append('removed');
    while (newIndex < newEnd) append('added');
  } else {
    const matches = new Uint32Array(cells);
    const at = (old: number, next: number) => (old - oldStart) * width + next - newStart;
    for (let old = oldEnd - 1; old >= oldStart; old--) {
      for (let next = newEnd - 1; next >= newStart; next--) {
        matches[at(old, next)] =
          before[old] === after[next]
            ? 1 + matches[at(old + 1, next + 1)]
            : Math.max(matches[at(old + 1, next)], matches[at(old, next + 1)]);
      }
    }
    while (oldIndex < oldEnd || newIndex < newEnd) {
      if (oldIndex < oldEnd && newIndex < newEnd && before[oldIndex] === after[newIndex]) {
        append('unchanged');
      } else if (
        oldIndex < oldEnd &&
        (newIndex === newEnd ||
          matches[at(oldIndex + 1, newIndex)] >= matches[at(oldIndex, newIndex + 1)])
      ) {
        append('removed');
      } else {
        append('added');
      }
    }
  }
  while (oldIndex < before.length) append('unchanged');
  return rows;
}
