import { HomeworkService } from '../src/domain/service';
import { emptyDb, type Db, type SelfCheck } from '../src/domain/types';

export const ALL_CHECKED: SelfCheck = { allDone: true, nameAndDate: true, photoClear: true, answersChecked: true };

export function setup(start = new Date(2026, 8, 28, 16, 0)) {
  const db: Db = emptyDb();
  let now = start;
  let seq = 0;
  let rnd = 0.123456;
  const svc = new HomeworkService(db, {
    now: () => now,
    newId: () => `id${++seq}`,
    random: () => {
      rnd = (rnd * 9301 + 0.49297) % 1;
      return rnd;
    },
  });
  const parent = svc.createFamily({ familyName: '小明家', parentName: '妈妈', pin: '1234' });
  const child = svc.addChild(parent, '小明');
  return {
    db,
    svc,
    parent,
    child,
    setNow: (d: Date) => {
      now = d;
    },
  };
}
