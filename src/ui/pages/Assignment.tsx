import { useState } from 'react';
import { cleanupPhotos, useStore } from '../../data/store';
import { isOverdue, STATUS_LABEL } from '../../domain/status';
import type { Assignment, Correction, SelfCheck } from '../../domain/types';
import {
  Empty,
  formatDate,
  formatTime,
  Header,
  Modal,
  OverdueTag,
  PhotoPicker,
  PhotoView,
  StatusBadge,
  useToast,
  type PickedPhoto,
} from '../components';
import { navigate } from '../router';

const SELF_CHECK_ITEMS: { key: keyof SelfCheck; label: string }[] = [
  { key: 'allDone', label: '题目全部做完了' },
  { key: 'nameAndDate', label: '姓名、日期写齐了' },
  { key: 'photoClear', label: '照片清晰、没有缺页' },
  { key: 'answersChecked', label: '已经核对过答案' },
];

export function AssignmentPage({ id }: { id: string }) {
  const { db, svc, me, run } = useStore();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const a = db.assignments.find((x) => x.id === id);
  if (!me) return null;
  if (!a || a.familyId !== me.familyId || (me.role === 'student' && a.studentId !== me.id)) {
    return (
      <div className="page">
        <Header title="作业详情" back="/today" />
        <Empty>找不到这项作业。</Empty>
      </div>
    );
  }
  const student = db.users.find((u) => u.id === a.studentId);
  const submissions = db.submissions.filter((s) => s.assignmentId === a.id);
  const corrections = db.corrections.filter((c) => c.assignmentId === a.id);
  const confirmations = db.confirmations.filter((c) => c.assignmentId === a.id);
  const lastReturn = [...confirmations].reverse().find((c) => c.conclusion === 'returned');
  const openIssues = svc.openIssues(a.id);
  const canSubmit = a.status === 'todo' || a.status === 'in_progress' || a.status === 'needs_revision';

  return (
    <div className="page">
      <Header title="作业详情" back="/today" />
      <section className="card">
        <div className="detail-head">
          <div>
            <div className="muted">
              {a.subject}
              {me.role === 'parent' && student ? ` · ${student.displayName}` : ''}
            </div>
            <h2 className="detail-title">{a.title}</h2>
            <div className="muted">
              截止：{formatDate(a.dueDate)}
              {a.estimatedMinutes ? ` · 预计 ${a.estimatedMinutes} 分钟` : ''} · 第 {a.version} 版
            </div>
          </div>
          <div className="row-side">
            <StatusBadge status={a.status} />
            {isOverdue(a, svc.today()) && <OverdueTag />}
          </div>
        </div>
        {a.requirements && (
          <div className="block">
            <h3>要求</h3>
            <p className="pre">{a.requirements}</p>
          </div>
        )}
        {a.noticePhotoId && (
          <div className="block">
            <h3>作业通知</h3>
            <PhotoView id={a.noticePhotoId} alt="作业通知照片" />
          </div>
        )}
        {a.answerKey.length > 0 && (
          <p className="muted small">
            已录入 {a.answerKey.length} 题参考答案{a.answerKeySource ? `（来源：${a.answerKeySource}）` : ''}，提交后显示答案比对。
          </p>
        )}
        {a.status === 'todo' && (
          <div className="actions">
            <button className="btn primary" onClick={() => toast.attempt(() => run((s, u) => s.start(u!, a.id)))}>
              开始做作业
            </button>
            <button className="btn ghost" onClick={() => setConfirmDelete(true)}>
              删除
            </button>
          </div>
        )}
      </section>

      {a.status === 'needs_revision' && lastReturn && (
        <section className="card notice warn-card" role="status">
          <h3>家长退回修改</h3>
          <p>原因：{lastReturn.returnReason}</p>
          <p className="muted small">修改后重新提交，会再次进入“待检查”。</p>
        </section>
      )}

      {canSubmit && <SubmitForm a={a} />}

      {a.status === 'pending_check' && (
        <section className="card">
          <h3>下一步：检查</h3>
          <p>查看答案比对与需要人工检查的题目，标记错题后完成检查。</p>
          <button className="btn primary" onClick={() => navigate(`/a/${a.id}/check`)}>
            查看检查结果
          </button>
        </section>
      )}

      {a.status === 'pending_correction' && (
        <section className="card">
          <h3>待订正</h3>
          {openIssues.length > 0 ? (
            <p>
              还有 <strong>{openIssues.length}</strong> 题未订正：第 {openIssues.join('、')} 题
            </p>
          ) : (
            <p>错题都已订正，可以提交家长确认。</p>
          )}
          <CorrectionForm a={a} suggestions={openIssues} />
          <button
            className="btn primary block-btn"
            onClick={() => {
              if (openIssues.length > 0 && !window.confirm('还有未订正的题目，家长只能确认“已查看”。确定提交吗？')) return;
              toast.attempt(() => run((s, u) => s.requestConfirm(u!, a.id)), '已提交，等待家长确认');
            }}
          >
            提交家长确认
          </button>
        </section>
      )}

      {a.status === 'pending_confirm' && (
        <section className="card">
          <h3>等待家长确认</h3>
          {me.role === 'parent' ? (
            <button className="btn primary" onClick={() => navigate(`/a/${a.id}/confirm`)}>
              去确认
            </button>
          ) : (
            <p className="muted">已提交给家长，确认前仍可补充订正。</p>
          )}
          <CorrectionForm a={a} suggestions={openIssues} collapsed />
        </section>
      )}

      {a.status === 'confirmed' && (
        <section className="card">
          <h3>已确认</h3>
          <ConfirmationSummary a={a} />
          <CorrectionForm a={a} suggestions={[]} collapsed note="已确认的作业添加订正后，会生成新版本并重新请求家长确认，原确认记录会保留。" />
        </section>
      )}

      <CorrectionList corrections={corrections} />

      {(submissions.length > 0 || confirmations.length > 0) && (
        <section className="card">
          <h3>历史版本</h3>
          <ul className="timeline">
            {[
              ...submissions.map((s) => ({
                at: s.submittedAt,
                text: `提交（第 ${s.assignmentVersion} 版），${s.photoIds.length} 张照片 · ${db.users.find((u) => u.id === s.submittedBy)?.displayName ?? ''}`,
                photos: s.photoIds,
              })),
              ...confirmations.map((c) => ({
                at: c.at,
                text:
                  c.conclusion === 'returned'
                    ? `退回修改（第 ${c.assignmentVersion} 版）：${c.returnReason} · ${db.users.find((u) => u.id === c.by)?.displayName ?? ''}`
                    : `家长确认（第 ${c.assignmentVersion} 版）${c.openIssues ? `，${c.openIssues} 项未订正` : ''} · ${db.users.find((u) => u.id === c.by)?.displayName ?? ''}`,
                photos: [] as string[],
              })),
            ]
              .sort((x, y) => x.at.localeCompare(y.at))
              .map((e, i) => (
                <li key={i}>
                  <time>{formatTime(e.at)}</time>
                  <span>{e.text}</span>
                  {e.photos.length > 0 && (
                    <div className="thumbs">
                      {e.photos.map((p, j) => (
                        <PhotoView key={p} id={p} alt={`提交照片 ${j + 1}`} />
                      ))}
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}

      {confirmDelete && (
        <Modal title="删除这项作业？" onClose={() => setConfirmDelete(false)}>
          <p>删除后无法恢复。</p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
              取消
            </button>
            <button
              className="btn danger"
              onClick={() => {
                let photos: string[] = [];
                if (toast.attempt(() => (photos = run((s, u) => s.deleteAssignment(u!, a.id))))) {
                  void cleanupPhotos(photos);
                  navigate('/today');
                }
              }}
            >
              删除
            </button>
          </div>
        </Modal>
      )}
      {toast.node}
    </div>
  );
}

function SubmitForm({ a }: { a: Assignment }) {
  const { run } = useStore();
  const toast = useToast();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [check, setCheck] = useState<SelfCheck>({ allDone: false, nameAndDate: false, photoClear: false, answersChecked: false });
  const blurry = photos.some((p) => p.clarity === 'blurry');
  const allChecked = SELF_CHECK_ITEMS.every((i) => (i.key === 'photoClear' && photos.length === 0) || check[i.key]);

  const submit = () => {
    if (!allChecked && !window.confirm('自查清单还有未勾选的项目，确定提交吗？')) return;
    if (blurry && !window.confirm('有照片看不清，家长可能无法核对。仍然提交吗？')) return;
    toast.attempt(
      () =>
        run((s, u) =>
          s.submit(u!, a.id, {
            photoIds: photos.map((p) => p.id),
            clarity: blurry ? 'blurry' : 'clear',
            studentAnswers: Object.entries(answers).map(([questionNo, answer]) => ({ questionNo, answer })),
            selfCheck: check,
          }),
        ),
      '已提交，进入检查',
    );
  };

  return (
    <section className="card">
      <h3>{a.status === 'needs_revision' ? '修改后重新提交' : '完成并提交'}</h3>
      <div className="field">
        <span className="field-label">作业照片（可选，可多张）</span>
        <PhotoPicker photos={photos} onChange={setPhotos} label="拍摄作业" />
        {photos.length === 0 && (
          <p className="muted small">
            未上传照片也可以标记完成，但家长只能确认完成情况，无法核对书写内容。
          </p>
        )}
      </div>
      {a.answerKey.length > 0 && (
        <div className="field">
          <span className="field-label">填写你的答案（用于答案比对）</span>
          <div className="answer-grid">
            {a.answerKey.map((k) => (
              <label key={k.questionNo} className="answer-cell">
                <span>第 {k.questionNo} 题</span>
                <input
                  value={answers[k.questionNo] ?? ''}
                  onChange={(e) => setAnswers({ ...answers, [k.questionNo]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </div>
      )}
      <fieldset className="checklist">
        <legend>自查清单</legend>
        {SELF_CHECK_ITEMS.map((i) => (
          <label key={i.key} className="check">
            <input
              type="checkbox"
              checked={check[i.key]}
              disabled={i.key === 'photoClear' && photos.length === 0}
              onChange={(e) => setCheck({ ...check, [i.key]: e.target.checked })}
            />
            {i.label}
            {i.key === 'photoClear' && photos.length === 0 && <span className="muted small">（未上传照片）</span>}
          </label>
        ))}
      </fieldset>
      <button className="btn primary block-btn" onClick={submit}>
        ✓ 标记完成并提交检查
      </button>
      {toast.node}
    </section>
  );
}

export function CorrectionForm({
  a,
  suggestions,
  collapsed,
  note,
}: {
  a: Assignment;
  suggestions: string[];
  collapsed?: boolean;
  note?: string;
}) {
  const { run } = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(!collapsed);
  const [questionNo, setQuestionNo] = useState(suggestions[0] ?? '');
  const [reason, setReason] = useState('');
  const [content, setContent] = useState('');
  const [addToReview, setAddToReview] = useState(true);
  const [knowledgePoint, setKnowledgePoint] = useState('');

  if (!open) {
    return (
      <button className="btn secondary" onClick={() => setOpen(true)}>
        ＋ 添加订正
      </button>
    );
  }
  const save = () => {
    const ok = toast.attempt(
      () =>
        run((s, u) =>
          s.addCorrection(u!, a.id, { questionNo, reason, content, addToReview, knowledgePoint }),
        ),
      addToReview ? '订正已保存，并加入复习' : '订正已保存',
    );
    if (ok) {
      setReason('');
      setContent('');
      setKnowledgePoint('');
      const rest = suggestions.filter((s) => s !== questionNo);
      setQuestionNo(rest[0] ?? '');
      if (collapsed) setOpen(false);
    }
  };
  return (
    <form
      className="form correction-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h4>记录订正</h4>
      {note && <p className="muted small">{note}</p>}
      {suggestions.length > 0 && (
        <div className="chips">
          {suggestions.map((n) => (
            <button type="button" key={n} className={questionNo === n ? 'chip on' : 'chip'} onClick={() => setQuestionNo(n)}>
              第 {n} 题
            </button>
          ))}
        </div>
      )}
      <label>
        题号
        <input value={questionNo} onChange={(e) => setQuestionNo(e.target.value)} placeholder="例如：3" />
      </label>
      <label>
        错误原因
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：进位忘记加" />
      </label>
      <label>
        订正答案 / 正确思路
        <textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={addToReview} onChange={(e) => setAddToReview(e.target.checked)} />
        加入复习卡片（次日、3 天后、7 天后提醒）
      </label>
      {addToReview && (
        <label>
          知识点（可选）
          <input value={knowledgePoint} onChange={(e) => setKnowledgePoint(e.target.value)} placeholder="例如：两位数进位加法" />
        </label>
      )}
      <div className="actions">
        {collapsed && (
          <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
            取消
          </button>
        )}
        <button type="submit" className="btn secondary">
          保存订正
        </button>
      </div>
      {toast.node}
    </form>
  );
}

export function CorrectionList({ corrections }: { corrections: Correction[] }) {
  const { db } = useStore();
  if (corrections.length === 0) return null;
  return (
    <section className="card">
      <h3>订正记录</h3>
      <ul className="corrections">
        {corrections.map((c) => (
          <li key={c.id}>
            <div>
              <strong>第 {c.questionNo} 题</strong>
              <span className="muted small">
                {' '}
                · 第 {c.assignmentVersion} 版 · {formatTime(c.createdAt)} · {db.users.find((u) => u.id === c.createdBy)?.displayName}
              </span>
            </div>
            <div>原因：{c.reason}</div>
            <div className="pre">订正：{c.content}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const SCOPE_TEXT = {
  all_correct: '已核对，没有未订正的问题',
  viewed_with_open_issues: '家长已查看，仍有未订正或待人工检查的题目（不表示全部正确）',
  completion_only: '未上传照片，家长仅确认了完成情况',
} as const;

function ConfirmationSummary({ a }: { a: Assignment }) {
  const { db } = useStore();
  const c = [...db.confirmations].reverse().find((x) => x.assignmentId === a.id && x.conclusion === 'confirmed');
  if (!c) return <p className="muted">{STATUS_LABEL[a.status]}</p>;
  return (
    <div>
      <p>
        {db.users.find((u) => u.id === c.by)?.displayName} 于 {formatTime(c.at)} 确认了第 {c.assignmentVersion} 版。
      </p>
      <p className={c.scope === 'all_correct' ? 'ok-text' : 'warn'}>{c.scope ? SCOPE_TEXT[c.scope] : ''}</p>
      <p className="muted small">家长确认表示已查看完成情况与订正记录，不代表学校正式批改。</p>
    </div>
  );
}
