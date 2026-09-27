import { useStore } from '../data/store';
import { AssignmentPage } from './pages/Assignment';
import { NewAssignmentPage } from './pages/NewAssignment';
import { ConfirmPage } from './pages/Confirm';
import { CheckPage } from './pages/Check';
import { DiaryListPage, NewDiaryPage } from './pages/Diary';
import { DiaryPage } from './pages/DiaryCheck';
import { MePage } from './pages/Me';
import { NewCardPage, ReviewPage } from './pages/Review';
import { RecordsPage } from './pages/Records';
import { TodayPage } from './pages/Today';
import { ProfilePicker, Welcome } from './pages/Onboarding';
import { useRoute } from './router';

const TABS = [
  { key: 'today', label: '今日', icon: '📋' },
  { key: 'review', label: '复习', icon: '🔁' },
  { key: 'records', label: '记录', icon: '📊' },
  { key: 'me', label: '我的', icon: '👤' },
];

export function App() {
  const { db, me } = useStore();
  const route = useRoute();

  if (db.families.length === 0 || route[0] === 'join') return <Welcome />;
  if (!me) return <ProfilePicker />;

  const [page, id, sub] = route;
  let content;
  switch (page) {
    case 'new':
      content = <NewAssignmentPage />;
      break;
    case 'a':
      if (sub === 'check') content = <CheckPage id={id} />;
      else if (sub === 'confirm') content = <ConfirmPage id={id} />;
      else content = <AssignmentPage id={id} />;
      break;
    case 'diary':
      if (!id) content = <DiaryListPage />;
      else if (id === 'new') content = <NewDiaryPage />;
      else content = <DiaryPage id={id} />;
      break;
    case 'review':
      content = id === 'new' ? <NewCardPage /> : <ReviewPage />;
      break;
    case 'records':
      content = <RecordsPage />;
      break;
    case 'me':
      content = <MePage />;
      break;
    default:
      content = <TodayPage />;
  }
  const active = page === 'a' || page === 'new' || page === 'diary' ? 'today' : page;

  return (
    <div className="app">
      <main className="content">{content}</main>
      <nav className="tabbar" aria-label="主导航">
        {TABS.map((t) => (
          <a key={t.key} href={`#/${t.key}`} className={active === t.key ? 'active' : ''}>
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
