// 作业状态规则（设计书 3.2 “状态规则”）
// 待开始 → 进行中 → 待检查 → 待订正（可选） → 待家长确认 → 已确认
// 家长退回 → 待修改 → 修改后重新进入待检查
// 已确认后有新订正 → 版本号 +1，重新进入待家长确认

import type { Assignment, AssignmentStatus, ReviewItem } from './types';

export type AssignmentEvent =
  | 'start'
  | 'submit' // 标记完成并提交检查
  | 'finish_check_with_issues'
  | 'finish_check_clean'
  | 'request_confirm'
  | 'confirm'
  | 'return'
  | 'new_correction_after_confirm';

const TRANSITIONS: Record<AssignmentEvent, Partial<Record<AssignmentStatus, AssignmentStatus>>> = {
  start: { todo: 'in_progress' },
  submit: { todo: 'pending_check', in_progress: 'pending_check', needs_revision: 'pending_check' },
  finish_check_with_issues: { pending_check: 'pending_correction' },
  finish_check_clean: { pending_check: 'pending_confirm' },
  request_confirm: { pending_correction: 'pending_confirm' },
  confirm: { pending_confirm: 'confirmed' },
  return: { pending_confirm: 'needs_revision' },
  new_correction_after_confirm: { confirmed: 'pending_confirm' },
};

export class TransitionError extends Error {
  constructor(
    public readonly from: AssignmentStatus,
    public readonly event: AssignmentEvent,
  ) {
    super(`当前状态“${STATUS_LABEL[from]}”不能执行此操作`);
    this.name = 'TransitionError';
  }
}

export function canTransition(from: AssignmentStatus, event: AssignmentEvent): boolean {
  return TRANSITIONS[event][from] !== undefined;
}

export function nextStatus(from: AssignmentStatus, event: AssignmentEvent): AssignmentStatus {
  const to = TRANSITIONS[event][from];
  if (!to) throw new TransitionError(from, event);
  return to;
}

export const STATUS_LABEL: Record<AssignmentStatus, string> = {
  todo: '待开始',
  in_progress: '进行中',
  pending_check: '待检查',
  pending_correction: '待订正',
  pending_confirm: '待家长确认',
  confirmed: '已确认',
  needs_revision: '待修改',
};

/** 逾期只是日期标识，不改变状态 */
export function isOverdue(a: Pick<Assignment, 'dueDate' | 'status'>, today: string): boolean {
  return !!a.dueDate && a.dueDate < today && a.status !== 'confirmed';
}

/** 明确错误或存疑、且尚未订正的题号 */
export function openIssueNumbers(items: ReviewItem[], correctedQuestionNos: Iterable<string>): string[] {
  const corrected = new Set(correctedQuestionNos);
  return items
    .filter((i) => (i.result === 'mismatch' || i.result === 'doubt') && !corrected.has(i.questionNo))
    .map((i) => i.questionNo);
}

/** 仍需人工处理（待人工检查 / 识别不清）的题号 */
export function uncheckedNumbers(items: ReviewItem[]): string[] {
  return items.filter((i) => i.result === 'pending_manual' || i.result === 'unclear').map((i) => i.questionNo);
}
