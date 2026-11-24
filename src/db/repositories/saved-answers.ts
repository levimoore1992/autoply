import { getDb } from '../index';
import { savedAnswerHash as hashQuestion } from '../saved-answer-migration';
import { normalizeAnswerQuestion } from '../../utils/answer-memory';

export interface SavedAnswer {
  id?: number;
  profile_id: number;
  question_hash: string;
  question: string;
  answer: string;
  scope: string;
  used_count: number;
  created_at?: string;
  updated_at?: string;
}

export class SavedAnswersRepository {
  upsert(profileId: number, question: string, answer: string, scope = ''): SavedAnswer {
    const db = getDb();
    const hash = hashQuestion(question, scope);
    db.run(
      `INSERT INTO saved_answers (profile_id, question_hash, question, answer, scope, used_count, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(profile_id, question_hash) DO UPDATE SET
         answer = excluded.answer,
         used_count = used_count + 1,
         updated_at = CURRENT_TIMESTAMP`,
      [profileId, hash, question, answer, scope]
    );
    const found = this.findByHash(profileId, hash);
    if (!found) {
      throw new Error(`Failed to find saved answer after upsert for profile ${profileId}`);
    }
    return found;
  }

  /** Exact normalized matching only; job-specific responses take precedence. */
  findExact(profileId: number, question: string, scope = ''): SavedAnswer | null {
    const matches = this.findAll(profileId).filter(
      (row) => normalizeAnswerQuestion(row.question) === normalizeAnswerQuestion(question)
    );
    return (
      matches.find((row) => scope && row.scope === scope) ||
      matches.find((row) => !row.scope) ||
      null
    );
  }

  findSimilar(profileId: number, question: string, limit = 5): SavedAnswer[] {
    const db = getDb();
    const hash = hashQuestion(question);
    // Exact hash match first
    const exact = this.findByHash(profileId, hash);
    if (exact) return [exact];

    // Keyword-based fuzzy match: look for rows where the question contains key words
    const keywords = question
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .slice(0, 5);

    if (keywords.length === 0) return [];

    const conditions = keywords.map(() => 'LOWER(question) LIKE ?').join(' OR ');
    const params: (string | number)[] = [profileId, ...keywords.map((k) => `%${k}%`), limit];
    const rows = db
      .query<
        SavedAnswer,
        (string | number)[]
      >(`SELECT * FROM saved_answers WHERE profile_id = ? AND (${conditions}) ORDER BY used_count DESC LIMIT ?`)
      .all(...params);
    return rows;
  }

  findByHash(profileId: number, hash: string): SavedAnswer | null {
    const db = getDb();
    return (
      db
        .query<
          SavedAnswer,
          [number, string]
        >('SELECT * FROM saved_answers WHERE profile_id = ? AND question_hash = ?')
        .get(profileId, hash) ?? null
    );
  }

  findAll(profileId: number): SavedAnswer[] {
    const db = getDb();
    return db
      .query<
        SavedAnswer,
        [number]
      >('SELECT * FROM saved_answers WHERE profile_id = ? ORDER BY used_count DESC')
      .all(profileId);
  }

  delete(id: number): boolean {
    const db = getDb();
    return db.run('DELETE FROM saved_answers WHERE id = ?', [id]).changes > 0;
  }
}

export const savedAnswersRepository = new SavedAnswersRepository();
