import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getPhoto, processPhoto, savePhoto } from '../data/photos';
import { useStore } from '../data/store';
import { STATUS_LABEL } from '../domain/status';
import type { AssignmentStatus, PhotoClarity, ReviewResult } from '../domain/types';

export function StatusBadge({ status }: { status: AssignmentStatus }) {
  return <span className={`badge st-${status}`}>{STATUS_LABEL[status]}</span>;
}

export const RESULT_LABEL: Record<ReviewResult, string> = {
  match: '✓ 已核对：一致',
  mismatch: '✗ 已核对：不一致',
  doubt: '? 存疑',
  pending_manual: '… 待人工检查',
  unclear: '⚠ 识别不清',
};

export function ResultBadge({ result }: { result: ReviewResult }) {
  return <span className={`badge rs-${result}`}>{RESULT_LABEL[result]}</span>;
}

export function OverdueTag() {
  return <span className="badge overdue">已逾期</span>;
}

export function Header({ title, back, right }: { title: string; back?: string; right?: ReactNode }) {
  return (
    <header className="topbar">
      {back !== undefined ? (
        <a className="back" href={`#${back}`} aria-label="返回">
          ‹ 返回
        </a>
      ) : (
        <span />
      )}
      <h1>{title}</h1>
      <div className="topbar-right">{right}</div>
    </header>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null);
  const timer = useRef<number>(undefined);
  const show = (text: string, kind: 'ok' | 'error' = 'ok') => {
    setMsg({ text, kind });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 3200);
  };
  const node = msg ? (
    <div className={`toast ${msg.kind}`} role={msg.kind === 'error' ? 'alert' : 'status'}>
      {msg.text}
    </div>
  ) : null;
  /** 执行操作，出错时显示错误提示；成功返回 true */
  const attempt = (fn: () => void, okText?: string): boolean => {
    try {
      fn();
      if (okText) show(okText);
      return true;
    } catch (e) {
      show(e instanceof Error ? e.message : String(e), 'error');
      return false;
    }
  };
  return { show, node, attempt };
}

export function PhotoView({ id, alt }: { id: string; alt: string }) {
  const [url, setUrl] = useState<string>();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let u: string | undefined;
    let alive = true;
    getPhoto(id)
      .then((b) => {
        if (!alive) return;
        if (!b) return setMissing(true);
        u = URL.createObjectURL(b);
        setUrl(u);
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  if (missing) return <div className="photo missing">照片不可用</div>;
  if (!url) return <div className="photo loading">加载中…</div>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="photo">
      <img src={url} alt={alt} />
    </a>
  );
}

export interface PickedPhoto {
  id: string;
  clarity: PhotoClarity;
}

/** 拍照 / 选图。自动压缩、保存并检测清晰度；看不清时提示重拍。 */
export function PhotoPicker({
  photos,
  onChange,
  label = '拍照或选择照片',
  max = 6,
}: {
  photos: PickedPhoto[];
  onChange: (p: PickedPhoto[]) => void;
  label?: string;
  max?: number;
}) {
  const { newId } = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setErr(undefined);
    const added: PickedPhoto[] = [];
    try {
      for (const f of Array.from(files).slice(0, max - photos.length)) {
        const p = await processPhoto(f);
        const id = newId();
        await savePhoto(id, p.blob);
        added.push({ id, clarity: p.clarity });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '无法处理图片');
    } finally {
      setBusy(false);
      onChange([...photos, ...added]);
    }
  };
  const blurry = photos.filter((p) => p.clarity === 'blurry');
  return (
    <div className="photo-picker">
      <div className="thumbs">
        {photos.map((p, i) => (
          <div key={p.id} className={`thumb ${p.clarity}`}>
            <PhotoView id={p.id} alt={`照片 ${i + 1}`} />
            <button
              type="button"
              className="thumb-del"
              aria-label={`删除照片 ${i + 1}`}
              onClick={() => onChange(photos.filter((x) => x.id !== p.id))}
            >
              ×
            </button>
            {p.clarity === 'blurry' && <span className="thumb-warn">看不清</span>}
          </div>
        ))}
      </div>
      {blurry.length > 0 && (
        <p className="warn" role="alert">
          ⚠ 有 {blurry.length} 张照片看不清，请重新拍摄。
        </p>
      )}
      {err && <p className="warn">{err}</p>}
      {photos.length < max && (
        <label className="btn secondary file-btn">
          {busy ? '处理中…' : `📷 ${label}`}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            disabled={busy}
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function formatDate(d?: string) {
  if (!d) return '无截止日期';
  const [, m, day] = d.split('-');
  return `${Number(m)}月${Number(day)}日`;
}

export function formatTime(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
