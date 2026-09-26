import { useState } from 'react';
import { useStore } from '../../data/store';
import { isDue } from '../../domain/revision';
import { SUBJECTS, type RevisionCard } from '../../domain/types';
import { Empty, formatDate, Header, useToast } from '../components';
import { navigate } from '../router';
import { ChildChips, useChildren, useSelectedChild } from './Today';

export function ReviewPage() {
  const { db, svc, me } = useStore();
  const kids = useChildren();
  const [child, setChild] = useSelectedChild();
  if (!me) return null;
  const today = svc.today();
  const kidIds = new Set(kids.map((k) => k.id));
  const cards = db.cards.filter((c) => kidIds.has(c.studentId) && (child === 'all' || c.studentId === child));
  const due = cards.filter((c) => isDue(c, today)).sort((x, y) => x.nextDate.localeCompare(y.nextDate));
  const upcoming = cards
    .filter((c) => c.mastery === 'learning' && c.nextDate > today)
    .sort((x, y) => x.nextDate.localeCompare(y.nextDate));
  const mastered = cards.filter((c) => c.mastery === 'mastered');

  return (
    <div className="page">
      <Header
        title="今日复习"
        right={
          <button className="btn ghost small" onClick={() => navigate('/review/new')} disabled={kids.length === 0}>
            ＋ 知识点
          </button>
        }
      />
      <ChildChips value={child} onChange={setChild} />
      {due.length > 0 ? (
        <Flashcard key={due[0].id} card={due[0]} remaining={due.length} showStudent={me.role === 'parent' && kids.length > 1} />
      ) : (
        <Empty>
          今天的复习都完成了 🎉
          <br />
          <span className="muted small">订正过的题和收藏的知识点会按计划出现在这里。</span>
        </Empty>
      )}

      {upcoming.length > 0 && (
        <section className="section">
          <h2>之后的复习</h2>
          {upcoming.map((c) => (
            <CardRow key={c.id} card={c} />
          ))}
        </section>
      )}
      {mastered.length > 0 && (
        <section className="section">
          <h2>已掌握</h2>
          {mastered.map((c) => (
            <CardRow key={c.id} card={c} />
          ))}
        </section>
      )}
    </div>
  );
}

function Flashcard({ card, remaining, showStudent }: { card: RevisionCard; remaining: number; showStudent: boolean }) {
  const { db, run } = useStore();
  const toast = useToast();
  const [attempt, setAttempt] = useState('');
  const [revealed, setRevealed] = useState(false);
  const student = db.users.find((u) => u.id === card.studentId);
  const answer = (r: 'known' | 'unsure') =>
    toast.attempt(
      () => run((s, u) => s.answerCard(u!, card.id, r)),
      r === 'known' ? '很好！已安排下一次复习' : '没关系，明天再练一次',
    );

  return (
    <section className="flashcard" aria-live="polite">
      <div className="fc-meta">
        <span className="badge">{card.subject}</span>
        <span className="muted small">
          剩余 {remaining} 张 · 已复习 {card.history.length} 次{showStudent && student ? ` · ${student.displayName}` : ''}
        </span>
      </div>
      <h2>{card.knowledgePoint}</h2>
      <p className="fc-question pre">{card.question}</p>
      {!revealed ? (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            setRevealed(true);
          }}
        >
          <label>
            先写下你的答案或思路
            <textarea rows={3} value={attempt} onChange={(e) => setAttempt(e.target.value)} />
          </label>
          <div className="actions">
            <button type="button" className="btn ghost" onClick={() => setRevealed(true)}>
              我已在纸上作答
            </button>
            <button type="submit" className="btn primary" disabled={!attempt.trim()}>
              提交，查看参考
            </button>
          </div>
        </form>
      ) : (
        <div className="fc-answer">
          {attempt.trim() && (
            <div className="block">
              <h3>我的作答</h3>
              <p className="pre">{attempt}</p>
            </div>
          )}
          {card.wrongReason && (
            <div className="block">
              <h3>当时的错误原因</h3>
              <p className="pre">{card.wrongReason}</p>
            </div>
          )}
          <div className="block">
            <h3>正确思路</h3>
            <p className="pre">{card.correctApproach}</p>
          </div>
          <div className="actions">
            <button className="btn secondary big" onClick={() => answer('unsure')}>
              还不熟
            </button>
            <button className="btn primary big" onClick={() => answer('known')}>
              会了
            </button>
          </div>
        </div>
      )}
      {toast.node}
    </section>
  );
}

function CardRow({ card }: { card: RevisionCard }) {
  const { me, run } = useStore();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(card.nextDate);
  return (
    <div className="row static">
      <div className="row-main">
        <div className="row-title">{card.knowledgePoint}</div>
        <div className="row-meta">
          {card.subject} · 复习 {card.history.length} 次 ·{' '}
          {card.mastery === 'mastered' ? '已掌握' : `下次 ${formatDate(card.nextDate)}`}
        </div>
        {editing && (
          <div className="inline-form">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="下次复习日期" />
            <button
              className="btn secondary small"
              onClick={() => {
                if (toast.attempt(() => run((s, u) => s.rescheduleCard(u!, card.id, date)), '已调整')) setEditing(false);
              }}
            >
              保存
            </button>
          </div>
        )}
      </div>
      {me?.role === 'parent' && !editing && (
        <button className="btn ghost small" onClick={() => setEditing(true)}>
          调整日期
        </button>
      )}
      {toast.node}
    </div>
  );
}

export function NewCardPage() {
  const { run } = useStore();
  const kids = useChildren();
  const [selected] = useSelectedChild();
  const toast = useToast();
  const [studentId, setStudentId] = useState(selected !== 'all' ? selected : (kids[0]?.id ?? ''));
  const [subject, setSubject] = useState<string>(SUBJECTS[0]);
  const [knowledgePoint, setKnowledgePoint] = useState('');
  const [question, setQuestion] = useState('');
  const [correctApproach, setCorrectApproach] = useState('');

  return (
    <div className="page">
      <Header title="收藏知识点" back="/review" />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (
            toast.attempt(() =>
              run((s, u) => s.addManualCard(u!, { studentId, subject, knowledgePoint, question, correctApproach })),
            )
          )
            navigate('/review');
        }}
      >
        {kids.length > 1 && (
          <div className="chips">
            {kids.map((k) => (
              <button type="button" key={k.id} className={studentId === k.id ? 'chip on' : 'chip'} onClick={() => setStudentId(k.id)}>
                {k.displayName}
              </button>
            ))}
          </div>
        )}
        <div className="chips">
          {SUBJECTS.map((s) => (
            <button type="button" key={s} className={subject === s ? 'chip on' : 'chip'} onClick={() => setSubject(s)}>
              {s}
            </button>
          ))}
        </div>
        <label>
          知识点
          <input value={knowledgePoint} onChange={(e) => setKnowledgePoint(e.target.value)} placeholder="例如：“的、地、得”的用法" />
        </label>
        <label>
          题目或提示（复习时显示）
          <textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} />
        </label>
        <label>
          正确思路（作答后才显示）
          <textarea rows={3} value={correctApproach} onChange={(e) => setCorrectApproach(e.target.value)} />
        </label>
        <button className="btn primary" type="submit">
          保存
        </button>
      </form>
      {toast.node}
    </div>
  );
}
