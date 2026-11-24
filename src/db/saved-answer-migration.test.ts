import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { migrateSavedAnswerHashes, savedAnswerHash } from './saved-answer-migration';

describe('saved response upgrade', () => {
  test('consolidates legacy hashes by recency rather than usage and keeps profiles and scopes separate', () => {
    const db = new Database(':memory:');
    try {
      db.exec(
        'CREATE TABLE saved_answers (id INTEGER PRIMARY KEY, profile_id INTEGER, question_hash TEXT, question TEXT, answer TEXT, scope TEXT, used_count INTEGER, updated_at TEXT, UNIQUE(profile_id,question_hash))'
      );
      const insert = db.prepare('INSERT INTO saved_answers VALUES (?,?,?,?,?,?,?,?)');
      insert.run(1, 1, 'legacy', 'Startup experience?', 'Yes', '', 100, '2026-01-01');
      insert.run(
        2,
        1,
        savedAnswerHash('Startup experience?'),
        'Startup experience?',
        'No',
        '',
        1,
        '2026-02-01'
      );
      insert.run(3, 2, 'other', 'Startup experience?', 'Yes', '', 5, '2026-01-01');
      insert.run(4, 1, 'scoped', 'Startup experience?', 'Yes', 'job-one', 3, '2026-01-01');
      migrateSavedAnswerHashes(db);
      migrateSavedAnswerHashes(db);
      const rows = db.query<{ answer: string; used_count: number }, [number, string]>(
        'SELECT answer,used_count FROM saved_answers WHERE profile_id=? AND question_hash=?'
      );
      expect(rows.get(1, savedAnswerHash('Startup experience?'))).toEqual({
        answer: 'No',
        used_count: 101,
      });
      expect(rows.get(2, savedAnswerHash('Startup experience?'))?.answer).toBe('Yes');
      expect(rows.get(1, savedAnswerHash('Startup experience?', 'job-one'))?.answer).toBe('Yes');
      expect(db.query('SELECT * FROM saved_answers').all()).toHaveLength(3);
    } finally {
      db.close();
    }
  });
});
