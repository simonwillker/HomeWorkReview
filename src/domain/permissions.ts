// 角色权限（设计书第 2 节）。当前版本在本地服务层统一校验；接入服务端后，同一套规则须在服务端执行。

import type { Assignment, User } from './types';

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

export type Action =
  | 'assignment.create'
  | 'assignment.edit'
  | 'assignment.submit'
  | 'assignment.check'
  | 'assignment.correct'
  | 'assignment.confirm'
  | 'assignment.return'
  | 'card.review'
  | 'family.manage'
  | 'family.settings'
  | 'data.export'
  | 'data.delete';

const PARENT_ONLY: Action[] = [
  'assignment.confirm',
  'assignment.return',
  'family.manage',
  'family.settings',
  'data.export',
  'data.delete',
];

/** 判断用户能否对某学生的数据执行操作 */
export function can(actor: User, action: Action, studentId?: string, student?: User): boolean {
  if (PARENT_ONLY.includes(action) && actor.role !== 'parent') return false;
  if (studentId === undefined) return true;
  if (actor.role === 'student') return actor.id === studentId;
  // 家长：只能操作本家庭的学生
  return !!student && student.role === 'student' && student.familyId === actor.familyId;
}

export function assertCan(actor: User, action: Action, studentId?: string, student?: User): void {
  if (!can(actor, action, studentId, student)) {
    if (action === 'assignment.confirm' && actor.role === 'student') {
      throw new PermissionError('学生不能确认自己的作业，请家长确认');
    }
    throw new PermissionError('没有权限执行此操作');
  }
}

export function canSeeAssignment(actor: User, a: Assignment): boolean {
  if (actor.familyId !== a.familyId) return false;
  return actor.role === 'parent' || actor.id === a.studentId;
}
