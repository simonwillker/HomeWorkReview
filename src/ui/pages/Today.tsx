import { useState } from 'react';
import { useStore } from '../../data/store';
import { inQuietHours, toDateStr } from '../../domain/dates';
import { isDue } from '../../domain/revision';
import { isOverdue } from '../../domain/status';
import type { Assignment, User } from '../../domain/types';
import { Empty, formatDate, OverdueTag, StatusBadge } from '../components';
import { navigate } from '../router';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export function useChildren(): User[] {
  const { db, me } = useStore();
  if (!me) return [];
  if (me.role === 'student') return [me];
  return db.users.filter((u) => u.familyId === me.familyId && u.role === 'student');
}

/** 家长在多个孩子之间切换；选择保存在本机 */
export function useSelectedChild(): [string | 'all', (id: string | 'all') => void] {
  const { me } = useStore();
  const key = `homework-review:child:${me?.id}`;
  const [sel, setSel] = useState<string>(() => localStorage.getItem(key) ?? 'all');
  const set = (id: string) => {
    localStorage.setItem(key, id);
    setSel(id);
  };
  return [me?.role === 'student' ? me.id : sel, set];
}

export function ChildChips({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { me } = useStore();
  const kids = useChildren();
  if (me?.role !== 'parent' || kids.length < 2) return null;
  return (
    <div className="chips" role="group" aria-label="选择孩子">
      <button className={value === 'all' ? 'chip on' : 'chip'} onClick={() => onChange('all')}>
        全部
      </button>
      {kids.map((k) => (
        <button key={k.id} className={value === k.id ? 'chip on' : 'chip'} onClick={() => onChange(k.id)}>
          {k.displayName}
        </button>
      ))}
    </div>
  );
}

export function AssignmentRow({ a, showStudent }: { a: Assignment; showStudent?: boolean }) {
  const { db, svc } = useStore();
  const today = svc.today();
  const student = db.users.find((u) => u.id === a.studentId);
  const issues = svc.openIssues(a.id).length;
  return (
    <a className="row" href={`#/a/${a.id}`}>
      <div className="row-main">
        <div className="row-title">
          {a.title}
          {showStudent && student && <span className="who"> · {student.displayName}</span>}
        </div>
        <div className="row-meta">
          {a.subject} · {formatDate(a.dueDate)}
          {a.estimatedMinutes ? ` · 约 ${a.estimatedMinutes} 分钟` : ''}
          {issues > 0 && <span className="issue-count"> · {issues} 项待订正</span>}
        </div>
      </div>
      <div className="row-side">
        <StatusBadge status={a.status} />
        {isOverdue(a, today) && <OverdueTag />}
      </div>
    </a>
  );
}

function groupBySubject(list: Assignment[]) {
  const map = new Map<string, Assignment[]>();
  for (const a of list) map.set(a.subject, [...(map.get(a.subject) ?? []), a]);
  return [...map.entries()];
}

export function TodayPage() {
  const { db, svc, me, logout } = useStore();
  const kids = useChildren();
  const [child, setChild] = useSelectedChild();
  if (!me) return null;
  const today = svc.today();
  const now = new Date();
  const family = db.families.find((f) => f.id === me.familyId)!;
  const kidIds = new Set(kids.map((k) => k.id));
  const inScope = (studentId: string) => kidIds.has(studentId) && (child === 'all' || child === studentId);

  const mine = db.assignments.filter((a) => inScope(a.studentId));
  const pendingConfirm = mine.filter((a) => a.status === 'pending_confirm');
  const returned = mine.filter((a) => a.status === 'needs_revision');
  const active = mine
    .filter((a) => a.status !== 'confirmed' && (me.role === 'student' || a.status !== 'pending_confirm'))
    .sort((x, y) => (x.dueDate ?? '9999').localeCompare(y.dueDate ?? '9999'));
  const now_ = active.filter((a) => !a.dueDate || a.dueDate <= today);
  const later = active.filter((a) => a.dueDate && a.dueDate > today);
  const doneToday = mine.filter((a) => a.status === 'confirmed' && toDateStr(new Date(a.updatedAt)) === today);
  const dueCards = db.cards.filter((c) => inScope(c.studentId) && isDue(c, today));
  const diaries = db.diaries.filter((d) => inScope(d.studentId));
  const showStudent = me.role === 'parent' && child === 'all' && kids.length > 1;

  return (
    <div className="page">
      <header className="today-head">
        <div>
          <div className="date">
            {formatDate(today)} 星期{WEEK[now.getDay()]}
          </div>
          <h1>{me.role === 'parent' ? `${me.displayName}，您好` : `${me.displayName}，今天加油`}</h1>
        </div>
        <button className="btn ghost small" onClick={logout} title={family.name}>
          切换使用者
        </button>
      </header>

      <ChildChips value={child} onChange={setChild} />

      {me.role === 'parent' && kids.length === 0 && (
        <Empty>
          还没有添加孩子。<a href="#/me">去“我的”添加</a>
        </Empty>
      )}

      {me.role === 'parent' && (
        <section className="section">
          <h2>待家长确认 {pendingConfirm.length > 0 && <span className="count">{pendingConfirm.length}</span>}</h2>
          {pendingConfirm.length === 0 ? (
            <p className="muted">目前没有需要确认的作业。</p>
          ) : (
            pendingConfirm.map((a) => (
              <a key={a.id} className="row highlight" href={`#/a/${a.id}/confirm`}>
                <div className="row-main">
                  <div className="row-title">
                    {a.title}
                    {kids.length > 1 && <span className="who"> · {db.users.find((u) => u.id === a.studentId)?.displayName}</span>}
                  </div>
                  <div className="row-meta">
                    {a.subject} · 第 {a.version} 版
                  </div>
                </div>
                <span className="btn primary small">去确认</span>
              </a>
            ))
          )}
        </section>
      )}

      {me.role === 'student' && returned.length > 0 && (
        <section className="section">
          <h2>家长退回，需要修改</h2>
          {returned.map((a) => (
            <AssignmentRow key={a.id} a={a} />
          ))}
        </section>
      )}

      <a className="review-banner" href="#/diary">
        <span>📔 日记检查</span>
        <strong>{diaries.length > 0 ? `${diaries.length} 篇` : '拍照检查日记'}</strong>
      </a>
      <a className="review-banner" href="#/review">
        <span>🔁 今日复习</span>
        <strong>{dueCards.length > 0 ? `${dueCards.length} 张卡片` : '没有待复习'}</strong>
      </a>
      {family.settings.remindersEnabled && dueCards.length > 0 && !inQuietHours(now, family.settings.quietStart, family.settings.quietEnd) && (
        <p className="muted small">提醒：今天有复习卡片待完成。</p>
      )}

      <section className="section">
        <div className="section-head">
          <h2>今天的作业</h2>
          <button className="btn primary small" onClick={() => navigate('/new')} disabled={kids.length === 0}>
            ＋ 新增作业
          </button>
        </div>
        {now_.length === 0 ? (
          <Empty>今天没有待完成的作业。</Empty>
        ) : (
          groupBySubject(now_.filter((a) => a.status !== 'needs_revision' || me.role === 'parent')).map(
            ([subject, list]) => (
              <div key={subject} className="group">
                <h3>{subject}</h3>
                {list.map((a) => (
                  <AssignmentRow key={a.id} a={a} showStudent={showStudent} />
                ))}
              </div>
            ),
          )
        )}
      </section>

      {later.length > 0 && (
        <section className="section">
          <h2>之后到期</h2>
          {later.map((a) => (
            <AssignmentRow key={a.id} a={a} showStudent={showStudent} />
          ))}
        </section>
      )}

      {doneToday.length > 0 && (
        <section className="section">
          <h2>今天已确认</h2>
          {doneToday.map((a) => (
            <AssignmentRow key={a.id} a={a} showStudent={showStudent} />
          ))}
        </section>
      )}
    </div>
  );
}
