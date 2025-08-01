self.addEventListener('install', event => {
    event.waitUntil(
        caches.open('getitdone-v1').then(cache => {
            return cache.addAll([
                '/',
                '/index.html',
                '/manifest.json',
                '/favicon-32x32.png',
                '/icon-192x192.png',
                '/icon-512x512.png',
                'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
                'https://assets.mixkit.co/active_storage/sfx/2297/2297-preview.mp3'
            ]);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});

let tasks = [];
let userName = 'you';
let enableReminders = false;
let lastNotificationTimes = new Map();

self.addEventListener('message', event => {
    if (event.data.type === 'SYNC_TASKS') {
        tasks = event.data.tasks;
        userName = event.data.userName;
        enableReminders = event.data.enableReminders;
    } else if (event.data.type === 'TRIGGER_NOTIFICATION') {
        const task = event.data.task;
        const now = new Date();
        const notificationId = `task-${task.id}-${task.startTime}`;
        if (!lastNotificationTimes.has(notificationId) || (now - lastNotificationTimes.get(notificationId)) > 15 * 60 * 1000) {
            self.registration.showNotification('Task Reminder', {
                body: `Hey, ${event.data.userName}! ${task.name} is starting in 10 minutes—let’s do this! Priority: ${task.priority}`,
                icon: '/icon-192x192.png',
                vibrate: [200, 100, 200],
                actions: [{ action: 'open', title: 'Open App' }],
                tag: notificationId
            });
            lastNotificationTimes.set(notificationId, now);
        }
    }
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    if (event.action === 'open') {
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
                for (const client of clientList) {
                    if (client.url.includes('/index.html') && 'focus' in client) {
                        return client.focus();
                    }
                }
                return clients.openWindow('/index.html');
            })
        );
    }
});

function checkTaskReminders() {
    if (!enableReminders || !('Notification' in self) || Notification.permission !== 'granted') return;
    
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    tasks.forEach(task => {
        const [hours, minutes] = task.startTime.split(':').map(Number);
        const taskMinutes = hours * 60 + minutes;
        const reminderMinutes = taskMinutes - 10;
        const timeDiff = Math.abs(currentMinutes - reminderMinutes);
        
        if (timeDiff <= 1) {
            const notificationId = `task-${task.id}-${task.startTime}`;
            if (!lastNotificationTimes.has(notificationId) || (now - lastNotificationTimes.get(notificationId)) > 15 * 60 * 1000) {
                self.registration.showNotification('Task Reminder', {
                    body: `Hey, ${userName}! ${task.name} is starting in 10 minutes—let’s do this! Priority: ${task.priority}`,
                    icon: '/icon-192x192.png',
                    vibrate: [200, 100, 200],
                    actions: [{ action: 'open', title: 'Open App' }],
                    tag: notificationId
                });
                lastNotificationTimes.set(notificationId, now);
            }
        }
    });
}

setInterval(checkTaskReminders, 60 * 1000);

self.addEventListener('periodicsync', event => {
    if (event.tag === 'check-notifications') {
        event.waitUntil(checkTaskReminders());
    }
});

checkTaskReminders();