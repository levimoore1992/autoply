import { createHash } from 'node:crypto';
import type { Database } from 'bun:sqlite';
import { normalizeAnswerQuestion } from '../utils/answer-memory';

export function savedAnswerHash(question: string, scope = ''): string {
  return createHash('sha256')
    .update(scope + '\n' + normalizeAnswerQuestion(question))
    .digest('hex')
    .slice(0, 16);
}

/** Re-key legacy responses, keeping the most recently edited answer for each question and scope. */
export function migrateSavedAnswerHashes(db: Database): void {
  db.transaction(() => {
    const rows = db
      .query<
        { id: number; profile_id: number; question: string; scope: string; used_count: number },
        []
      >('SELECT * FROM saved_answers ORDER BY updated_at DESC, id DESC')
      .all();
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.profile_id}:${savedAnswerHash(row.question, row.scope)}`;
      groups.set(key, [...(groups.get(key) || []), row]);
    }
    for (const group of groups.values()) {
      for (const duplicate of group.slice(1))
        db.run('DELETE FROM saved_answers WHERE id = ?', [duplicate.id]);
      db.run('UPDATE saved_answers SET question_hash = ? WHERE id = ?', [
        `migration-${group[0].id}`,
        group[0].id,
      ]);
    }
    for (const group of groups.values()) {
      const row = group[0];
      db.run('UPDATE saved_answers SET question_hash = ?, used_count = ? WHERE id = ?', [
        savedAnswerHash(row.question, row.scope),
        group.reduce((sum, item) => sum + item.used_count, 0),
        row.id,
      ]);
    }
  })();
}
