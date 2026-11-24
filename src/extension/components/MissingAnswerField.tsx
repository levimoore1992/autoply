import React, { useState } from 'react';
import type { MissingApplicationField } from '../../types/answer-memory';

/** Ask for an unanswered field and explicitly save the user's response for reuse. */
export function MissingAnswerField({
  field,
  onSave,
}: {
  field: MissingApplicationField;
  onSave: (field: MissingApplicationField, answer: string, scope: 'all' | 'job') => Promise<void>;
}) {
  const [answer, setAnswer] = useState(field.currentValue || '');
  const [scope, setScope] = useState<'all' | 'job'>(
    /why|this (role|company)|anything else|cover letter/i.test(field.label) ? 'job' : 'all'
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const id = `missing-${field.key}`;
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(field, answer.trim(), scope);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save answer');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
      <label htmlFor={id} className="block text-xs font-semibold text-(--text-primary)">
        {field.label} {field.required ? '(required)' : '(optional)'}
      </label>
      {field.rememberable === false ? (
        <p className="text-xs text-(--text-secondary)">
          Complete this field on the application page.
        </p>
      ) : (
        <>
          {field.options?.length ? (
            <select
              id={id}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              className="input text-xs"
              disabled={saving}
            >
              <option value="">Choose an answer…</option>
              {field.options.filter(Boolean).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <textarea
              id={id}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={3}
              className="input text-xs"
              disabled={saving}
              placeholder="Enter your answer"
            />
          )}
          <label className="block text-xs text-(--text-secondary)">
            Reuse this answer
            <select
              aria-label={`Reuse scope for ${field.label}`}
              value={scope}
              onChange={(event) => setScope(event.target.value as 'all' | 'job')}
              className="input text-xs mt-1"
              disabled={saving}
            >
              <option value="all">For matching questions on future jobs</option>
              <option value="job">For this job only</option>
            </select>
          </label>
          <button
            onClick={save}
            disabled={saving || !answer.trim()}
            className="btn btn-primary btn-sm w-full"
          >
            {saving ? 'Saving…' : 'Save & fill'}
          </button>
          {error && (
            <p role="alert" className="text-xs text-rose-300">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
