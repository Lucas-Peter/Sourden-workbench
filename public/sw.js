/* 最小 Service Worker：只为「安装为应用」服务，不缓存任何接口数据
   （工作台数据随时在变，缓存会导致看到旧数字） */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* 全部走网络，不拦截 */ });
