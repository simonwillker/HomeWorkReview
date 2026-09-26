// 复习卡片间隔规则（设计书 3.2）
// 默认次日、3 天后、7 天后；“还不熟”安排次日再练；“会了”进入下一间隔；最后一个间隔答“会了”视为掌握。

import { addDays } from './dates';
import type { RevisionCard } from './types';

export type CardAnswer = 'known' | 'unsure';

export function firstDueDate(today: string, intervals: number[]): string {
  return addDays(today, intervals[0] ?? 1);
}

export function applyCardAnswer(
  card: RevisionCard,
  answer: CardAnswer,
  today: string,
  intervals: number[],
): RevisionCard {
  const history = [...card.history, { date: today, result: answer }];
  if (answer === 'unsure') {
    return { ...card, history, mastery: 'learning', nextDate: addDays(today, 1) };
  }
  const nextStage = card.stage + 1;
  if (nextStage >= intervals.length) {
    return { ...card, history, stage: nextStage, mastery: 'mastered', nextDate: today };
  }
  return { ...card, history, stage: nextStage, nextDate: addDays(today, intervals[nextStage]) };
}

export function isDue(card: RevisionCard, today: string): boolean {
  return card.mastery === 'learning' && card.nextDate <= today;
}

/** 校验家长设置的间隔：1–5 个递增的正整数，最大 180 天 */
export function validateIntervals(intervals: number[]): string | null {
  if (intervals.length < 1 || intervals.length > 5) return '请设置 1 到 5 个复习间隔';
  for (let i = 0; i < intervals.length; i++) {
    const n = intervals[i];
    if (!Number.isInteger(n) || n < 1 || n > 180) return '间隔须为 1 到 180 之间的整数天';
    if (i > 0 && n <= intervals[i - 1]) return '间隔需要逐次变长';
  }
  return null;
}
