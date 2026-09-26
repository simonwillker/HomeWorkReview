import { useState } from 'react';
import { cleanupPhotos, useStore } from '../../data/store';
import { openIssueNumbers } from '../../domain/status';
import type { ReviewItem, ReviewResult } from '../../domain/types';
import { Empty, Header, Modal, PhotoPicker, PhotoView, ResultBadge, useToast, type PickedPhoto } from '../components';
import { navigate } from '../router';

const GROUPS: { title: string; results: ReviewResult[]; desc: string }[] = [
  { title: '已核对', results: ['match', 'mismatch'], desc: '依据录入的参考答案或人工检查得出' },
  { title: '存疑 / 待人工检查', results: ['doubt', 'pending_manual'], desc: '无法自动确定，请家长或老师检查' },
  { title: '识别不清', results: ['unclear'], desc: '照片看不清，请补拍' },
];

export function CheckPage({ id }: { id: string }) {
  const { db, svc, me, run } = useStore();
  const toast = useToast();
  const [newNo, setNewNo] = useState('');
  const [retake, setRetake] = useState<PickedPhoto[] | null>(null);
  const [basisFor, setBasisFor] = useState<ReviewItem>();
  const a = db.assignments.find((x) => x.id === id);
  const review = a && svc.latestReview(a.id);
  const sub = review && db.submissions.find((s) => s.id === review.submissionId);
  if (!me || !a || !review || !sub || (me.role === 'student' && a.studentId !== me.id)) {
    return (
      <div className="page">
        <Header title="检查结果" back="/today" />
        <Empty>找不到检查记录。</Empty>
      </div>
    );
  }
  const editable = a.status === 'pending_check';
  const corrected = db.corrections.filter((c) => c.assignmentId === a.id).map((c) => c.questionNo);
  const issues = openIssueNumbers(review.items, corrected);
  const set = (no: string, r: ReviewResult) => toast.attempt(() => run((s, u) => s.setReviewItem(u!, a.id, no, r)));

  return (
    <div className="page">
      <Header title="检查结果" back={`/a/${a.id}`} />
      <section className="card">
        <h2 className="detail-title">{a.title}</h2>
        {sub.clarity === 'blurry' && (
          <p className="warn" role="alert">
            ⚠ 这张照片看不清，请重新拍摄。
          </p>
        )}
        {sub.clarity === 'none' && <p className="muted">未上传照片：只能检查完成情况，无法核对书写内容。</p>}
        {sub.photoIds.length > 0 && (
          <div className="thumbs">
            {sub.photoIds.map((p, i) => (
              <PhotoView key={p} id={p} alt={`提交照片 ${i + 1}`} />
            ))}
          </div>
        )}
        {editable && (
          <button className="btn secondary" onClick={() => setRetake([])}>
            📷 补拍
          </button>
        )}
      </section>

      {a.answerKey.length === 0 && (
        <section className="card notice">
          <p>
            这项作业没有录入参考答案，所以<strong>不进行答案比对</strong>，App 不会猜测正确答案。请家长或学生对照原图人工检查，把做错或存疑的题加入下面的列表。
          </p>
        </section>
      )}

      {GROUPS.map((g) => {
        const items = review.items.filter((i) => g.results.includes(i.result));
        if (items.length === 0) return null;
        return (
          <section key={g.title} className="card">
            <h3>
              {g.title} <span className="count">{items.length}</span>
            </h3>
            <p className="muted small">{g.desc}</p>
            <ul className="review-items">
              {items.map((i) => (
                <li key={i.questionNo} className={`review-item rs-${i.result}`}>
                  <div className="ri-head">
                    <strong>第 {i.questionNo} 题</strong>
                    <ResultBadge result={i.result} />
                  </div>
                  {i.method === 'answer_key' && (
                    <div className="ri-body">
                      <div>你的答案：{i.studentAnswer ?? '—'}</div>
                      <div>参考答案：{i.referenceAnswer}</div>
                    </div>
                  )}
                  {i.method === 'manual' && i.referenceAnswer && <div className="ri-body">参考答案：{i.referenceAnswer}</div>}
                  {i.note && <div className="muted small">备注：{i.note}</div>}
                  {i.flaggedWrong && <div className="muted small">已标记“建议有误”，请人工检查</div>}
                  <div className="ri-actions">
                    {i.basis && (
                      <button className="btn ghost small" onClick={() => setBasisFor(i)}>
                        查看依据
                      </button>
                    )}
                    {editable && i.method === 'answer_key' && !i.flaggedWrong && (
                      <button
                        className="btn ghost small"
                        onClick={() => toast.attempt(() => run((s, u) => s.flagSuggestion(u!, a.id, i.questionNo)))}
                      >
                        标记建议有误
                      </button>
                    )}
                    {editable && (i.method === 'manual' || i.result !== 'mismatch') && (
                      <>
                        {i.result !== 'match' && (i.method === 'manual' || i.flaggedWrong) && (
                          <button className="btn ghost small" onClick={() => set(i.questionNo, 'match')}>
                            ✓ 正确
                          </button>
                        )}
                        {i.result !== 'mismatch' && (
                          <button className="btn ghost small" onClick={() => set(i.questionNo, 'mismatch')}>
                            ✗ 错误
                          </button>
                        )}
                        {i.result !== 'doubt' && (
                          <button className="btn ghost small" onClick={() => set(i.questionNo, 'doubt')}>
                            ? 存疑
                          </button>
                        )}
                      </>
                    )}
                    {editable && i.method === 'manual' && !i.referenceAnswer && (
                      <button
                        className="btn ghost small"
                        onClick={() => toast.attempt(() => run((s, u) => s.removeReviewItem(u!, a.id, i.questionNo)))}
                      >
                        移除
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {editable && (
        <section className="card">
          <h3>人工检查：添加做错或存疑的题</h3>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (toast.attempt(() => run((s, u) => s.setReviewItem(u!, a.id, newNo, 'mismatch')))) setNewNo('');
            }}
          >
            <input aria-label="题号" placeholder="题号，例如 5" value={newNo} onChange={(e) => setNewNo(e.target.value)} />
            <button className="btn secondary" type="submit">
              标为错误
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                if (toast.attempt(() => run((s, u) => s.setReviewItem(u!, a.id, newNo, 'doubt')))) setNewNo('');
              }}
            >
              标为存疑
            </button>
          </form>
        </section>
      )}

      {editable ? (
        <div className="actions sticky">
          <button
            className="btn primary block-btn"
            onClick={() => {
              if (toast.attempt(() => run((s, u) => s.finishCheck(u!, a.id)))) navigate(`/a/${a.id}`);
            }}
          >
            {issues.length > 0 ? `完成检查（${issues.length} 题待订正）` : '完成检查，没有发现错误'}
          </button>
        </div>
      ) : (
        <p className="muted center">检查已完成。</p>
      )}

      {basisFor && (
        <Modal title={`第 ${basisFor.questionNo} 题的依据`} onClose={() => setBasisFor(undefined)}>
          <p>{basisFor.basis}</p>
          {basisFor.referenceAnswer && <p>参考答案：{basisFor.referenceAnswer}</p>}
          {basisFor.studentAnswer && <p>学生填写：{basisFor.studentAnswer}</p>}
          <p className="muted small">比对结果是辅助建议，不是教师评语。如有疑问请标记“建议有误”。</p>
          <button className="btn primary" onClick={() => setBasisFor(undefined)}>
            知道了
          </button>
        </Modal>
      )}

      {retake && (
        <Modal
          title="补拍照片"
          onClose={() => {
            void cleanupPhotos(retake.map((p) => p.id));
            setRetake(null);
          }}
        >
          <PhotoPicker photos={retake} onChange={setRetake} label="重新拍摄" />
          <div className="actions">
            <button
              className="btn primary"
              disabled={retake.length === 0}
              onClick={() => {
                let removed: string[] = [];
                const ok = toast.attempt(
                  () =>
                    (removed = run((s, u) =>
                      s.retakePhotos(
                        u!,
                        a.id,
                        retake.map((p) => p.id),
                        retake.some((p) => p.clarity === 'blurry') ? 'blurry' : 'clear',
                      ),
                    )),
                  '照片已更新',
                );
                if (ok) {
                  void cleanupPhotos(removed);
                  setRetake(null);
                }
              }}
            >
              使用这些照片
            </button>
          </div>
        </Modal>
      )}
      {toast.node}
    </div>
  );
}
