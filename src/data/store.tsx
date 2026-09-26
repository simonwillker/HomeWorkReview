// 本地数据存储（离线优先）。业务数据保存在 localStorage，照片保存在 IndexedDB。
// 每次写操作：复制数据 → 交给服务执行 → 成功后提交并持久化；失败则不改变任何数据。

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { HomeworkService } from '../domain/service';
import { emptyDb, type Db, type User } from '../domain/types';
import { deletePhotos } from './photos';

const KEY = 'homework-review:db';

function newId(): string {
  return crypto.randomUUID();
}

function secureRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

export function loadDb(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDb();
    const parsed = JSON.parse(raw) as Db;
    if (parsed.schema !== 1) return emptyDb();
    return { ...emptyDb(), ...parsed };
  } catch {
    return emptyDb();
  }
}

function saveDb(db: Db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function makeService(db: Db) {
  return new HomeworkService(db, { now: () => new Date(), newId, random: secureRandom });
}

interface StoreValue {
  db: Db;
  /** 只读查询用的服务实例 */
  svc: HomeworkService;
  me?: User;
  /** 执行写操作；返回操作结果。出错时抛出，由调用方显示提示。 */
  run: <T>(fn: (svc: HomeworkService, me: User | undefined) => T) => T;
  logout: () => void;
  newId: () => string;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db>(loadDb);
  // 始终基于最新提交的数据执行，避免同一轮渲染内连续操作互相覆盖
  const latest = useRef(db);

  const commit = useCallback((draft: Db) => {
    saveDb(draft);
    latest.current = draft;
    setDb(draft);
  }, []);

  const run = useCallback(
    <T,>(fn: (svc: HomeworkService, me: User | undefined) => T): T => {
      const draft = structuredClone(latest.current);
      const svc = makeService(draft);
      const me = draft.session.currentUserId ? draft.users.find((u) => u.id === draft.session.currentUserId) : undefined;
      const result = fn(svc, me);
      commit(draft);
      return result;
    },
    [commit],
  );

  const logout = useCallback(() => {
    const draft = structuredClone(latest.current);
    draft.session = {};
    commit(draft);
  }, [commit]);

  const value = useMemo<StoreValue>(() => {
    const svc = makeService(db);
    const me = db.session.currentUserId ? db.users.find((u) => u.id === db.session.currentUserId) : undefined;
    return { db, svc, me, run, logout, newId };
  }, [db, run, logout]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('StoreProvider missing');
  return v;
}

export async function cleanupPhotos(ids: string[] | void) {
  if (ids && ids.length) await deletePhotos(ids).catch(() => undefined);
}
