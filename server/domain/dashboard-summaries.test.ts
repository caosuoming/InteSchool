import { describe, expect, it } from 'vitest';
import type { AppState, TeacherRecord } from '../types.js';
import type { Lecture, DocumentRecord } from '../../src/types/index.js';
import { runWithState } from '../runtime-db.js';
import { lectureService } from './lecture.js';
import { aiService } from './ai.js';

const teacher = {
  id: 'teacher-a', schoolId: 'school-a', subject: '数学', currentAffiliationId: 'math',
  affiliations: [{ id: 'math', schoolId: 'school-a', subject: '数学', subjects: ['数学', '英语'] }],
} as unknown as TeacherRecord;

const lecture = (id: string, patch: Record<string, unknown>) => ({
  id, teacherId: 'teacher-a', schoolId: 'school-a', subject: '数学',
  title: id, grade: '高一', schoolYear: '2026', status: 'draft',
  updatedAt: '2026-11-18T00:00:00Z', sections: [{}, {}],
  ...patch,
}) as unknown as Lecture;

const document = (id: string, patch: Record<string, unknown>) => ({
  id, teacherId: 'teacher-a', schoolId: 'school-a',
  fileName: `${id}.pdf`, createdAt: '2026-11-18T00:00:00Z', status: 'recognized',
  sections: [{ title: 'large content', content: 'x'.repeat(100_000) }],
  ...patch,
}) as unknown as DocumentRecord;

describe('dashboard summaries', () => {
  it('returns brief lecture metadata in the same most-recent-first order and respects current subject', async () => {
    const state = {
      currentTeacherId: teacher.id, teachers: [teacher],
      lectures: [
        lecture('old', { status: 'published', updatedAt: '2026-10-18T00:00:00Z' }),
        lecture('recent', {}),
        lecture('other-subject', { subject: '英语' }),
        lecture('other-owner', { teacherId: 'teacher-b' }),
      ],
    } as unknown as AppState;
    await runWithState(state, async () => {
      const result = await lectureService.getDashboardLectureSummary(teacher, '2026-11-16T00:00:00Z');
      expect(result).toEqual({
        total: 2,
        weekly: 1,
        recent: [
          { id: 'recent', title: 'recent', grade: '高一', schoolYear: '2026', status: 'draft', updatedAt: '2026-11-18T00:00:00Z', sectionCount: 2 },
          { id: 'old', title: 'old', grade: '高一', schoolYear: '2026', status: 'published', updatedAt: '2026-10-18T00:00:00Z', sectionCount: 2 },
        ],
        drafts: [{ id: 'recent', title: 'recent', updatedAt: '2026-11-18T00:00:00Z' }],
      });
    });
  });

  it('never includes document section bodies or documents owned by another teacher', async () => {
    const state = {
      currentTeacherId: teacher.id, teachers: [teacher],
      documents: [
        document('recent', {}),
        document('old', { status: 'confirmed', createdAt: '2026-10-18T00:00:00Z' }),
        document('other', { teacherId: 'teacher-b' }),
      ],
    } as unknown as AppState;
    await runWithState(state, async () => {
      expect(await aiService.getDashboardDocumentSummary(teacher.id, '2026-11-16T00:00:00Z'))
        .toEqual({ weekly: 1, recognized: [{ id: 'recent', fileName: 'recent.pdf' }] });
    });
  });
});
