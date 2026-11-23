// 브라우저가 예전 파일을 붙잡고 있지 않도록, 같은 사이트의 요청은 매번 서버에 최신 여부를 확인한다.
// (바뀌지 않은 파일은 서버가 "그대로"라고만 답하므로 느려지지 않는다)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).catch(() => fetch(e.request)));
});
