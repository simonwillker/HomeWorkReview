import { useState } from 'react';
import { cleanupPhotos, useStore } from '../../data/store';
import { getPhoto } from '../../data/photos';
import type { HomeworkService } from '../../domain/service';
import { formatTime, Header, Modal, useToast } from '../components';

async function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

export function MePage() {
  const { db, me, run, logout } = useStore();
  const toast = useToast();
  const [childName, setChildName] = useState('');
  const [invite, setInvite] = useState<string>();
  const [deleting, setDeleting] = useState<string>();
  const [pins, setPins] = useState({ old: '', next: '' });
  const family = db.families.find((f) => f.id === me?.familyId);
  const [intervals, setIntervals] = useState(family?.settings.reviewIntervals.join(', ') ?? '');
  if (!me || !family) return null;
  const members = db.users.filter((u) => u.familyId === me.familyId);
  const kids = members.filter((u) => u.role === 'student');
  const parents = members.filter((u) => u.role === 'parent');
  const isParent = me.role === 'parent';
  const s = family.settings;
  const now = new Date();
  const activeInvites = family.invites.filter((i) => !i.usedAt && !i.revokedAt && new Date(i.expiresAt) > now);

  const exportChild = async (id: string) => {
    let data: ReturnType<HomeworkService['exportStudentData']> | undefined;
    if (!toast.attempt(() => (data = run((svc, u) => svc.exportStudentData(u!, id))))) return;
    const photoIds = [
      ...data!.assignments.flatMap((a) => (a.noticePhotoId ? [a.noticePhotoId] : [])),
      ...data!.submissions.flatMap((x) => x.photoIds),
    ];
    const photos: Record<string, string> = {};
    for (const pid of photoIds) {
      const b = await getPhoto(pid).catch(() => undefined);
      if (b) photos[pid] = await blobToDataUrl(b);
    }
    const blob = new Blob([JSON.stringify({ ...data, photos }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `作业记录-${data!.student.displayName}-${data!.exportedAt.slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.show('已导出');
  };

  return (
    <div className="page">
      <Header title="我的" />
      <section className="card">
        <div className="me-head">
          <span className="avatar">{me.displayName.slice(0, 1)}</span>
          <div>
            <strong>{me.displayName}</strong>
            <div className="muted small">
              {isParent ? '家长' : '学生'} · {family.name}
            </div>
          </div>
          <button className="btn ghost small" onClick={logout}>
            切换使用者
          </button>
        </div>
      </section>

      <section className="card">
        <h3>家庭成员</h3>
        <ul className="members">
          {parents.map((p) => (
            <li key={p.id}>
              {p.displayName} <span className="badge">家长</span>
            </li>
          ))}
          {kids.map((k) => (
            <li key={k.id}>
              {k.displayName} <span className="badge">学生</span>
            </li>
          ))}
        </ul>
        {isParent && (
          <>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (toast.attempt(() => run((svc, u) => svc.addChild(u!, childName)), '已添加')) setChildName('');
              }}
            >
              <input aria-label="孩子的称呼" placeholder="孩子的称呼" value={childName} onChange={(e) => setChildName(e.target.value)} />
              <button className="btn secondary" type="submit">
                添加孩子
              </button>
            </form>
            <button
              className="btn secondary"
              onClick={() => toast.attempt(() => setInvite(run((svc, u) => svc.createInvite(u!))))}
            >
              邀请另一位家长
            </button>
            {activeInvites.length > 0 && (
              <ul className="invites">
                {activeInvites.map((i) => (
                  <li key={i.code}>
                    邀请码 <code>{i.code}</code> · {formatTime(i.expiresAt)} 前有效
                    <button
                      className="btn ghost small"
                      onClick={() => toast.attempt(() => run((svc, u) => svc.revokeInvite(u!, i.code)), '已作废')}
                    >
                      作废
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <p className="muted small">孩子的照片和学习记录只在本家庭的授权成员之间可见。</p>
      </section>

      {isParent && (
        <section className="card">
          <h3>提醒与复习</h3>
          <label className="check">
            <input
              type="checkbox"
              checked={s.remindersEnabled}
              onChange={(e) => toast.attempt(() => run((svc, u) => svc.updateSettings(u!, { remindersEnabled: e.target.checked })))}
            />
            提醒作业截止和复习时间
          </label>
          <div className="two-col">
            <label>
              夜间免打扰开始
              <input
                type="time"
                value={s.quietStart}
                onChange={(e) => toast.attempt(() => run((svc, u) => svc.updateSettings(u!, { quietStart: e.target.value })))}
              />
            </label>
            <label>
              结束
              <input
                type="time"
                value={s.quietEnd}
                onChange={(e) => toast.attempt(() => run((svc, u) => svc.updateSettings(u!, { quietEnd: e.target.value })))}
              />
            </label>
          </div>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const list = intervals
                .split(/[,，\s]+/)
                .filter(Boolean)
                .map(Number);
              toast.attempt(() => run((svc, u) => svc.updateSettings(u!, { reviewIntervals: list })), '复习间隔已更新');
            }}
          >
            <label>
              复习间隔（天，用逗号分隔）
              <input value={intervals} onChange={(e) => setIntervals(e.target.value)} />
              <small>默认 1, 3, 7：次日、3 天后、7 天后。只影响之后安排的复习。</small>
            </label>
            <button className="btn secondary" type="submit">
              保存间隔
            </button>
          </form>
          <p className="muted small">系统推送通知将在后续版本提供；目前在“今日”页面内提醒。</p>
        </section>
      )}

      <section className="card">
        <h3>语言</h3>
        <label className="check">
          <input type="radio" checked readOnly /> 简体中文
        </label>
        <label className="check muted">
          <input type="radio" disabled /> 日本語（后续版本）
        </label>
      </section>

      {isParent && (
        <section className="card">
          <h3>修改 PIN</h3>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (toast.attempt(() => run((svc, u) => svc.changePin(u!, pins.old, pins.next)), 'PIN 已修改')) {
                setPins({ old: '', next: '' });
              }
            }}
          >
            <input type="password" inputMode="numeric" placeholder="原 PIN" aria-label="原 PIN" value={pins.old} onChange={(e) => setPins({ ...pins, old: e.target.value })} />
            <input type="password" inputMode="numeric" placeholder="新 PIN" aria-label="新 PIN" value={pins.next} onChange={(e) => setPins({ ...pins, next: e.target.value })} />
            <button className="btn secondary" type="submit">
              修改
            </button>
          </form>
        </section>
      )}

      {isParent && kids.length > 0 && (
        <section className="card">
          <h3>数据管理</h3>
          {kids.map((k) => (
            <div key={k.id} className="data-row">
              <span>{k.displayName}</span>
              <button className="btn secondary small" onClick={() => void exportChild(k.id)}>
                导出
              </button>
              <button className="btn danger small" onClick={() => setDeleting(k.id)}>
                删除
              </button>
            </div>
          ))}
        </section>
      )}

      {isParent && (
        <section className="card">
          <h3>操作记录</h3>
          <ul className="audit">
            {db.audit
              .filter((e) => e.familyId === me.familyId)
              .slice(-15)
              .reverse()
              .map((e) => (
                <li key={e.id}>
                  <time>{formatTime(e.at)}</time> {db.users.find((u) => u.id === e.actorId)?.displayName ?? '已删除成员'} ·{' '}
                  {AUDIT_LABEL[e.action] ?? e.action}
                  {e.detail && !e.detail.startsWith('{') ? `：${e.detail}` : ''}
                </li>
              ))}
          </ul>
        </section>
      )}

      {deleting && (
        <Modal title="删除孩子的全部数据？" onClose={() => setDeleting(undefined)}>
          <p>
            将删除 <strong>{kids.find((k) => k.id === deleting)?.displayName}</strong> 的全部作业、照片、订正、确认记录和复习卡片，且无法恢复。
          </p>
          {parents.length > 1 && <p className="warn">家庭中的其他家长也将无法再看到这些数据。</p>}
          <p className="muted small">建议先导出备份。</p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setDeleting(undefined)}>
              取消
            </button>
            <button
              className="btn danger"
              onClick={() => {
                let photos: string[] = [];
                if (toast.attempt(() => (photos = run((svc, u) => svc.deleteStudentData(u!, deleting))), '已删除')) {
                  void cleanupPhotos(photos);
                  setDeleting(undefined);
                }
              }}
            >
              确认删除
            </button>
          </div>
        </Modal>
      )}

      {invite && (
        <Modal title="邀请码" onClose={() => setInvite(undefined)}>
          <p className="invite-code">{invite}</p>
          <p>请另一位家长在 App 首页选择“用邀请码加入”，输入此邀请码。24 小时内有效，只能使用一次。</p>
          <button className="btn primary" onClick={() => setInvite(undefined)}>
            好的
          </button>
        </Modal>
      )}
      {toast.node}
    </div>
  );
}

const AUDIT_LABEL: Record<string, string> = {
  'family.create': '创建家庭',
  'member.add_child': '添加孩子',
  'member.rename': '修改称呼',
  'member.change_pin': '修改 PIN',
  'invite.create': '生成邀请码',
  'invite.revoke': '作废邀请码',
  'invite.accept': '通过邀请加入',
  'settings.update': '修改设置',
  'assignment.create': '新增作业',
  'assignment.edit': '修改作业',
  'assignment.delete': '删除作业',
  'assignment.start': '开始作业',
  'assignment.submit': '提交作业',
  'assignment.request_confirm': '提交家长确认',
  'assignment.confirm': '家长确认',
  'assignment.return': '退回修改',
  'assignment.new_version': '生成新版本',
  'review.set_item': '检查题目',
  'review.flag_suggestion': '标记建议有误',
  'review.finish': '完成检查',
  'submission.retake': '补拍照片',
  'correction.add': '添加订正',
  'card.create': '收藏知识点',
  'card.reschedule': '调整复习日期',
  'card.delete': '删除复习卡片',
  'data.export': '导出数据',
  'data.delete_student': '删除孩子数据',
};
