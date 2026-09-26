import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './data/store';
import { App } from './ui/App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);

// 离线可用：生产环境注册 Service Worker 缓存应用外壳
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
