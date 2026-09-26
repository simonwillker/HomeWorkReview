// 数据结构（对应设计书第 6 节）。日期统一使用本地日期字符串 YYYY-MM-DD，时间使用 ISO 字符串。

export type Role = 'student' | 'parent';
export type Locale = 'zh-CN' | 'ja';

export interface User {
  id: string;
  role: Role;
  displayName: string;
  locale: Locale;
  familyId: string;
  /** 家长切换身份时使用的 PIN（哈希），防止学生使用家长确认操作 */
  pinHash?: string;
  createdAt: string;
}

export interface Invite {
  code: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  usedBy?: string;
  revokedAt?: string;
}

export interface FamilySettings {
  /** 复习间隔（天），默认次日、3 天后、7 天后 */
  reviewIntervals: number[];
  remindersEnabled: boolean;
  /** 夜间免打扰，HH:mm */
  quietStart: string;
  quietEnd: string;
}

export interface Family {
  id: string;
  name: string;
  createdAt: string;
  invites: Invite[];
  settings: FamilySettings;
}

export type AssignmentStatus =
  | 'todo' // 待开始
  | 'in_progress' // 进行中
  | 'pending_check' // 待检查
  | 'pending_correction' // 待订正
  | 'pending_confirm' // 待家长确认
  | 'confirmed' // 已确认
  | 'needs_revision'; // 待修改（家长退回）

export interface AnswerKeyItem {
  questionNo: string;
  answer: string;
}

export interface Assignment {
  id: string;
  familyId: string;
  studentId: string;
  subject: string;
  title: string;
  requirements: string;
  dueDate?: string;
  estimatedMinutes?: number;
  noticePhotoId?: string;
  /** 录入的标准答案；只有存在时才进行“答案比对” */
  answerKey: AnswerKeyItem[];
  answerKeySource?: string;
  status: AssignmentStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface SelfCheck {
  allDone: boolean;
  nameAndDate: boolean;
  photoClear: boolean;
  answersChecked: boolean;
}

export interface StudentAnswer {
  questionNo: string;
  answer: string;
}

export type PhotoClarity = 'clear' | 'blurry' | 'none';

export interface Submission {
  id: string;
  assignmentId: string;
  assignmentVersion: number;
  photoIds: string[];
  clarity: PhotoClarity;
  studentAnswers: StudentAnswer[];
  selfCheck: SelfCheck;
  submittedAt: string;
  submittedBy: string;
}

export type ReviewMethod = 'answer_key' | 'manual';
export type ReviewResult =
  | 'match' // 已核对：与参考答案一致 / 人工确认正确
  | 'mismatch' // 已核对：明确错误
  | 'doubt' // 存疑
  | 'pending_manual' // 待人工检查
  | 'unclear'; // 识别不清

export interface ReviewItem {
  questionNo: string;
  method: ReviewMethod;
  result: ReviewResult;
  referenceAnswer?: string;
  studentAnswer?: string;
  /** 依据，例如答案来源 */
  basis?: string;
  note?: string;
  /** 用户标记“建议有误” */
  flaggedWrong?: boolean;
}

export interface Review {
  id: string;
  submissionId: string;
  assignmentId: string;
  items: ReviewItem[];
  clarity: PhotoClarity;
  createdAt: string;
  /** 完成检查的时间与人 */
  checkedAt?: string;
  checkedBy?: string;
}

export interface Correction {
  id: string;
  assignmentId: string;
  assignmentVersion: number;
  questionNo: string;
  reason: string;
  content: string;
  createdAt: string;
  createdBy: string;
}

export type ConfirmationScope =
  | 'all_correct' // 已核对且无未订正问题
  | 'viewed_with_open_issues' // 已查看，但仍有未订正或待人工检查项
  | 'completion_only'; // 无照片，仅确认完成情况

export interface Confirmation {
  id: string;
  assignmentId: string;
  assignmentVersion: number;
  by: string;
  conclusion: 'confirmed' | 'returned';
  scope?: ConfirmationScope;
  openIssues: number;
  returnReason?: string;
  at: string;
}

export type CardMastery = 'learning' | 'mastered';

export interface CardReviewLog {
  date: string;
  result: 'known' | 'unsure';
}

export interface RevisionCard {
  id: string;
  familyId: string;
  studentId: string;
  sourceCorrectionId?: string;
  sourceAssignmentId?: string;
  subject: string;
  knowledgePoint: string;
  question: string;
  wrongReason: string;
  correctApproach: string;
  /** 当前所处的间隔序号 */
  stage: number;
  nextDate: string;
  mastery: CardMastery;
  history: CardReviewLog[];
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  familyId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  detail?: string;
}

export interface Db {
  schema: 1;
  families: Family[];
  users: User[];
  assignments: Assignment[];
  submissions: Submission[];
  reviews: Review[];
  corrections: Correction[];
  confirmations: Confirmation[];
  cards: RevisionCard[];
  audit: AuditEntry[];
  session: { currentUserId?: string };
}

export const SUBJECTS = ['语文', '数学', '英语', '科学', '道德与法治', '其他'] as const;

export const DEFAULT_SETTINGS: FamilySettings = {
  reviewIntervals: [1, 3, 7],
  remindersEnabled: true,
  quietStart: '21:00',
  quietEnd: '07:00',
};

export function emptyDb(): Db {
  return {
    schema: 1,
    families: [],
    users: [],
    assignments: [],
    submissions: [],
    reviews: [],
    corrections: [],
    confirmations: [],
    cards: [],
    audit: [],
    session: {},
  };
}
