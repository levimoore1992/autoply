import React, { useMemo } from 'react';
import { diffResumeLines } from '../utils/resume-diff';

/** Git-style unified text comparison of the original and tailored resume. */
export function ResumeDiff({
  original,
  tailored,
  comparisonLabel = 'Original resume captured at generation',
}: {
  original?: string;
  tailored: string;
  comparisonLabel?: string;
}) {
  const lines = useMemo(() => diffResumeLines(original ?? '', tailored), [original, tailored]);
  if (original === undefined) {
    return (
      <p className="p-4 text-sm text-(--text-secondary)">
        No original resume is available for comparison. Add a base resume in Profile before
        generating a tailored resume.
      </p>
    );
  }
  const added = lines.filter((line) => line.type === 'added').length;
  const removed = lines.filter((line) => line.type === 'removed').length;
  return (
    <div className="h-full overflow-y-auto" role="region" aria-label="Resume changes">
      <div className="sticky top-0 z-10 border-b border-(--border-subtle) bg-(--bg-secondary) px-4 py-3 space-y-1">
        <p className="text-xs text-(--text-secondary)">{comparisonLabel} → Tailored resume</p>
        <p className="flex gap-3 text-xs font-mono">
          <span className="text-emerald-300">+{added} added</span>
          <span className="text-rose-300">−{removed} removed</span>
        </p>
        <p className="text-[11px] text-(--text-secondary)">
          Text comparison, including Markdown formatting. Line numbers show original / tailored.
        </p>
        {added === 0 && removed === 0 && (
          <p className="text-xs text-(--text-primary)">No text changes.</p>
        )}
      </div>
      <table
        className="w-full table-fixed text-[11px] font-mono leading-5"
        aria-label="Original and tailored resume line comparison"
      >
        <colgroup>
          <col className="w-9" />
          <col className="w-9" />
          <col className="w-5" />
          <col />
        </colgroup>
        <thead className="sr-only">
          <tr>
            <th>Original line</th>
            <th>Tailored line</th>
            <th>Change</th>
            <th>Resume text</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr
              key={index}
              className={
                line.type === 'removed'
                  ? 'bg-rose-500/15 text-rose-200'
                  : line.type === 'added'
                    ? 'bg-emerald-500/15 text-emerald-200'
                    : 'text-(--text-secondary)'
              }
            >
              <td className="align-top text-right pr-2 opacity-70 select-none">{line.oldLine}</td>
              <td className="align-top text-right pr-2 opacity-70 select-none">{line.newLine}</td>
              <td className="align-top">
                <span aria-hidden="true">
                  {line.type === 'removed' ? '−' : line.type === 'added' ? '+' : ' '}
                </span>
                <span className="sr-only">{line.type}</span>
              </td>
              <td className="align-top pr-3 whitespace-pre-wrap break-words">
                {line.text || '\u00a0'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
