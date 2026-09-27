// 日记的检查结果与修改稿。
//
// 说明的写法（用户要求：用小学生能懂的语言与方式）：
//   指摘は日本語（日記が日本語なので、直す本人が読む言葉で書く）。
//   その下に中国語の一行（noteZh）をそえて、家族も何の話か分かるようにする。
//   分类は「なおそう / たしかめよう / くふうしよう / できているね」の4段階で、
//   まちがい探しだけにならないように「できているね」も必ず出す。

import { useMemo, useState } from 'react';
import { cleanupPhotos, useStore } from '../../data/store';
import {
  applyAllFixes,
  applyFix,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  checkDiary,
  SEVERITY_LABEL,
  type DiaryCategory,
  type DiaryFinding,
} from '../../domain/diary';
import { Header, PhotoView, useToast } from '../components';
import { navigate } from '../router';

function FindingCard({ f, onFix }: { f: DiaryFinding; onFix?: () => void }) {
  return (
    <div className={`finding sev-${f.severity}`}>
      <div className="finding-head">
        <span className={`badge sev-${f.severity}`}>{SEVERITY_LABEL[f.severity].ja}</span>
        <strong>{f.titleJa}</strong>
      </div>
      {f.quote && (
        <p className="finding-quote">
          <mark>{f.quote}</mark>
        </p>
      )}
      <p className="finding-detail">{f.detailJa}</p>
      <p className="finding-zh muted small">{f.noteZh}</p>
      {f.fix && onFix && (
        <button className="btn secondary small" onClick={onFix}>
          「{f.fix.from}」を「{f.fix.to}」になおす
        </button>
      )}
    </div>
  );
}

export function DiaryPage({ id }: { id: string }) {
  const { me, svc, run } = useStore();
  const toast = useToast();
  const entry = useMemo(() => {
    try {
      return me ? svc.diary(me, id) : undefined;
    } catch {
      return undefined;
    }
  }, [me, svc, id]);

  const [draft, setDraft] = useState(entry?.revised ?? '');
  const [editOriginal, setEditOriginal] = useState(false);
  const [originalDraft, setOriginalDraft] = useState(entry?.text ?? '');
  const [saved, setSaved] = useState(true);
  const grade = entry ? svc.gradeOf(entry.studentId) : 6;

  const result = useMemo(() => checkDiary(draft, { grade }), [draft, grade]);
  const before = useMemo(() => checkDiary(entry?.text ?? '', { grade }), [entry?.text, grade]);

  if (!me || !entry) {
    return (
      <div className="page">
        <Header title="日记检查" back="/diary" />
        <p className="warn">找不到这篇日记。</p>
      </div>
    );
  }

  const change = (next: string) => {
    setDraft(next);
    setSaved(false);
  };

  const fixOne = (f: DiaryFinding) => {
    const r = applyFix(draft, f);
    if (!r.applied) return toast.show('这里已经改好了', 'ok');
    change(r.text);
  };

  const fixAll = () => {
    const r = applyAllFixes(draft, result.findings);
    if (r.applied === 0) return toast.show('没有可以一键改的地方了', 'ok');
    change(r.text);
    toast.show(`直したところ ${r.applied} か所`);
  };

  const save = () => {
    const ok = toast.attempt(
      () =>
        run((s, actor) =>
          s.saveDiaryRevision(actor!, entry.id, draft, {
            at: new Date().toISOString(),
            counts: result.counts,
            grade,
          }),
        ),
      '保存好了',
    );
    if (ok) setSaved(true);
  };

  const saveOriginal = () => {
    const ok = toast.attempt(() => run((s, actor) => s.updateDiaryText(actor!, entry.id, originalDraft)), '原稿を直した');
    if (ok) {
      setEditOriginal(false);
      if (saved) setDraft(originalDraft);
    }
  };

  const remove = () => {
    if (!window.confirm('删除这篇日记和它的照片？删除后不能恢复。')) return;
    const photoIds = run((s, actor) => s.deleteDiary(actor!, entry.id));
    void cleanupPhotos(photoIds);
    navigate('/diary');
  };

  const [, m, day] = entry.date.split('-');
  const fixLeft = result.counts.fix;

  return (
    <div className="page">
      <Header title={entry.title || `${Number(m)}月${Number(day)}日の日記`} back="/diary" />
      {toast.node}

      {entry.photoIds.length > 0 && (
        <div className="diary-photos">
          {entry.photoIds.map((pid, i) => (
            <PhotoView key={pid} id={pid} alt={`日记照片 ${i + 1}`} />
          ))}
        </div>
      )}

      <div className="diary-score">
        <span className="badge sev-fix">なおそう {result.counts.fix}</span>
        <span className="badge sev-check">たしかめよう {result.counts.check}</span>
        <span className="badge sev-idea">くふう {result.counts.idea}</span>
        <span className="badge sev-good">できているね {result.counts.good}</span>
      </div>
      <p className="muted small">
        {entry.text === draft
          ? `${grade} 年级学过的汉字为准。改一处，下面的提示会立刻跟着变。`
          : `原稿のときは「なおそう」が ${before.counts.fix} こ → いまは ${fixLeft} こ。`}
        {' '}
        <a className="link" href="#/me">
          换年级
        </a>
      </p>

      <section className="section">
        <div className="section-head">
          <h2>修改稿</h2>
          <button className="btn secondary small" onClick={fixAll} disabled={result.counts.fix === 0}>
            まとめて直す
          </button>
        </div>
        <textarea
          className="diary-text"
          rows={6}
          value={draft}
          onChange={(e) => change(e.target.value)}
          maxLength={4000}
          aria-label="修改稿"
        />
        <div className="actions">
          <button className="btn ghost" onClick={() => change(entry.text)} disabled={draft === entry.text}>
            原稿にもどす
          </button>
          <button className="btn primary" onClick={save} disabled={saved || draft.trim().length === 0}>
            {saved ? '已保存' : '保存修改稿'}
          </button>
        </div>
      </section>

      {CATEGORY_ORDER.map((c: DiaryCategory) => {
        const list = result.byCategory[c];
        const label = CATEGORY_LABEL[c];
        return (
          <section className="section" key={c}>
            <div className="section-head">
              <h2>
                {label.icon} {label.zh}
                {list.length > 0 && <span className="count">{list.length}</span>}
              </h2>
            </div>
            <p className="muted small">{label.ja}</p>
            {c === 'kanji' && (
              <p className="hint">
                字の形（とめ・はね・画数）は写真を見ないと分からないので、ここでは「どの漢字を使ったか」「習った漢字で書けるか」を見ているよ。
                形は上の写真とくらべてたしかめてね。
              </p>
            )}
            {list.length === 0 ? (
              <p className="ok-text">ここはだいじょうぶ！</p>
            ) : (
              list.map((f) => <FindingCard key={f.id} f={f} onFix={f.fix ? () => fixOne(f) : undefined} />)
            )}
          </section>
        );
      })}

      <section className="section">
        <h2>原稿（写真の文字）</h2>
        {editOriginal ? (
          <>
            <textarea
              className="diary-text"
              rows={8}
              value={originalDraft}
              onChange={(e) => setOriginalDraft(e.target.value)}
              maxLength={4000}
              aria-label="原稿"
            />
            <div className="actions">
              <button className="btn ghost" onClick={() => setEditOriginal(false)}>
                取消
              </button>
              <button className="btn primary" onClick={saveOriginal}>
                保存原稿
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="pre">{entry.text}</p>
            <button
              className="btn ghost small"
              onClick={() => {
                setOriginalDraft(entry.text);
                setEditOriginal(true);
              }}
            >
              文字を直す（読みまちがえたとき）
            </button>
          </>
        )}
      </section>

      <section className="section">
        <p className="muted small">
          文字数 {result.stats.chars} · 文 {result.stats.sentences} · 漢字 {result.stats.kanjiChars} 字（
          {result.stats.kanjiKinds} 種類）
        </p>
        <button className="btn danger small" onClick={remove}>
          删除这篇日记
        </button>
      </section>
    </div>
  );
}
