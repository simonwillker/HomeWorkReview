import { useState } from 'react';
import { cleanupPhotos, useStore } from '../../data/store';
import { parseAnswerLines } from '../../domain/answers';
import { addDays } from '../../domain/dates';
import { SUBJECTS } from '../../domain/types';
import { Header, PhotoPicker, useToast, type PickedPhoto } from '../components';
import { navigate } from '../router';
import { useChildren, useSelectedChild } from './Today';

export function NewAssignmentPage() {
  const { svc, me, run } = useStore();
  const kids = useChildren();
  const [selected] = useSelectedChild();
  const today = svc.today();
  const [studentId, setStudentId] = useState(
    selected !== 'all' && kids.some((k) => k.id === selected) ? selected : (kids[0]?.id ?? ''),
  );
  const [subject, setSubject] = useState<string>('');
  const [customSubject, setCustomSubject] = useState('');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(today);
  const [minutes, setMinutes] = useState('');
  const [requirements, setRequirements] = useState('');
  const [notice, setNotice] = useState<PickedPhoto[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [keyText, setKeyText] = useState('');
  const [keySource, setKeySource] = useState('');
  const toast = useToast();
  if (!me) return null;

  const parsedKey = parseAnswerLines(keyText);
  const finalSubject = subject === '其他' ? customSubject : subject;

  const save = (again: boolean) => {
    const ok = toast.attempt(() =>
      run((svc, actor) =>
        svc.createAssignment(actor!, {
          studentId,
          subject: finalSubject,
          title,
          requirements,
          dueDate: dueDate || undefined,
          estimatedMinutes: minutes ? Number(minutes) : undefined,
          noticePhotoId: notice[0]?.id,
          answerKey: showKey ? parsedKey : [],
          answerKeySource: showKey ? keySource : undefined,
        }),
      ),
    );
    if (!ok) return;
    if (again) {
      setTitle('');
      setRequirements('');
      setNotice([]);
      setKeyText('');
      toast.show('已保存，可继续添加');
    } else {
      navigate('/today');
    }
  };

  return (
    <div className="page">
      <Header title="新增作业" back="/today" />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
      >
        {me.role === 'parent' && kids.length > 1 && (
          <fieldset>
            <legend>给谁的作业</legend>
            <div className="chips">
              {kids.map((k) => (
                <button
                  type="button"
                  key={k.id}
                  className={studentId === k.id ? 'chip on' : 'chip'}
                  onClick={() => setStudentId(k.id)}
                >
                  {k.displayName}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset>
          <legend>
            科目 <span className="req">必填</span>
          </legend>
          <div className="chips">
            {SUBJECTS.map((s) => (
              <button
                type="button"
                key={s}
                className={subject === s ? 'chip on' : 'chip'}
                aria-pressed={subject === s}
                onClick={() => setSubject(s)}
              >
                {s}
              </button>
            ))}
          </div>
          {subject === '其他' && (
            <input
              aria-label="科目名称"
              placeholder="输入科目名称"
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
            />
          )}
        </fieldset>
        <label>
          <span>
            标题 <span className="req">必填</span>
          </span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：第三单元练习第 1–10 题" />
        </label>
        <div className="two-col">
          <label>
            截止日期（可选）
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label>
            预计用时（分钟）
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={600}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
        </div>
        <div className="quick-dates">
          <button type="button" className="chip" onClick={() => setDueDate(today)}>
            今天
          </button>
          <button type="button" className="chip" onClick={() => setDueDate(addDays(today, 1))}>
            明天
          </button>
          <button type="button" className="chip" onClick={() => setDueDate('')}>
            不设截止
          </button>
        </div>
        <label>
          要求
          <textarea
            rows={3}
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder="例如：写在练习本上，需要写出计算过程"
          />
        </label>
        <div className="field">
          <span className="field-label">作业通知照片（可选）</span>
          <PhotoPicker photos={notice} onChange={setNotice} max={1} label="拍摄作业通知" />
          <small className="muted">照片仅作附件保存。文字识别将在后续版本提供，识别结果须经确认后才会保存。</small>
        </div>

        <details open={showKey} onToggle={(e) => setShowKey((e.target as HTMLDetailsElement).open)}>
          <summary>录入参考答案（可选，用于客观题比对）</summary>
          <p className="muted small">只有录入了可靠答案，才会显示“答案比对”；否则由家长人工检查，App 不猜测答案。</p>
          <label>
            每行一题：题号 答案
            <textarea
              rows={4}
              value={keyText}
              onChange={(e) => setKeyText(e.target.value)}
              placeholder={'1 A\n2 3.5\n3 北京'}
            />
          </label>
          {parsedKey.length > 0 && <p className="muted small">已识别 {parsedKey.length} 题：{parsedKey.map((k) => `${k.questionNo}=${k.answer}`).join('，')}</p>}
          <label>
            答案来源
            <input value={keySource} onChange={(e) => setKeySource(e.target.value)} placeholder="例如：课本第 45 页答案" />
          </label>
        </details>

        <div className="actions sticky">
          <button type="button" className="btn secondary" onClick={() => save(true)}>
            保存并继续添加
          </button>
          <button type="submit" className="btn primary">
            保存
          </button>
        </div>
      </form>
      <button
        type="button"
        className="link muted"
        onClick={() => {
          void cleanupPhotos(notice.map((n) => n.id));
          navigate('/today');
        }}
      >
        取消
      </button>
      {toast.node}
    </div>
  );
}
