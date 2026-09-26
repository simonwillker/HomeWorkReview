import { useState } from 'react';
import { useStore } from '../../data/store';
import { uncheckedNumbers } from '../../domain/status';
import { Empty, formatTime, Header, Modal, PhotoView, ResultBadge, useToast } from '../components';
import { navigate } from '../router';
import { CorrectionList, SCOPE_TEXT } from './Assignment';

const SELF_CHECK_LABEL = {
  allDone: '题目全部做完',
  nameAndDate: '姓名日期齐全',
  photoClear: '照片清晰',
  answersChecked: '已核对答案',
} as const;

export function ConfirmPage({ id }: { id: string }) {
  const { db, svc, me, run } = useStore();
  const toast = useToast();
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState('');
  const a = db.assignments.find((x) => x.id === id);
  if (!me || !a || a.familyId !== me.familyId) {
    return (
      <div className="page">
        <Header title="家长确认" back="/today" />
        <Empty>找不到这项作业。</Empty>
      </div>
    );
  }
  if (me.role !== 'parent') {
    return (
      <div className="page">
        <Header title="家长确认" back={`/a/${a.id}`} />
        <Empty>学生不能确认自己的作业，请家长确认。</Empty>
      </div>
    );
  }
  const student = db.users.find((u) => u.id === a.studentId);
  const sub = svc.latestSubmission(a.id);
  const review = svc.latestReview(a.id);
  const corrections = db.corrections.filter((c) => c.assignmentId === a.id);
  const issues = svc.openIssues(a.id);
  const unchecked = review ? uncheckedNumbers(review.items) : [];
  const scope = svc.confirmationScope(a);
  const waiting = a.status === 'pending_confirm';

  return (
    <div className="page">
      <Header title="家长确认" back="/today" />
      <section className="card">
        <div className="muted">
          {student?.displayName} · {a.subject} · 第 {a.version} 版
        </div>
        <h2 className="detail-title">{a.title}</h2>
        <div className="muted small">更新时间：{formatTime(a.updatedAt)}</div>
        {a.requirements && <p className="pre">要求：{a.requirements}</p>}
      </section>

      <section className="card">
        <h3>原图</h3>
        {sub && sub.photoIds.length > 0 ? (
          <>
            {sub.clarity === 'blurry' && <p className="warn">⚠ 照片可能看不清，可退回请孩子补拍。</p>}
            <div className="thumbs large">
              {sub.photoIds.map((p, i) => (
                <PhotoView key={p} id={p} alt={`作业照片 ${i + 1}`} />
              ))}
            </div>
          </>
        ) : (
          <p className="warn">未上传照片：您只能确认完成情况，无法核对书写内容。</p>
        )}
      </section>

      {sub && (
        <section className="card">
          <h3>完成项（自查）</h3>
          <ul className="self-check">
            {(Object.keys(SELF_CHECK_LABEL) as (keyof typeof SELF_CHECK_LABEL)[]).map((k) => (
              <li key={k} className={sub.selfCheck[k] ? 'yes' : 'no'}>
                {sub.selfCheck[k] ? '✓ 已勾选' : '✗ 未勾选'}：{SELF_CHECK_LABEL[k]}
              </li>
            ))}
          </ul>
        </section>
      )}

      {review && review.items.length > 0 && (
        <section className="card">
          <h3>检查结果</h3>
          <ul className="review-items compact">
            {review.items.map((i) => (
              <li key={i.questionNo} className={`review-item rs-${i.result}`}>
                <div className="ri-head">
                  <strong>第 {i.questionNo} 题</strong>
                  <ResultBadge result={i.result} />
                </div>
                {i.method === 'answer_key' && (
                  <div className="ri-body small">
                    学生：{i.studentAnswer ?? '—'} ／ 参考：{i.referenceAnswer}
                    {i.basis ? `（${i.basis}）` : ''}
                  </div>
                )}
                {corrections.some((c) => c.questionNo === i.questionNo) && <div className="ok-text small">已订正</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <CorrectionList corrections={corrections} />

      {(issues.length > 0 || unchecked.length > 0) && (
        <section className="card notice warn-card" role="status">
          {issues.length > 0 && <p>还有 {issues.length} 题明确错误或存疑未订正：第 {issues.join('、')} 题。</p>}
          {unchecked.length > 0 && <p>还有 {unchecked.length} 题待人工检查：第 {unchecked.join('、')} 题。</p>}
          <p className="small">您仍可确认“已查看”，记录中不会显示为“全部正确”。</p>
        </section>
      )}

      {waiting ? (
        <>
          <p className="muted small center">确认表示您已查看完成情况与订正记录，不代表学校正式批改。</p>
          <p className="center">
            确认后记录为：<strong>{SCOPE_TEXT[scope]}</strong>
          </p>
          <div className="actions sticky">
            <button className="btn secondary" onClick={() => setReturning(true)}>
              退回修改
            </button>
            <button
              className="btn primary"
              onClick={() => {
                if (toast.attempt(() => run((s, u) => s.confirm(u!, a.id)), '已确认')) navigate('/today');
              }}
            >
              确认
            </button>
          </div>
        </>
      ) : (
        <p className="muted center">当前状态不需要确认。</p>
      )}

      {returning && (
        <Modal title="退回修改" onClose={() => setReturning(false)}>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              if (toast.attempt(() => run((s, u) => s.returnForRevision(u!, a.id, reason)), '已退回')) {
                setReturning(false);
                navigate('/today');
              }
            }}
          >
            <label>
              退回原因（必填，孩子会看到）
              <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：第 3 题照片缺页，请补拍" autoFocus />
            </label>
            <div className="actions">
              <button type="button" className="btn ghost" onClick={() => setReturning(false)}>
                取消
              </button>
              <button type="submit" className="btn primary">
                退回
              </button>
            </div>
          </form>
          {toast.node}
        </Modal>
      )}
      {toast.node}
    </div>
  );
}
