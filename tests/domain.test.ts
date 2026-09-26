import { describe, expect, it } from 'vitest';
import { compareAnswers, normalizeAnswer, parseAnswerLines } from '../src/domain/answers';
import { isBlurry, laplacianVariance } from '../src/domain/clarity';
import { addDays, inQuietHours, isValidDateStr } from '../src/domain/dates';
import { applyCardAnswer, isDue, validateIntervals } from '../src/domain/revision';
import { isOverdue } from '../src/domain/status';
import type { RevisionCard } from '../src/domain/types';

const card = (over: Partial<RevisionCard> = {}): RevisionCard => ({
  id: 'c',
  familyId: 'f',
  studentId: 's',
  subject: '数学',
  knowledgePoint: 'k',
  question: 'q',
  wrongReason: '',
  correctApproach: 'a',
  stage: 0,
  nextDate: '2026-09-29',
  mastery: 'learning',
  history: [],
  createdAt: '',
  ...over,
});

describe('复习间隔', () => {
  const intervals = [1, 3, 7];

  it('“会了”进入下一间隔，最后一次后掌握', () => {
    let c = applyCardAnswer(card(), 'known', '2026-09-29', intervals);
    expect(c).toMatchObject({ stage: 1, nextDate: '2026-10-02' });
    c = applyCardAnswer(c, 'known', '2026-10-02', intervals);
    expect(c).toMatchObject({ stage: 2, nextDate: '2026-10-09' });
    c = applyCardAnswer(c, 'known', '2026-10-09', intervals);
    expect(c.mastery).toBe('mastered');
    expect(c.history).toHaveLength(3);
    expect(isDue(c, '2026-12-01')).toBe(false);
  });

  it('“还不熟”安排次日再练，不前进', () => {
    const c = applyCardAnswer(card({ stage: 1 }), 'unsure', '2026-10-02', intervals);
    expect(c).toMatchObject({ stage: 1, nextDate: '2026-10-03' });
  });

  it('校验家长设置的间隔', () => {
    expect(validateIntervals([1, 3, 7])).toBeNull();
    expect(validateIntervals([])).not.toBeNull();
    expect(validateIntervals([3, 1])).not.toBeNull();
    expect(validateIntervals([0])).not.toBeNull();
  });
});

describe('答案比对', () => {
  it('规范化全角、大小写与空白', () => {
    expect(normalizeAnswer(' Ａ ')).toBe('a');
    expect(normalizeAnswer('3．5')).toBe('3.5');
  });

  it('逐题比对并在未作答时转人工', () => {
    const items = compareAnswers(
      [
        { questionNo: '1', answer: 'B' },
        { questionNo: '2', answer: '10' },
      ],
      [{ questionNo: '1', answer: 'b' }],
      undefined,
    );
    expect(items[0].result).toBe('match');
    expect(items[1].result).toBe('pending_manual');
  });

  it('解析多行答案文本', () => {
    expect(parseAnswerLines('1 A\n2：3.5\n\n3(1) 北京\n4、C\n5.D')).toEqual([
      { questionNo: '1', answer: 'A' },
      { questionNo: '2', answer: '3.5' },
      { questionNo: '3(1)', answer: '北京' },
      { questionNo: '4', answer: 'C' },
      { questionNo: '5', answer: 'D' },
    ]);
  });
});

describe('日期', () => {
  it('跨月加减与校验', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(isValidDateStr('2026-02-30')).toBe(false);
    expect(isValidDateStr('2026-02-28')).toBe(true);
  });

  it('夜间免打扰跨零点', () => {
    expect(inQuietHours(new Date(2026, 0, 1, 22, 0), '21:00', '07:00')).toBe(true);
    expect(inQuietHours(new Date(2026, 0, 1, 6, 59), '21:00', '07:00')).toBe(true);
    expect(inQuietHours(new Date(2026, 0, 1, 7, 0), '21:00', '07:00')).toBe(false);
  });

  it('逾期只是标识', () => {
    expect(isOverdue({ dueDate: '2026-09-27', status: 'in_progress' }, '2026-09-28')).toBe(true);
    expect(isOverdue({ dueDate: '2026-09-27', status: 'confirmed' }, '2026-09-28')).toBe(false);
    expect(isOverdue({ dueDate: undefined, status: 'todo' }, '2026-09-28')).toBe(false);
  });
});

describe('清晰度', () => {
  it('纯色图像判定为模糊，棋盘格判定为清晰', () => {
    const w = 20;
    const flat = new Array(w * w).fill(128);
    const checker = Array.from({ length: w * w }, (_, i) => ((i % w) + Math.floor(i / w)) % 2 ? 255 : 0);
    expect(isBlurry(laplacianVariance(flat, w, w))).toBe(true);
    expect(isBlurry(laplacianVariance(checker, w, w))).toBe(false);
  });
});
