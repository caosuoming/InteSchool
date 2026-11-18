import { describe, expect, it } from 'vitest';
import type { AppState, TeacherRecord } from '../types.js';
import type { Question } from '../../src/types/index.js';
import { runWithState } from '../runtime-db.js';
import { questionService } from './question.js';

const teacher = {
  id: 'teacher-a', subject: '数学', schoolId: 'school-a', currentAffiliationId: 'math',
  affiliations: [{ id: 'math', schoolId: 'school-a', subject: '数学', subjects: ['数学', '英语'] }],
} as unknown as TeacherRecord;

const base = { schoolId: 'school-a', subject: '数学', createdAt: '2026-11-17T01:00:00Z' };
const q = (id: string, fields: Record<string, unknown>) =>
  ({ id, teacherId: 'teacher-a', ...base, ...fields }) as unknown as Question;

describe('getDashboardQuestionCounts', () => {
  it('counts only current teacher and subject, including recent owned questions', async () => {
    const state = {
      teachers: [teacher], currentTeacherId: teacher.id,
      questions: [
        q('recent', {}), q('old', { createdAt: '2026-10-15T00:00:00Z' }),
        q('other-subject', { subject: '英语' }),
        q('other-owner', { teacherId: 'teacher-b' }),
      ],
    } as unknown as AppState;
    await runWithState(state, async () => {
      expect(await questionService.getDashboardQuestionCounts(teacher, '2026-11-16T00:00:00Z'))
        .toEqual({ total: 2, weekly: 1 });
    });
  });

  it('rejects an invalid week boundary', async () => {
    await runWithState({ teachers: [teacher], questions: [] } as unknown as AppState, async () => {
      await expect(questionService.getDashboardQuestionCounts(teacher, 'invalid')).rejects.toThrow('无效的统计时间');
    });
  });
});
