// 业务服务：所有写操作都经过这里，统一做权限校验、状态流转和操作记录。
// 服务直接修改传入的 db；调用方（store）会先复制一份，操作成功后再提交，失败则丢弃，保证原子性。

import { compareAnswers } from './answers';
import { addDays, isValidDateStr, toDateStr } from './dates';
import { assertCan, canSeeAssignment, PermissionError } from './permissions';
import { applyCardAnswer, firstDueDate, validateIntervals, type CardAnswer } from './revision';
import { nextStatus, openIssueNumbers, uncheckedNumbers } from './status';
import {
  DEFAULT_SETTINGS,
  type AnswerKeyItem,
  type Assignment,
  type Confirmation,
  type ConfirmationScope,
  type Correction,
  type Db,
  type Family,
  type FamilySettings,
  type PhotoClarity,
  type Review,
  type ReviewItem,
  type ReviewResult,
  type RevisionCard,
  type SelfCheck,
  type StudentAnswer,
  type Submission,
  type User,
} from './types';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface ServiceDeps {
  now: () => Date;
  newId: () => string;
  /** 返回 [0, 1) 的安全随机数，用于邀请码 */
  random: () => number;
}

export const INVITE_TTL_HOURS = 24;

/** 本地 PIN 哈希：仅防止孩子在同一设备上切换到家长身份，不是服务端认证 */
export function hashPin(pin: string, salt: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const s = `${salt}:${pin}`;
  for (let r = 0; r < 1000; r++) {
    for (let i = 0; i < s.length; i++) {
      h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
      h2 = Math.imul(h2 ^ (h1 >>> 7), 2246822519) >>> 0;
    }
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function validatePin(pin: string) {
  if (!/^\d{4,6}$/.test(pin)) throw new ValidationError('PIN 须为 4 到 6 位数字');
}

function requireText(value: string | undefined, label: string, max = 200): string {
  const v = (value ?? '').trim();
  if (!v) throw new ValidationError(`请填写${label}`);
  if (v.length > max) throw new ValidationError(`${label}不能超过 ${max} 个字`);
  return v;
}

export interface NewAssignmentInput {
  studentId: string;
  subject: string;
  title: string;
  requirements?: string;
  dueDate?: string;
  estimatedMinutes?: number;
  noticePhotoId?: string;
  answerKey?: AnswerKeyItem[];
  answerKeySource?: string;
}

export interface SubmitInput {
  photoIds: string[];
  clarity: PhotoClarity;
  studentAnswers: StudentAnswer[];
  selfCheck: SelfCheck;
}

export interface CorrectionInput {
  questionNo: string;
  reason: string;
  content: string;
  /** 同时生成复习卡片 */
  addToReview: boolean;
  knowledgePoint?: string;
  correctApproach?: string;
}

export interface ManualCardInput {
  studentId: string;
  subject: string;
  knowledgePoint: string;
  question: string;
  correctApproach: string;
}

export class HomeworkService {
  constructor(
    private db: Db,
    private deps: ServiceDeps,
  ) {}

  // ---------- 基础 ----------

  private nowIso() {
    return this.deps.now().toISOString();
  }

  today() {
    return toDateStr(this.deps.now());
  }

  private log(actor: User, action: string, targetType: string, targetId: string, detail?: string) {
    this.db.audit.push({
      id: this.deps.newId(),
      at: this.nowIso(),
      familyId: actor.familyId,
      actorId: actor.id,
      action,
      targetType,
      targetId,
      detail,
    });
  }

  user(id: string): User {
    const u = this.db.users.find((x) => x.id === id);
    if (!u) throw new ValidationError('找不到该成员');
    return u;
  }

  family(id: string): Family {
    const f = this.db.families.find((x) => x.id === id);
    if (!f) throw new ValidationError('找不到家庭');
    return f;
  }

  currentUser(): User {
    const id = this.db.session.currentUserId;
    if (!id) throw new PermissionError('请先登录');
    return this.user(id);
  }

  private assignmentFor(actor: User, id: string): Assignment {
    const a = this.db.assignments.find((x) => x.id === id);
    if (!a || !canSeeAssignment(actor, a)) throw new ValidationError('找不到该作业');
    return a;
  }

  private student(actor: User, studentId: string): User {
    const s = this.db.users.find((u) => u.id === studentId);
    if (!s || s.role !== 'student' || s.familyId !== actor.familyId) throw new ValidationError('找不到该学生');
    return s;
  }

  // ---------- 家庭与账号 ----------

  createFamily(input: { familyName: string; parentName: string; pin: string }): User {
    const familyName = requireText(input.familyName, '家庭名称', 30);
    const parentName = requireText(input.parentName, '显示名', 20);
    validatePin(input.pin);
    const family: Family = {
      id: this.deps.newId(),
      name: familyName,
      createdAt: this.nowIso(),
      invites: [],
      settings: { ...DEFAULT_SETTINGS, reviewIntervals: [...DEFAULT_SETTINGS.reviewIntervals] },
    };
    const parentId = this.deps.newId();
    const parent: User = {
      id: parentId,
      role: 'parent',
      displayName: parentName,
      locale: 'zh-CN',
      familyId: family.id,
      pinHash: hashPin(input.pin, parentId),
      createdAt: this.nowIso(),
    };
    this.db.families.push(family);
    this.db.users.push(parent);
    this.db.session.currentUserId = parent.id;
    this.log(parent, 'family.create', 'family', family.id);
    return parent;
  }

  addChild(actor: User, displayName: string): User {
    assertCan(actor, 'family.manage');
    const name = requireText(displayName, '孩子的称呼', 20);
    const child: User = {
      id: this.deps.newId(),
      role: 'student',
      displayName: name,
      locale: 'zh-CN',
      familyId: actor.familyId,
      createdAt: this.nowIso(),
    };
    this.db.users.push(child);
    this.log(actor, 'member.add_child', 'user', child.id, name);
    return child;
  }

  renameMember(actor: User, userId: string, displayName: string) {
    assertCan(actor, 'family.manage');
    const u = this.user(userId);
    if (u.familyId !== actor.familyId) throw new ValidationError('找不到该成员');
    u.displayName = requireText(displayName, '显示名', 20);
    this.log(actor, 'member.rename', 'user', u.id);
  }

  /** 生成一次性邀请码（6 位数字，24 小时内有效，只能使用一次） */
  createInvite(actor: User): string {
    assertCan(actor, 'family.manage');
    const family = this.family(actor.familyId);
    const existing = new Set(this.db.families.flatMap((f) => f.invites.map((i) => i.code)));
    let code = '';
    do {
      code = String(Math.floor(this.deps.random() * 1_000_000)).padStart(6, '0');
    } while (existing.has(code));
    const now = this.deps.now();
    family.invites.push({
      code,
      createdBy: actor.id,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + INVITE_TTL_HOURS * 3600_000).toISOString(),
    });
    this.log(actor, 'invite.create', 'family', family.id);
    return code;
  }

  revokeInvite(actor: User, code: string) {
    assertCan(actor, 'family.manage');
    const inv = this.family(actor.familyId).invites.find((i) => i.code === code);
    if (!inv) throw new ValidationError('邀请码不存在');
    inv.revokedAt ??= this.nowIso();
    this.log(actor, 'invite.revoke', 'family', actor.familyId);
  }

  /** 用邀请码加入家庭，成为另一位家长 */
  joinWithInvite(input: { code: string; displayName: string; pin: string }): User {
    const code = input.code.trim();
    const family = this.db.families.find((f) => f.invites.some((i) => i.code === code));
    const inv = family?.invites.find((i) => i.code === code);
    if (!family || !inv || inv.usedAt || inv.revokedAt || new Date(inv.expiresAt) <= this.deps.now()) {
      throw new ValidationError('邀请码无效或已失效');
    }
    const name = requireText(input.displayName, '显示名', 20);
    validatePin(input.pin);
    const id = this.deps.newId();
    const parent: User = {
      id,
      role: 'parent',
      displayName: name,
      locale: 'zh-CN',
      familyId: family.id,
      pinHash: hashPin(input.pin, id),
      createdAt: this.nowIso(),
    };
    this.db.users.push(parent);
    inv.usedAt = this.nowIso();
    inv.usedBy = id;
    this.db.session.currentUserId = id;
    this.log(parent, 'invite.accept', 'family', family.id);
    return parent;
  }

  /** 切换当前使用者。切换到家长需要 PIN。 */
  switchUser(userId: string, pin?: string) {
    const target = this.user(userId);
    const current = this.db.session.currentUserId ? this.user(this.db.session.currentUserId) : undefined;
    if (current && current.familyId !== target.familyId) throw new PermissionError('不能切换到其他家庭的成员');
    if (target.role === 'parent' && target.id !== current?.id) {
      if (!pin || hashPin(pin, target.id) !== target.pinHash) throw new PermissionError('PIN 不正确');
    }
    this.db.session.currentUserId = target.id;
  }

  changePin(actor: User, oldPin: string, newPin: string) {
    if (actor.role !== 'parent') throw new PermissionError('没有权限执行此操作');
    if (hashPin(oldPin, actor.id) !== actor.pinHash) throw new PermissionError('原 PIN 不正确');
    validatePin(newPin);
    this.user(actor.id).pinHash = hashPin(newPin, actor.id);
    this.log(actor, 'member.change_pin', 'user', actor.id);
  }

  updateSettings(actor: User, patch: Partial<FamilySettings>) {
    assertCan(actor, 'family.settings');
    const family = this.family(actor.familyId);
    if (patch.reviewIntervals) {
      const err = validateIntervals(patch.reviewIntervals);
      if (err) throw new ValidationError(err);
    }
    for (const t of [patch.quietStart, patch.quietEnd]) {
      if (t !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new ValidationError('时间格式应为 HH:mm');
    }
    family.settings = { ...family.settings, ...patch };
    this.log(actor, 'settings.update', 'family', family.id, JSON.stringify(patch));
  }

  // ---------- 作业 ----------

  createAssignment(actor: User, input: NewAssignmentInput): Assignment {
    const student = this.student(actor, input.studentId);
    assertCan(actor, 'assignment.create', student.id, student);
    const subject = requireText(input.subject, '科目', 20);
    const title = requireText(input.title, '标题', 60);
    if (input.dueDate && !isValidDateStr(input.dueDate)) throw new ValidationError('截止日期格式不正确');
    if (
      input.estimatedMinutes !== undefined &&
      (!Number.isFinite(input.estimatedMinutes) || input.estimatedMinutes < 0 || input.estimatedMinutes > 600)
    ) {
      throw new ValidationError('预计用时应在 0 到 600 分钟之间');
    }
    const now = this.nowIso();
    const a: Assignment = {
      id: this.deps.newId(),
      familyId: actor.familyId,
      studentId: student.id,
      subject,
      title,
      requirements: (input.requirements ?? '').trim(),
      dueDate: input.dueDate || undefined,
      estimatedMinutes: input.estimatedMinutes,
      noticePhotoId: input.noticePhotoId,
      answerKey: cleanAnswerKey(input.answerKey),
      answerKeySource: input.answerKeySource?.trim() || undefined,
      status: 'todo',
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    this.db.assignments.push(a);
    this.log(actor, 'assignment.create', 'assignment', a.id, a.title);
    return a;
  }

  editAssignment(actor: User, id: string, patch: Partial<Omit<NewAssignmentInput, 'studentId'>>) {
    const a = this.assignmentFor(actor, id);
    assertCan(actor, 'assignment.edit', a.studentId, this.user(a.studentId));
    if (a.status === 'confirmed' || a.status === 'pending_confirm') {
      throw new ValidationError('已提交确认的作业不能修改要求，如需补充请添加订正');
    }
    if (patch.subject !== undefined) a.subject = requireText(patch.subject, '科目', 20);
    if (patch.title !== undefined) a.title = requireText(patch.title, '标题', 60);
    if (patch.requirements !== undefined) a.requirements = patch.requirements.trim();
    if (patch.dueDate !== undefined) {
      if (patch.dueDate && !isValidDateStr(patch.dueDate)) throw new ValidationError('截止日期格式不正确');
      a.dueDate = patch.dueDate || undefined;
    }
    if (patch.estimatedMinutes !== undefined) a.estimatedMinutes = patch.estimatedMinutes;
    if (patch.answerKey !== undefined) a.answerKey = cleanAnswerKey(patch.answerKey);
    if (patch.answerKeySource !== undefined) a.answerKeySource = patch.answerKeySource.trim() || undefined;
    if (patch.noticePhotoId !== undefined) a.noticePhotoId = patch.noticePhotoId || undefined;
    a.updatedAt = this.nowIso();
    this.log(actor, 'assignment.edit', 'assignment', a.id);
  }

  deleteAssignment(actor: User, id: string): string[] {
    const a = this.assignmentFor(actor, id);
    assertCan(actor, 'assignment.edit', a.studentId, this.user(a.studentId));
    if (actor.role === 'student' && a.status !== 'todo' && a.status !== 'in_progress') {
      throw new ValidationError('已提交的作业只能由家长删除');
    }
    const photoIds = this.purgeAssignments([a.id]);
    this.log(actor, 'assignment.delete', 'assignment', a.id, a.title);
    return photoIds;
  }

  start(actor: User, id: string) {
    const a = this.assignmentFor(actor, id);
    assertCan(actor, 'assignment.submit', a.studentId, this.user(a.studentId));
    a.status = nextStatus(a.status, 'start');
    a.updatedAt = this.nowIso();
    this.log(actor, 'assignment.start', 'assignment', a.id);
  }

  /** 标记完成并提交检查。没有照片也可以提交。 */
  submit(actor: User, id: string, input: SubmitInput): { submission: Submission; review: Review } {
    const a = this.assignmentFor(actor, id);
    assertCan(actor, 'assignment.submit', a.studentId, this.user(a.studentId));
    a.status = nextStatus(a.status, 'submit');
    const clarity: PhotoClarity = input.photoIds.length === 0 ? 'none' : input.clarity;
    const studentAnswers = input.studentAnswers
      .map((s) => ({ questionNo: s.questionNo.trim(), answer: s.answer.trim() }))
      .filter((s) => s.questionNo && s.answer);
    const submission: Submission = {
      id: this.deps.newId(),
      assignmentId: a.id,
      assignmentVersion: a.version,
      photoIds: [...input.photoIds],
      clarity,
      studentAnswers,
      selfCheck: { ...input.selfCheck, photoClear: clarity === 'clear' && input.selfCheck.photoClear },
      submittedAt: this.nowIso(),
      submittedBy: actor.id,
    };
    // 有标准答案时进行比对；否则“待人工检查”，不猜测答案
    let items: ReviewItem[] = compareAnswers(a.answerKey, studentAnswers, a.answerKeySource);
    if (clarity === 'blurry') {
      items = items.map((i) => (i.method === 'manual' ? { ...i, result: 'unclear' } : i));
    }
    const review: Review = {
      id: this.deps.newId(),
      submissionId: submission.id,
      assignmentId: a.id,
      items,
      clarity,
      createdAt: this.nowIso(),
    };
    this.db.submissions.push(submission);
    this.db.reviews.push(review);
    a.updatedAt = this.nowIso();
    this.log(actor, 'assignment.submit', 'assignment', a.id, `v${a.version}`);
    return { submission, review };
  }

  /** 补拍：在待检查阶段替换最新提交的照片 */
  retakePhotos(actor: User, assignmentId: string, photoIds: string[], clarity: PhotoClarity): string[] {
    const { review } = this.reviewForUpdate(actor, assignmentId);
    const sub = this.db.submissions.find((s) => s.id === review.submissionId);
    if (!sub) throw new ValidationError('还没有提交记录');
    if (photoIds.length === 0) throw new ValidationError('请至少拍摄一张照片');
    const removed = sub.photoIds;
    sub.photoIds = [...photoIds];
    sub.clarity = clarity;
    review.clarity = clarity;
    if (clarity === 'clear') {
      for (const i of review.items) if (i.result === 'unclear') i.result = 'pending_manual';
    }
    this.log(actor, 'submission.retake', 'assignment', assignmentId);
    return removed;
  }

  latestSubmission(assignmentId: string): Submission | undefined {
    const list = this.db.submissions.filter((s) => s.assignmentId === assignmentId);
    return list[list.length - 1];
  }

  latestReview(assignmentId: string): Review | undefined {
    const list = this.db.reviews.filter((r) => r.assignmentId === assignmentId);
    return list[list.length - 1];
  }

  private reviewForUpdate(actor: User, assignmentId: string): { a: Assignment; review: Review } {
    const a = this.assignmentFor(actor, assignmentId);
    assertCan(actor, 'assignment.check', a.studentId, this.user(a.studentId));
    const review = this.latestReview(a.id);
    if (!review) throw new ValidationError('还没有提交记录');
    if (a.status !== 'pending_check') throw new ValidationError('检查已完成，如有问题请添加订正');
    return { a, review };
  }

  /** 人工检查：设置某题结果，或新增一道题 */
  setReviewItem(actor: User, assignmentId: string, questionNo: string, result: ReviewResult, note?: string) {
    const { review } = this.reviewForUpdate(actor, assignmentId);
    const no = requireText(questionNo, '题号', 20);
    const item = review.items.find((i) => i.questionNo === no);
    if (item) {
      // 答案比对的结果可被人工标记为“存疑”，但不能被静默改写成“正确”
      if (item.method === 'answer_key' && item.result === 'mismatch' && result === 'match') {
        throw new ValidationError('与参考答案不一致的题不能直接标为正确，可标记“建议有误”或“存疑”');
      }
      item.result = result;
      if (item.method !== 'answer_key') item.method = 'manual';
      if (note !== undefined) item.note = note.trim() || undefined;
    } else {
      review.items.push({ questionNo: no, method: 'manual', result, note: note?.trim() || undefined });
    }
    this.log(actor, 'review.set_item', 'review', review.id, `${no}:${result}`);
  }

  removeReviewItem(actor: User, assignmentId: string, questionNo: string) {
    const { review } = this.reviewForUpdate(actor, assignmentId);
    const item = review.items.find((i) => i.questionNo === questionNo);
    if (item?.method === 'answer_key') throw new ValidationError('答案比对的题目不能删除');
    review.items = review.items.filter((i) => i.questionNo !== questionNo);
  }

  /** 标记建议有误：该题转为“存疑”，交人工处理 */
  flagSuggestion(actor: User, assignmentId: string, questionNo: string) {
    const a = this.assignmentFor(actor, assignmentId);
    assertCan(actor, 'assignment.check', a.studentId, this.user(a.studentId));
    const review = this.latestReview(a.id);
    const item = review?.items.find((i) => i.questionNo === questionNo);
    if (!review || !item) throw new ValidationError('找不到该题');
    item.flaggedWrong = true;
    if (a.status === 'pending_check') item.result = 'doubt';
    this.log(actor, 'review.flag_suggestion', 'review', review.id, questionNo);
  }

  /** 完成检查：有未订正的错误/存疑 → 待订正；否则 → 待家长确认 */
  finishCheck(actor: User, assignmentId: string) {
    const { a, review } = this.reviewForUpdate(actor, assignmentId);
    const issues = openIssueNumbers(review.items, this.correctedNos(a));
    a.status = nextStatus(a.status, issues.length ? 'finish_check_with_issues' : 'finish_check_clean');
    review.checkedAt = this.nowIso();
    review.checkedBy = actor.id;
    a.updatedAt = this.nowIso();
    this.log(actor, 'review.finish', 'assignment', a.id, issues.length ? `待订正：${issues.join(',')}` : undefined);
  }

  private correctedNos(a: Assignment): string[] {
    return this.db.corrections.filter((c) => c.assignmentId === a.id).map((c) => c.questionNo);
  }

  openIssues(assignmentId: string): string[] {
    const a = this.db.assignments.find((x) => x.id === assignmentId);
    const review = this.latestReview(assignmentId);
    if (!a || !review) return [];
    return openIssueNumbers(review.items, this.correctedNos(a));
  }

  addCorrection(actor: User, assignmentId: string, input: CorrectionInput): Correction {
    const a = this.assignmentFor(actor, assignmentId);
    assertCan(actor, 'assignment.correct', a.studentId, this.user(a.studentId));
    if (a.status === 'todo' || a.status === 'in_progress') throw new ValidationError('请先完成并提交作业');
    const questionNo = requireText(input.questionNo, '题号', 20);
    const reason = requireText(input.reason, '错误原因', 300);
    const content = requireText(input.content, '订正内容', 1000);
    // 已确认的作业有新订正：生成新版本并重新请求确认，保留原确认记录
    if (a.status === 'confirmed') {
      a.version += 1;
      a.status = nextStatus(a.status, 'new_correction_after_confirm');
      this.log(actor, 'assignment.new_version', 'assignment', a.id, `v${a.version}`);
    }
    const c: Correction = {
      id: this.deps.newId(),
      assignmentId: a.id,
      assignmentVersion: a.version,
      questionNo,
      reason,
      content,
      createdAt: this.nowIso(),
      createdBy: actor.id,
    };
    this.db.corrections.push(c);
    if (input.addToReview) {
      const review = this.latestReview(a.id);
      const item = review?.items.find((i) => i.questionNo === questionNo);
      const intervals = this.family(a.familyId).settings.reviewIntervals;
      this.db.cards.push({
        id: this.deps.newId(),
        familyId: a.familyId,
        studentId: a.studentId,
        sourceCorrectionId: c.id,
        sourceAssignmentId: a.id,
        subject: a.subject,
        knowledgePoint: input.knowledgePoint?.trim() || `${a.title} 第 ${questionNo} 题`,
        question: `${a.title} · 第 ${questionNo} 题${item?.studentAnswer ? `（当时答：${item.studentAnswer}）` : ''}`,
        wrongReason: reason,
        correctApproach: input.correctApproach?.trim() || content,
        stage: 0,
        nextDate: firstDueDate(this.today(), intervals),
        mastery: 'learning',
        history: [],
        createdAt: this.nowIso(),
      });
    }
    a.updatedAt = this.nowIso();
    this.log(actor, 'correction.add', 'assignment', a.id, questionNo);
    return c;
  }

  requestConfirm(actor: User, assignmentId: string) {
    const a = this.assignmentFor(actor, assignmentId);
    assertCan(actor, 'assignment.correct', a.studentId, this.user(a.studentId));
    a.status = nextStatus(a.status, 'request_confirm');
    a.updatedAt = this.nowIso();
    this.log(actor, 'assignment.request_confirm', 'assignment', a.id);
  }

  /** 家长确认。未订正的错误不影响确认，但记录为“已查看，仍有未处理项”，不会显示为全部正确。 */
  confirm(actor: User, assignmentId: string): Confirmation {
    const a = this.assignmentFor(actor, assignmentId);
    assertCan(actor, 'assignment.confirm', a.studentId, this.user(a.studentId));
    a.status = nextStatus(a.status, 'confirm');
    const conf: Confirmation = {
      id: this.deps.newId(),
      assignmentId: a.id,
      assignmentVersion: a.version,
      by: actor.id,
      conclusion: 'confirmed',
      scope: this.confirmationScope(a),
      openIssues: this.openIssues(a.id).length,
      at: this.nowIso(),
    };
    this.db.confirmations.push(conf);
    a.updatedAt = this.nowIso();
    this.log(actor, 'assignment.confirm', 'assignment', a.id, `v${a.version} ${conf.scope}`);
    return conf;
  }

  confirmationScope(a: Assignment): ConfirmationScope {
    const sub = this.latestSubmission(a.id);
    const review = this.latestReview(a.id);
    if (!sub || sub.photoIds.length === 0) return 'completion_only';
    const pending = review ? uncheckedNumbers(review.items).length : 0;
    return this.openIssues(a.id).length > 0 || pending > 0 ? 'viewed_with_open_issues' : 'all_correct';
  }

  returnForRevision(actor: User, assignmentId: string, reason: string): Confirmation {
    const a = this.assignmentFor(actor, assignmentId);
    assertCan(actor, 'assignment.return', a.studentId, this.user(a.studentId));
    const r = requireText(reason, '退回原因', 200);
    a.status = nextStatus(a.status, 'return');
    const conf: Confirmation = {
      id: this.deps.newId(),
      assignmentId: a.id,
      assignmentVersion: a.version,
      by: actor.id,
      conclusion: 'returned',
      openIssues: this.openIssues(a.id).length,
      returnReason: r,
      at: this.nowIso(),
    };
    this.db.confirmations.push(conf);
    a.updatedAt = this.nowIso();
    this.log(actor, 'assignment.return', 'assignment', a.id, r);
    return conf;
  }

  // ---------- 复习 ----------

  addManualCard(actor: User, input: ManualCardInput): RevisionCard {
    const student = this.student(actor, input.studentId);
    assertCan(actor, 'card.review', student.id, student);
    const card: RevisionCard = {
      id: this.deps.newId(),
      familyId: actor.familyId,
      studentId: student.id,
      subject: requireText(input.subject, '科目', 20),
      knowledgePoint: requireText(input.knowledgePoint, '知识点', 60),
      question: requireText(input.question, '题目或提示', 500),
      wrongReason: '',
      correctApproach: requireText(input.correctApproach, '正确思路', 1000),
      stage: 0,
      nextDate: firstDueDate(this.today(), this.family(actor.familyId).settings.reviewIntervals),
      mastery: 'learning',
      history: [],
      createdAt: this.nowIso(),
    };
    this.db.cards.push(card);
    this.log(actor, 'card.create', 'card', card.id);
    return card;
  }

  answerCard(actor: User, cardId: string, answer: CardAnswer): RevisionCard {
    const idx = this.db.cards.findIndex((c) => c.id === cardId);
    const card = this.db.cards[idx];
    if (!card || card.familyId !== actor.familyId) throw new ValidationError('找不到该卡片');
    assertCan(actor, 'card.review', card.studentId, this.user(card.studentId));
    const updated = applyCardAnswer(card, answer, this.today(), this.family(card.familyId).settings.reviewIntervals);
    this.db.cards[idx] = updated;
    return updated;
  }

  /** 家长手动调整下一次复习日期 */
  rescheduleCard(actor: User, cardId: string, nextDate: string) {
    assertCan(actor, 'family.settings');
    const card = this.db.cards.find((c) => c.id === cardId && c.familyId === actor.familyId);
    if (!card) throw new ValidationError('找不到该卡片');
    if (!isValidDateStr(nextDate)) throw new ValidationError('日期格式不正确');
    card.nextDate = nextDate;
    card.mastery = 'learning';
    this.log(actor, 'card.reschedule', 'card', card.id, nextDate);
  }

  deleteCard(actor: User, cardId: string) {
    const card = this.db.cards.find((c) => c.id === cardId && c.familyId === actor.familyId);
    if (!card) throw new ValidationError('找不到该卡片');
    assertCan(actor, 'card.review', card.studentId, this.user(card.studentId));
    this.db.cards = this.db.cards.filter((c) => c.id !== cardId);
    this.log(actor, 'card.delete', 'card', cardId);
  }

  // ---------- 数据管理 ----------

  exportStudentData(actor: User, studentId: string) {
    const student = this.student(actor, studentId);
    assertCan(actor, 'data.export', student.id, student);
    const assignments = this.db.assignments.filter((a) => a.studentId === student.id);
    const ids = new Set(assignments.map((a) => a.id));
    this.log(actor, 'data.export', 'user', student.id);
    return {
      exportedAt: this.nowIso(),
      student: { id: student.id, displayName: student.displayName },
      assignments,
      submissions: this.db.submissions.filter((s) => ids.has(s.assignmentId)),
      reviews: this.db.reviews.filter((r) => ids.has(r.assignmentId)),
      corrections: this.db.corrections.filter((c) => ids.has(c.assignmentId)),
      confirmations: this.db.confirmations.filter((c) => ids.has(c.assignmentId)),
      cards: this.db.cards.filter((c) => c.studentId === student.id),
    };
  }

  /** 删除孩子的全部数据，返回需要一并删除的照片 id */
  deleteStudentData(actor: User, studentId: string): string[] {
    const student = this.student(actor, studentId);
    assertCan(actor, 'data.delete', student.id, student);
    const ids = this.db.assignments.filter((a) => a.studentId === student.id).map((a) => a.id);
    const photoIds = this.purgeAssignments(ids);
    this.db.cards = this.db.cards.filter((c) => c.studentId !== student.id);
    this.db.users = this.db.users.filter((u) => u.id !== student.id);
    this.log(actor, 'data.delete_student', 'user', student.id, student.displayName);
    return photoIds;
  }

  private purgeAssignments(ids: string[]): string[] {
    const set = new Set(ids);
    const photoIds: string[] = [];
    for (const a of this.db.assignments) if (set.has(a.id) && a.noticePhotoId) photoIds.push(a.noticePhotoId);
    for (const s of this.db.submissions) if (set.has(s.assignmentId)) photoIds.push(...s.photoIds);
    const corrIds = new Set(this.db.corrections.filter((c) => set.has(c.assignmentId)).map((c) => c.id));
    this.db.assignments = this.db.assignments.filter((a) => !set.has(a.id));
    this.db.submissions = this.db.submissions.filter((s) => !set.has(s.assignmentId));
    this.db.reviews = this.db.reviews.filter((r) => !set.has(r.assignmentId));
    this.db.corrections = this.db.corrections.filter((c) => !set.has(c.assignmentId));
    this.db.confirmations = this.db.confirmations.filter((c) => !set.has(c.assignmentId));
    // 复习卡片保留（孩子仍需复习），只断开来源引用
    for (const c of this.db.cards) {
      if (c.sourceCorrectionId && corrIds.has(c.sourceCorrectionId)) c.sourceCorrectionId = undefined;
      if (c.sourceAssignmentId && set.has(c.sourceAssignmentId)) c.sourceAssignmentId = undefined;
    }
    return photoIds;
  }

  /** 查询提醒：到期作业和今日复习（夜间免打扰由调用方判断） */
  reminderSummary(studentId: string) {
    const today = this.today();
    const tomorrow = addDays(today, 1);
    const due = this.db.assignments.filter(
      (a) => a.studentId === studentId && a.dueDate && a.dueDate <= tomorrow && a.status !== 'confirmed',
    );
    const cards = this.db.cards.filter(
      (c) => c.studentId === studentId && c.mastery === 'learning' && c.nextDate <= today,
    );
    return { dueCount: due.length, reviewCount: cards.length };
  }
}

function cleanAnswerKey(key: AnswerKeyItem[] | undefined): AnswerKeyItem[] {
  const seen = new Set<string>();
  const out: AnswerKeyItem[] = [];
  for (const k of key ?? []) {
    const questionNo = k.questionNo.trim();
    const answer = k.answer.trim();
    if (!questionNo || !answer) continue;
    if (seen.has(questionNo)) throw new ValidationError(`标准答案中题号 ${questionNo} 重复`);
    seen.add(questionNo);
    out.push({ questionNo, answer });
  }
  return out;
}
