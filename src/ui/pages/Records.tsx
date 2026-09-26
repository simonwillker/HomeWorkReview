import { useState } from 'react';
import { useStore } from '../../data/store';
import { addDays, toDateStr } from '../../domain/dates';
import { Empty, Header } from '../components';
import { AssignmentRow, ChildChips, useChildren, useSelectedChild } from './Today';

const RANGES = [
  { key: '7', label: '近 7 天', days: 7 },
  { key: '30', label: '近 30 天', days: 30 },
  { key: 'all', label: '全部', days: 0 },
];

export function RecordsPage() {
  const { db, svc } = useStore();
  const kids = useChildren();
  const [child, setChild] = useSelectedChild();
  const [subject, setSubject] = useState('全部');
  const [range, setRange] = useState('7');
  const today = svc.today();
  const days = RANGES.find((r) => r.key === range)!.days;
  const from = days ? addDays(today, -days + 1) : '';
  const kidIds = new Set(kids.map((k) => k.id));
  const inChild = (id: string) => kidIds.has(id) && (child === 'all' || child === id);

  // 按创建日期或截止日期落在范围内筛选
  const dayOf = (a: { dueDate?: string; createdAt: string }) => a.dueDate ?? toDateStr(new Date(a.createdAt));
  const assignments = db.assignments
    .filter((a) => inChild(a.studentId))
    .filter((a) => subject === '全部' || a.subject === subject)
    .filter((a) => !from || dayOf(a) >= from)
    .sort((x, y) => dayOf(y).localeCompare(dayOf(x)));
  const subjects = ['全部', ...new Set(db.assignments.filter((a) => inChild(a.studentId)).map((a) => a.subject))];

  const cards = db.cards.filter((c) => inChild(c.studentId) && (subject === '全部' || c.subject === subject));
  const reviewsInRange = cards.flatMap((c) => c.history).filter((h) => !from || h.date >= from);

  const bySubject = new Map<string, { total: number; confirmed: number }>();
  for (const a of assignments) {
    const s = bySubject.get(a.subject) ?? { total: 0, confirmed: 0 };
    s.total++;
    if (a.status === 'confirmed') s.confirmed++;
    bySubject.set(a.subject, s);
  }
  const byDate = new Map<string, typeof assignments>();
  for (const a of assignments) byDate.set(dayOf(a), [...(byDate.get(dayOf(a)) ?? []), a]);

  return (
    <div className="page">
      <Header title="学习记录" />
      <ChildChips value={child} onChange={setChild} />
      <div className="chips" role="group" aria-label="时间范围">
        {RANGES.map((r) => (
          <button key={r.key} className={range === r.key ? 'chip on' : 'chip'} onClick={() => setRange(r.key)}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="科目">
        {subjects.map((s) => (
          <button key={s} className={subject === s ? 'chip on' : 'chip'} onClick={() => setSubject(s)}>
            {s}
          </button>
        ))}
      </div>

      <section className="stats">
        <div className="stat">
          <strong>{assignments.length}</strong>
          <span>作业</span>
        </div>
        <div className="stat">
          <strong>{assignments.filter((a) => a.status === 'confirmed').length}</strong>
          <span>已确认</span>
        </div>
        <div className="stat">
          <strong>{reviewsInRange.length}</strong>
          <span>复习次数</span>
        </div>
        <div className="stat">
          <strong>{cards.filter((c) => c.mastery === 'mastered').length}</strong>
          <span>已掌握卡片</span>
        </div>
      </section>

      {bySubject.size > 0 && (
        <section className="section">
          <h2>按科目</h2>
          <table className="table">
            <thead>
              <tr>
                <th>科目</th>
                <th>作业</th>
                <th>已确认</th>
              </tr>
            </thead>
            <tbody>
              {[...bySubject.entries()].map(([s, v]) => (
                <tr key={s}>
                  <td>{s}</td>
                  <td>{v.total}</td>
                  <td>{v.confirmed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="section">
        <h2>按日期</h2>
        {assignments.length === 0 ? (
          <Empty>这段时间没有记录。</Empty>
        ) : (
          [...byDate.entries()].map(([d, list]) => (
            <div key={d} className="group">
              <h3>{d}</h3>
              {list.map((a) => (
                <AssignmentRow key={a.id} a={a} showStudent={child === 'all' && kids.length > 1} />
              ))}
            </div>
          ))
        )}
      </section>

      {cards.length > 0 && (
        <section className="section">
          <h2>复习卡片</h2>
          <table className="table">
            <thead>
              <tr>
                <th>知识点</th>
                <th>复习次数</th>
                <th>下一次</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id}>
                  <td>{c.knowledgePoint}</td>
                  <td>{c.history.length}</td>
                  <td>{c.mastery === 'mastered' ? '已掌握' : c.nextDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
