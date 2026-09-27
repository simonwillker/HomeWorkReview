// 日记检查：一览与新增。
//
// 照片是「凭据」，检查是对照片上的文字做的。浏览器里离线跑不了手写识别，
// 所以文字由使用者输入一次（iPhone / iPad 可以用「实况文本」从照片里拷出来，一步就够）。

import { useState } from 'react';
import { cleanupPhotos, useStore } from '../../data/store';
import { toDateStr } from '../../domain/dates';
import { summarize } from '../../domain/diary';
import type { DiaryEntry } from '../../domain/types';
import { Empty, Header, PhotoPicker, useToast, type PickedPhoto } from '../components';
import { navigate } from '../router';
import { ChildChips, useChildren, useSelectedChild } from './Today';

function DiaryRow({ d }: { d: DiaryEntry }) {
  const { db, me } = useStore();
  const student = db.users.find((u) => u.id === d.studentId);
  const [, m, day] = d.date.split('-');
  return (
    <a className="row" href={`#/diary/${d.id}`}>
      <div className="row-main">
        <div className="row-title">
          {d.title || `${Number(m)}月${Number(day)}日の日記`}
          {me?.role === 'parent' && student && <span className="who"> · {student.displayName}</span>}
        </div>
        <div className="row-meta">
          {d.text.replace(/\s/g, '').length} 字
          {d.photoIds.length > 0 && ` · ${d.photoIds.length} 张照片`}
          {d.lastCheck ? ` · ${summarize(d.lastCheck.counts)}` : ' · 还没检查'}
        </div>
      </div>
      <span className="btn ghost small">打开</span>
    </a>
  );
}

export function DiaryListPage() {
  const { svc, me } = useStore();
  const kids = useChildren();
  const [child, setChild] = useSelectedChild();
  if (!me) return null;
  const list = svc.diariesFor(me, child === 'all' ? undefined : child);
  return (
    <div className="page">
      <Header
        title="日记检查"
        back="/today"
        right={
          <button className="btn primary small" onClick={() => navigate('/diary/new')} disabled={kids.length === 0}>
            ＋ 新日记
          </button>
        }
      />
      <ChildChips value={child} onChange={setChild} />
      <p className="muted small">
        把写好的日记拍照放进来，再把上面的文字输入一次，就会分成「错别字 / 汉字写法 / 文法与标点 / 内容表达」四类来提示。
      </p>
      {list.length === 0 ? (
        <Empty>还没有日记。拍一张试试看。</Empty>
      ) : (
        list.map((d) => <DiaryRow key={d.id} d={d} />)
      )}
    </div>
  );
}

/** 从照片取文字的说明（离线的浏览器里做不了手写识别，所以这一步由人来做） */
export function TextFromPhotoTip() {
  return (
    <details className="notice">
      <summary>怎么把照片上的字变成文字？</summary>
      <ol className="tip-list">
        <li>
          <b>iPhone / iPad</b>：在「照片」里打开这张照片，长按文字 →「全选」→「拷贝」，回到这里粘贴。
          （相机取景时也可以直接点右下角的「实况文本」按钮。）
        </li>
        <li>
          <b>安卓</b>：用 Google 相册或「镜头」打开照片，选「文字」→ 全选 → 拷贝。
        </li>
        <li>照片上的字歪一点也没关系，粘贴进来以后可以直接改。</li>
      </ol>
      <p className="muted small">
        为什么不自动识别？这个 App 不联网、数据只留在手机里，手写字的识别在离线的浏览器里做不准，
        宁可让人抄一次，也不要把「认错的字」当成错别字来教孩子。
      </p>
    </details>
  );
}

export function NewDiaryPage() {
  const { me, run } = useStore();
  const kids = useChildren();
  const [selected] = useSelectedChild();
  const toast = useToast();
  const [studentId, setStudentId] = useState(selected !== 'all' ? selected : (kids[0]?.id ?? ''));
  const [date, setDate] = useState(toDateStr(new Date()));
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  if (!me) return null;

  const save = () => {
    try {
      const entry = run((svc, actor) =>
        svc.createDiary(actor!, { studentId, date, title, photoIds: photos.map((p) => p.id), text }),
      );
      navigate(`/diary/${entry.id}`);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '保存失败', 'error');
    }
  };

  const cancel = () => {
    void cleanupPhotos(photos.map((p) => p.id));
    navigate('/diary');
  };

  return (
    <div className="page">
      <Header title="新的日记" back="/diary" />
      {toast.node}
      <div className="form">
        {kids.length > 1 && (
          <label>
            谁的日记
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              {kids.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.displayName}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          日记的日期
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          题目 <small>可不填</small>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：运动会のこと" maxLength={40} />
        </label>
        <div className="field">
          <span className="field-label">日记的照片</span>
          <PhotoPicker photos={photos} onChange={setPhotos} label="拍日记本" max={4} />
        </div>
        <TextFromPhotoTip />
        <label>
          照片上的文字 <span className="req">必填</span>
          <textarea
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'ここに日記の文を入れてね。\nれい：今日は校庭で友だちとサッカーをしました。'}
            maxLength={4000}
          />
          <small>{text.replace(/\s/g, '').length} 字</small>
        </label>
      </div>
      <div className="actions sticky">
        <button className="btn ghost" onClick={cancel}>
          取消
        </button>
        <button className="btn primary" onClick={save} disabled={!studentId || text.trim().length === 0}>
          保存并检查
        </button>
      </div>
    </div>
  );
}
