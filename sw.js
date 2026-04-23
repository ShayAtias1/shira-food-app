const CACHE = 'shira-v2';
const ASSETS = [
  '/shira-food-app.html',
  '/manifest.json',
  'https://unpkg.com/react@18.3.1/umd/react.development.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js',
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js',
  'https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&display=swap',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => {
      // Cache one at a time so a single CDN failure doesn't break everything
      return Promise.allSettled(ASSETS.map((url) => c.add(url).catch(() => {})));
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── MEAL NOTIFICATION SCHEDULING ─────────────────────────────────────────
// The page posts { type: 'SCHEDULE_MEAL_NOTIFS', meals: [...], minutesBefore: 5 }
// We keep timers here so they survive brief backgrounding of the PWA.

let _swTimers = [];

self.addEventListener('message', (e) => {
  if (e.data?.type !== 'SCHEDULE_MEAL_NOTIFS') return;
  const { meals = [], minutesBefore = 5 } = e.data;

  // Clear old timers
  _swTimers.forEach(clearTimeout);
  _swTimers = [];

  const MEAL_TYPE_HE = {
    Breakfast: 'ארוחת בוקר',
    Snack:     'חטיף',
    Lunch:     'ארוחת צהריים',
    Dinner:    'ארוחת ערב',
  };

  const now = Date.now();

  meals.forEach((meal) => {
    const [h, m] = meal.time.split(':').map(Number);
    const mealMs = new Date();
    mealMs.setHours(h, m, 0, 0);
    const atMs     = mealMs.getTime();
    const beforeMs = atMs - minutesBefore * 60 * 1000;
    const typeName = MEAL_TYPE_HE[meal.type] || meal.type;

    const show = (title, body, tag) => {
      self.registration.showNotification(title, {
        body,
        tag,
        icon: './icon-192.png',
        badge: './icon-192.png',
        data: { mealId: meal.id },
        actions: [
          { action: 'eaten', title: '✓ אכלתי' },
          { action: 'skip',  title: 'דילגתי' },
        ],
      });
    };

    if (beforeMs > now) {
      _swTimers.push(setTimeout(
        () => show(`${typeName} בעוד ${minutesBefore} דקות 🍽️`, `${meal.name} · ${meal.kcal} קק״ל`, `${meal.id}_before`),
        beforeMs - now
      ));
    }

    if (atMs > now) {
      _swTimers.push(setTimeout(
        () => show(`הגיע הזמן ל${typeName} ✓`, `${meal.name} · ${meal.kcal} קק״ל`, `${meal.id}_at`),
        atMs - now
      ));
    }
  });
});

// Handle notification action buttons
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length) return clients[0].focus();
      return self.clients.openWindow('./shira-food-app.html');
    })
  );
});

self.addEventListener('fetch', (e) => {
  // Cache-first for everything we cached; network-first fallback otherwise
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        // Offline fallback: serve the app shell for navigation requests
        if (e.request.mode === 'navigate') {
          return caches.match('/shira-food-app.html');
        }
      });
    })
  );
});
