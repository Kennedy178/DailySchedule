self.addEventListener('install', event => {
    event.waitUntil(
        caches.open('getitdone-v1').then(cache => {
            return cache.addAll([
                './',                             // Root loads index.html
                './index.html',
                './manifest.json',
                './styles/main.css',
                './scripts/app.js',
                './icons/favicon-32x32.png',
                './icons/icon-192x192.png',
                './icons/icon-512x512.png',
                'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
                'https://assets.mixkit.co/active_storage/sfx/2297/2297-preview.mp3'
            ]);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            checkTaskReminders() // Run initial check on activation
        ])
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});

// -------------------------
// Task Reminder Variables
// -------------------------
let tasks = [];
let userName = 'you';
let enableReminders = false;
let lastNotificationTimes = new Map();

self.addEventListener('message', event => {
    if (event.data.type === 'SYNC_TASKS') {
        tasks = event.data.tasks;
        userName = event.data.userName;
        enableReminders = event.data.enableReminders;
        console.log('Service Worker: Synced tasks:', tasks.map(t => t.name), 'userName:', userName, 'enableReminders:', enableReminders);
    } else if (event.data.type === 'TRIGGER_NOTIFICATION') {
        const task = event.data.task;
        const notificationId = `task-${task.id}-${task.startTime}`;
        const now = new Date();

        if (
            enableReminders &&
            Notification.permission === 'granted' &&
            (!lastNotificationTimes.has(notificationId) ||
             (now - lastNotificationTimes.get(notificationId)) > 10 * 60 * 1000) // 10-minute window
        ) {
            console.log(`Service Worker: Showing notification for task "${task.name}" at ${task.startTime} via TRIGGER_NOTIFICATION`);
            self.registration.showNotification('Task Reminder', {
                body: `Hey, ${event.data.userName}! ${task.name} is starting in 10 minutes—let’s do this!😊💪 Priority: ${task.priority}`,
                icon: './icons/icon-192x192.png',
                vibrate: [200, 100, 200],
                actions: [{ action: 'open', title: 'Open App' }],
                tag: notificationId
            });
            lastNotificationTimes.set(notificationId, now);
            // Clear after 10 minutes to allow future notifications
            setTimeout(() => lastNotificationTimes.delete(notificationId), 10 * 60 * 1000);
        } else {
            console.log(`Service Worker: Skipped notification for task "${task.name}" via TRIGGER_NOTIFICATION: enableReminders=${enableReminders}, permission=${Notification.permission}, alreadyNotified=${lastNotificationTimes.has(notificationId)}`);
        }
    }
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    if (event.action === 'open') {
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
                for (const client of clientList) {
                    if (client.url.includes('index.html') && 'focus' in client) {
                        return client.focus();
                    }
                }
                return clients.openWindow('./index.html');
            })
        );
    }
});

// -------------------------
// Reminder Checking Function
// -------------------------
function checkTaskReminders() {
    if (!enableReminders || !('Notification' in self) || Notification.permission !== 'granted') {
        console.log('Service Worker: Skipped checkTaskReminders: enableReminders=', enableReminders, 'Notification supported=', 'Notification' in self, 'permission=', Notification.permission);
        return Promise.resolve();
    }

    const now = new Date();
    const promises = tasks.map(task => {
        const [hours, minutes] = task.startTime.split(':').map(Number);
        const startDate = new Date(now);
        startDate.setHours(hours, minutes, 0, 0);
        const timeDiff = startDate.getTime() - now.getTime();
        const notificationId = `task-${task.id}-${task.startTime}`;

        if (
            timeDiff >= 0 &&
            timeDiff <= 10 * 60 * 1000 &&
            timeDiff >= 9.5 * 60 * 1000 && // 9.5–10 minute window
            !lastNotificationTimes.has(notificationId)
        ) {
            console.log(`Service Worker: Showing notification for task "${task.name}" at ${task.startTime} via checkTaskReminders: timeDiff=${timeDiff}ms`);
            return self.registration.showNotification('Task Reminder', {
                body: `Hey, ${userName}! ${task.name} is starting in 10 minutes—let’s do this!😊💪 Priority: ${task.priority}`,
                icon: './icons/icon-192x192.png',
                vibrate: [200, 100, 200],
                actions: [{ action: 'open', title: 'Open App' }],
                tag: notificationId
            }).then(() => {
                lastNotificationTimes.set(notificationId, now);
                setTimeout(() => lastNotificationTimes.delete(notificationId), 10 * 60 * 1000);
            });
        } else {
            console.log(`Service Worker: Skipped notification for task "${task.name}" via checkTaskReminders: timeDiff=${timeDiff}ms, alreadyNotified=${lastNotificationTimes.has(notificationId)}`);
            return Promise.resolve();
        }
    });

    return Promise.all(promises);
}

setInterval(() => checkTaskReminders(), 30 * 1000); // Run every 30 seconds to match app.js

self.addEventListener('periodicsync', event => {
    if (event.tag === 'check-notifications') {
        event.waitUntil(checkTaskReminders());
    }
});

// Run an initial check on SW load
checkTaskReminders();