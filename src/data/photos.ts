// 照片存储：照片保存在 IndexedDB，业务数据只保存引用 id（设计书第 6 节）。
// 上传前在本地压缩到最长边 1600px，并计算清晰度。

import { BLUR_THRESHOLD, laplacianVariance, rgbaToGray } from '../domain/clarity';
import type { PhotoClarity } from '../domain/types';

const DB_NAME = 'homework-photos';
const STORE = 'photos';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export async function savePhoto(id: string, blob: Blob): Promise<void> {
  await tx('readwrite', (s) => s.put(blob, id));
}

export async function getPhoto(id: string): Promise<Blob | undefined> {
  return (await tx<Blob>('readonly', (s) => s.get(id))) ?? undefined;
}

export async function deletePhotos(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx('readwrite', (s) => {
    for (const id of ids) s.delete(id);
  });
}

export interface ProcessedPhoto {
  blob: Blob;
  clarity: PhotoClarity;
  sharpness: number;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取这张图片'));
    };
    img.src = url;
  });
}

/** 压缩图片并检测清晰度 */
export async function processPhoto(file: Blob, maxSide = 1600): Promise<ProcessedPhoto> {
  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法处理图片');
  ctx.drawImage(img, 0, 0, w, h);

  // 在约 400px 宽的缩略图上检测清晰度，速度快且对手机照片足够
  const sw = Math.min(400, w);
  const sh = Math.max(3, Math.round((h * sw) / w));
  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext('2d')!;
  sctx.drawImage(canvas, 0, 0, sw, sh);
  const gray = rgbaToGray(sctx.getImageData(0, 0, sw, sh).data);
  const sharpness = laplacianVariance(gray, sw, sh);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('无法压缩图片'))), 'image/jpeg', 0.85),
  );
  return { blob, sharpness, clarity: sharpness < BLUR_THRESHOLD ? 'blurry' : 'clear' };
}
