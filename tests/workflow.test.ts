import { describe, expect, it } from 'vitest';
import { PermissionError } from '../src/domain/permissions';
import { TransitionError } from '../src/domain/status';
import { ValidationError } from '../src/domain/service';
import { ALL_CHECKED, setup } from './helpers';

describe('作业录入', () => {
  it('必须有标题、科目与学生；截止日期可选', () => {
    const { svc, parent, child } = setup();
    expect(() => svc.createAssignment(parent, { studentId: child.id, subject: '数学', title: '  ' })).toThrow(
      ValidationError,
    );
    expect(() => svc.createAssignment(parent, { studentId: '', subject: '数学', title: '口算' })).toThrow(
      ValidationError,
    );
    const a = svc.createAssignment(parent, { studentId: child.id, subject: '数学', title: '口算' });
    expect(a.status).toBe('todo');
    expect(a.dueDate).toBeUndefined();
  });

  it('学生只能为自己新增作业', () => {
    const { svc, parent, child } = setup();
    const sibling = svc.addChild(parent, '小红');
    expect(() => svc.createAssignment(child, { studentId: sibling.id, subject: '语文', title: '背诵' })).toThrow(
      PermissionError,
    );
    expect(svc.createAssignment(child, { studentId: child.id, subject: '语文', title: '背诵' }).createdBy).toBe(
      child.id,
    );
  });
});

describe('完整闭环：录入 → 提交 → 检查 → 订正 → 家长确认 → 复习', () => {
  it('有标准答案时比对，错误题目进入待订正', () => {
    const { svc, parent, child, db } = setup();
    const a = svc.createAssignment(parent, {
      studentId: child.id,
      subject: '数学',
      title: '第三单元练习',
      answerKey: [
        { questionNo: '1', answer: 'A' },
        { questionNo: '2', answer: '3.5' },
        { questionNo: '3', answer: 'C' },
      ],
      answerKeySource: '课本答案页',
    });
    svc.start(child, a.id);
    const { review } = svc.submit(child, a.id, {
      photoIds: ['p1'],
      clarity: 'clear',
      studentAnswers: [
        { questionNo: '1', answer: 'ａ' },
        { questionNo: '2', answer: '3.6' },
      ],
      selfCheck: ALL_CHECKED,
    });
    expect(review.items.map((i) => i.result)).toEqual(['match', 'mismatch', 'pending_manual']);
    expect(review.items[1].basis).toContain('课本答案页');

    svc.setReviewItem(child, a.id, '3', 'match');
    svc.finishCheck(child, a.id);
    expect(db.assignments[0].status).toBe('pending_correction');
    expect(svc.openIssues(a.id)).toEqual(['2']);

    svc.addCorrection(child, a.id, { questionNo: '2', reason: '小数点对错位', content: '3.5', addToReview: true });
    expect(svc.openIssues(a.id)).toEqual([]);
    expect(db.cards).toHaveLength(1);
    expect(db.cards[0].nextDate).toBe('2026-09-29');

    svc.requestConfirm(child, a.id);
    expect(() => svc.confirm(child, a.id)).toThrow('学生不能确认自己的作业');
    const conf = svc.confirm(parent, a.id);
    expect(conf.scope).toBe('all_correct');
    expect(db.assignments[0].status).toBe('confirmed');
  });

  it('没有答案时不猜测，显示待人工检查', () => {
    const { svc, parent, child } = setup();
    const a = svc.createAssignment(parent, { studentId: child.id, subject: '语文', title: '作文' });
    const { review } = svc.submit(child, a.id, {
      photoIds: ['p1'],
      clarity: 'clear',
      studentAnswers: [{ questionNo: '1', answer: 'x' }],
      selfCheck: ALL_CHECKED,
    });
    expect(review.items).toEqual([]);
  });

  it('答案比对为错误的题不能被直接改成正确', () => {
    const { svc, parent, child } = setup();
    const a = svc.createAssignment(parent, {
      studentId: child.id,
      subject: '数学',
      title: 't',
      answerKey: [{ questionNo: '1', answer: '5' }],
    });
    svc.submit(child, a.id, {
      photoIds: [],
      clarity: 'none',
      studentAnswers: [{ questionNo: '1', answer: '6' }],
      selfCheck: ALL_CHECKED,
    });
    expect(() => svc.setReviewItem(child, a.id, '1', 'match')).toThrow(ValidationError);
    svc.flagSuggestion(child, a.id, '1');
    expect(svc.latestReview(a.id)!.items[0]).toMatchObject({ result: 'doubt', flaggedWrong: true });
  });

  it('未订正的错误仍可确认“已查看”，但不会显示为全部正确', () => {
    const { svc, parent, child } = setup();
    const a = svc.createAssignment(parent, { studentId: child.id, subject: '数学', title: 't' });
    svc.submit(child, a.id, { photoIds: ['p'], clarity: 'clear', studentAnswers: [], selfCheck: ALL_CHECKED });
    svc.setReviewItem(parent, a.id, '4', 'mismatch');
    svc.finishCheck(parent, a.id);
    svc.requestConfirm(child, a.id);
    const conf = svc.confirm(parent, a.id);
    expect(conf.scope).toBe('viewed_with_open_issues');
    expect(conf.openIssues).toBe(1);
  });

  it('未上传照片时只能确认完成情况', () => {
    const { svc, parent, child } = setup();
    const a = svc.createAssignment(parent, { studentId: child.id, subject: '英语', title: '听读' });
    svc.submit(child, a.id, {
      photoIds: [],
      clarity: 'clear',
      studentAnswers: [],
      selfCheck: ALL_CHECKED,
    });
    expect(svc.latestSubmission(a.id)!.selfCheck.photoClear).toBe(false);
    svc.finishCheck(child, a.id);
    expect(svc.confirm(parent, a.id).scope).toBe('completion_only');
  });

  it('家长退回必须填写原因，修改后重新进入待检查', () => {
    const { svc, parent, child, db } = setup();
    const a = svc.createAssignment(parent, { studentId: child.id, subject: '语文', title: '抄写' });
    svc.submit(child, a.id, { photoIds: ['p'], clarity: 'clear', studentAnswers: [], selfCheck: ALL_CHECKED });
    svc.finishCheck(child, a.id);
    expect(() => svc.returnForRevision(parent, a.id, ' ')).toThrow('请填写退回原因');
    expect(() => svc.returnForRevision(child, a.id, '字迹潦草')).toThrow(PermissionError);
    svc.returnForRevision(parent, a.id, '第二行字迹潦草');
    expect(db.assignments[0].status).toBe('needs_revision');
    svc.submit(child, a.id, { photoIds: ['p2'], clarity: 'clear', studentAnswers: [], selfCheck: ALL_CHECKED });
    expect(db.assignments[0].status).toBe('pending_check');
    expect(db.submissions).toHaveLength(2);
  });

  it('已确认后有新订正会生成新版本并保留原确认记录', () => {
    const { svc, parent, child, db } = setup();
    const a = svc.createAssignment(parent, { studentId: child.id, subject: '数学', title: 't' });
    svc.submit(child, a.id, { photoIds: ['p'], clarity: 'clear', studentAnswers: [], selfCheck: ALL_CHECKED });
    svc.finishCheck(child, a.id);
    svc.confirm(parent, a.id);
    svc.addCorrection(child, a.id, { questionNo: '5', reason: '老师批改后发现', content: '12', addToReview: false });
    expect(db.assignments[0]).toMatchObject({ status: 'pending_confirm', version: 2 });
    expect(db.confirmations).toHaveLength(1);
    expect(db.confirmations[0].assignmentVersion).toBe(1);
    svc.confirm(parent, a.id);
    expect(db.confirmations.map((c) => c.assignmentVersion)).toEqual([1, 2]);
  });

  it('非法的状态跳转会被拒绝', () => {
    const { svc, parent, child } = setup();
    const a = svc.createAssignment(parent, { studentId: child.id, subject: '数学', title: 't' });
    expect(() => svc.confirm(parent, a.id)).toThrow(TransitionError);
  });

  it('修改、退回和确认写入操作记录', () => {
    const { svc, parent, child, db } = setup();
    const a = svc.createAssignment(parent, { studentId: child.id, subject: '数学', title: 't' });
    svc.submit(child, a.id, { photoIds: ['p'], clarity: 'clear', studentAnswers: [], selfCheck: ALL_CHECKED });
    svc.finishCheck(child, a.id);
    svc.confirm(parent, a.id);
    const confirmLog = db.audit.find((e) => e.action === 'assignment.confirm');
    expect(confirmLog).toMatchObject({ actorId: parent.id, targetId: a.id });
    expect(confirmLog?.detail).toContain('v1');
  });

  it('模糊照片：相关题目标为识别不清，补拍后恢复待人工检查', () => {
    const { svc, parent, child } = setup();
    const a = svc.createAssignment(parent, {
      studentId: child.id,
      subject: '数学',
      title: 't',
      answerKey: [{ questionNo: '1', answer: '5' }],
    });
    svc.submit(child, a.id, { photoIds: ['p'], clarity: 'blurry', studentAnswers: [], selfCheck: ALL_CHECKED });
    expect(svc.latestReview(a.id)!.items[0].result).toBe('unclear');
    expect(svc.retakePhotos(child, a.id, ['p2'], 'clear')).toEqual(['p']);
    expect(svc.latestReview(a.id)!.items[0].result).toBe('pending_manual');
  });
});

describe('家庭与权限', () => {
  it('邀请码一次性使用且会过期', () => {
    const { svc, parent, setNow } = setup();
    const code = svc.createInvite(parent);
    expect(code).toMatch(/^\d{6}$/);
    const p2 = svc.joinWithInvite({ code, displayName: '爸爸', pin: '5678' });
    expect(p2.role).toBe('parent');
    expect(() => svc.joinWithInvite({ code, displayName: '他人', pin: '5678' })).toThrow('邀请码无效或已失效');

    const code2 = svc.createInvite(parent);
    setNow(new Date(2026, 8, 30, 16, 0));
    expect(() => svc.joinWithInvite({ code: code2, displayName: '他人', pin: '5678' })).toThrow('已失效');
  });

  it('切换到家长身份需要正确 PIN', () => {
    const { svc, parent, child, db } = setup();
    svc.switchUser(child.id);
    expect(db.session.currentUserId).toBe(child.id);
    expect(() => svc.switchUser(parent.id, '0000')).toThrow('PIN 不正确');
    svc.switchUser(parent.id, '1234');
    expect(db.session.currentUserId).toBe(parent.id);
  });

  it('学生不能修改家庭设置或导出、删除数据', () => {
    const { svc, child } = setup();
    expect(() => svc.updateSettings(child, { remindersEnabled: false })).toThrow(PermissionError);
    expect(() => svc.exportStudentData(child, child.id)).toThrow(PermissionError);
    expect(() => svc.deleteStudentData(child, child.id)).toThrow(PermissionError);
  });

  it('家长不能操作其他家庭的孩子', () => {
    const { svc, parent, child } = setup();
    const a = svc.createAssignment(parent, { studentId: child.id, subject: '数学', title: 'x' });
    // 同一数据库中存在另一个家庭
    const otherParent = svc.createFamily({ familyName: '别家', parentName: '别人', pin: '9999' });
    expect(() => svc.createAssignment(otherParent, { studentId: child.id, subject: '数学', title: 'x' })).toThrow(
      ValidationError,
    );
    expect(() => svc.start(otherParent, a.id)).toThrow('找不到该作业');
    expect(() => svc.switchUser(child.id)).toThrow(PermissionError);
  });

  it('删除孩子数据会返回需要清理的照片', () => {
    const { svc, parent, child, db } = setup();
    const a = svc.createAssignment(parent, { studentId: child.id, subject: '数学', title: 't', noticePhotoId: 'n1' });
    svc.submit(child, a.id, { photoIds: ['p1', 'p2'], clarity: 'clear', studentAnswers: [], selfCheck: ALL_CHECKED });
    const photos = svc.deleteStudentData(parent, child.id);
    expect(photos.sort()).toEqual(['n1', 'p1', 'p2']);
    expect(db.assignments).toHaveLength(0);
    expect(db.users.find((u) => u.id === child.id)).toBeUndefined();
  });
});
