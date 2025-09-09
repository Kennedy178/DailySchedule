// Import Firebase messaging for FCM support
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');


//if (self.location.hostname !== "localhost") {
    //console.log = function () {};
    //console.debug = function () {};
    //console.info = function () {};
    //console.warn = function () {};
    // Keep console.error for actual error reporting
//}

//--To be changed as per indexedDB versioning--
const DB_NAME = 'getitdone';
const DB_VERSION = 3;

// Initialize Firebase in service worker
const firebaseConfig = {
    apiKey: "AIzaSyBL7ZdipX5Z5z-UPmUoAwbqpjRGrauR_9Q",
    authDomain: "getitdone-app1.firebaseapp.com",
    projectId: "getitdone-app1",
    storageBucket: "getitdone-app1.firebasestorage.app",
    messagingSenderId: "1032846385304",
    appId: "1:1032846385304:web:453509185bcae58974f0ed"
};

// Initialize Firebase only if available
let messaging = null;
try {
    firebase.initializeApp(firebaseConfig);
    messaging = firebase.messaging();
    console.log('SW: Firebase messaging initialized');
} catch (error) {
    console.log('SW: Firebase not available, using local notifications only');
}


// -------------------------
// Installation & Activation
// -------------------------
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open('getitdone-v1').then(cache => {
            return cache.addAll([

                './',
                './index.html',
                './manifest.json',
                './styles/main.css',
                './scripts/app.js',
                './scripts/db.js',
                './scripts/auth.js',
                './scripts/authHandler.js',
                './scripts/sync.js',
                './scripts/fcm-config.js',
                './scripts/fcm-manager.js',
                './scripts/offline-queue.js', 
                './icons/favicon-32x32.png',
                './icons/icon-192x192.png',
                './icons/icon-512x512.png',
                'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
                './story-content.html',
                './help.html',
                './tos.html',
                './privacy.html',
                './reset-password.html',
                './styles/help.css',
                './scripts/help.js',
                './assets/screenshots/late.png',
                './assets/screenshots/settings.png',
                './assets/screenshots/notif.png'
            ]);
        }).then(() => self.skipWaiting())
    );
});


self.addEventListener('activate', event => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            checkTaskReminders(), // Run initial check on activation
            processOfflineQueue() // Process any queued notifications
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
// State Variables
// -------------------------
let tasks = [];
let userName = 'you';
let enableReminders = false;
let isAuthenticated = false;
let fcmToken = null;
let lastNotificationTimes = new Map();

// -------------------------
// Message Handling from Main Thread
// -------------------------
self.addEventListener('message', event => {
    if (event.data.type === 'SYNC_TASKS') {
        tasks = event.data.tasks;
        userName = event.data.userName;
        enableReminders = event.data.enableReminders;
        isAuthenticated = event.data.isAuthenticated || false;
        fcmToken = event.data.fcmToken || null;
        
        console.log('SW: Synced tasks:', tasks.map(t => t.name), 
                   'userName:', userName, 
                   'enableReminders:', enableReminders,
                   'isAuthenticated:', isAuthenticated,
                   'hasFCMToken:', !!fcmToken);
    } 
    else if (event.data.type === 'TRIGGER_NOTIFICATION') {
        const task = event.data.task;
        const notificationId = `task-${task.id}-${task.startTime}`;
        
        // ONLY for guest users - authenticated users use FCM backend exclusively
        if (!isAuthenticated) {
            console.log('SW: Showing notification for GUEST USER:', task.name);
            showLocalNotification(task, notificationId, event.data.userName);
        } else {
            console.log('SW: Skipped local notification - authenticated user uses FCM backend only');
        }
    }
    else if (event.data.type === 'CACHE_FCM_TOKEN') {
        fcmToken = event.data.token;
        console.log('SW: FCM token cached for offline use:', !!fcmToken);
    }
    else if (event.data.type === 'PROCESS_OFFLINE_QUEUE') {
        // Manual trigger to process offline queue
        console.log('SW: Manual offline queue processing triggered');
        event.waitUntil(processOfflineQueue());
    }
});

// Alternative aggressive approach - assume closed unless proven otherwise
self.addEventListener('push', event => {
    console.log('SW: FCM push event received');
    
    if (!event.data) {
        console.log('SW: Push event has no data');
        return;
    }
    
    try {
        const payload = event.data.json();
        console.log('SW: FCM payload received:', payload);
        
        // AGGRESSIVE APPROACH: Default to showing notification
        // Only skip if we can definitively prove the app is open and responsive
        event.waitUntil(
            new Promise(async (resolve) => {
                let shouldShowNotification = true; // Default to showing notification
                
                try {
                    const clients = await self.clients.matchAll({ 
                        type: 'window', 
                        includeUncontrolled: true 
                    });
                    
                    console.log('SW: Found clients:', clients.length);
                    
                    if (clients.length === 0) {
                        console.log('SW: No clients - definitely showing notification');
                        shouldShowNotification = true;
                    } else {
                        // Quick check with very short timeout
                        const focusedAndVisible = clients.filter(client => 
                            client.focused && client.visibilityState === 'visible'
                        );
                        
                        if (focusedAndVisible.length === 0) {
                            console.log('SW: No focused/visible clients - showing notification');
                            shouldShowNotification = true;
                        } else {
                            console.log('SW: Found focused clients, testing responsiveness...');
                            
                            // Very short ping test (200ms timeout)
                            const pingResults = await Promise.allSettled(
                                focusedAndVisible.map(client => 
                                    new Promise((pingResolve) => {
                                        const messageChannel = new MessageChannel();
                                        let responded = false;
                                        
                                        messageChannel.port1.onmessage = (event) => {
                                            if (event.data === 'pong' && !responded) {
                                                responded = true;
                                                pingResolve(true);
                                            }
                                        };
                                        
                                        // Very short timeout - if app doesn't respond quickly, assume it's not responsive
                                        setTimeout(() => {
                                            if (!responded) {
                                                console.log('SW: Client ping timeout - assuming closed');
                                                pingResolve(false);
                                            }
                                        }, 200);
                                        
                                        try {
                                            client.postMessage('ping', [messageChannel.port2]);
                                        } catch (e) {
                                            console.log('SW: Error pinging client:', e);
                                            pingResolve(false);
                                        }
                                    })
                                )
                            );
                            
                            const anyResponsive = pingResults.some(result => 
                                result.status === 'fulfilled' && result.value === true
                            );
                            
                            if (anyResponsive) {
                                console.log('SW: App is responsive - sending to foreground');
                                shouldShowNotification = false;
                                
                                // Send to responsive clients
                                focusedAndVisible.forEach(client => {
                                    try {
                                        client.postMessage({
                                            type: 'FCM_FOREGROUND_MESSAGE',
                                            payload: payload
                                        });
                                    } catch (e) {
                                        console.log('SW: Error sending to client:', e);
                                    }
                                });
                            } else {
                                console.log('SW: No responsive clients - showing notification');
                                shouldShowNotification = true;
                            }
                        }
                    }
                } catch (error) {
                    console.error('SW: Error checking clients:', error);
                    // On any error, default to showing notification
                    shouldShowNotification = true;
                }
                
                if (shouldShowNotification) {
                    console.log('SW: Showing background notification');
                    
                    // Extract data
                    const title = payload.data?.title || payload.title || 'Task Reminder';
                    const body = payload.data?.body || payload.body || 'You have a task reminder';
                    const tag = payload.data?.tag || payload.tag || `fcm-bg-${Date.now()}`;
                    const priority = payload.data?.priority || '';
                    
                    // Priority-based notification options
                    const priorityConfig = {
                        high: { requireInteraction: true, vibrate: [300, 100, 300, 100, 300] },
                        medium: { requireInteraction: false, vibrate: [200, 100, 200] },
                        low: { requireInteraction: false, vibrate: [100, 50, 100] }
                    };
                    
                    const config = priorityConfig[priority?.toLowerCase()] || priorityConfig.medium;
                    
                    const notificationOptions = {
                        body: body,
                        icon: './icons/icon-192x192.png',
                        badge: './icons/favicon-32x32.png',
                        vibrate: config.vibrate,
                        actions: [
                            { action: 'open', title: 'Open App', icon: './icons/favicon-32x32.png' },
                            { action: 'dismiss', title: 'Dismiss' }
                        ],
                        tag: tag,
                        data: {
                            ...payload.data,
                            timestamp: Date.now()
                        },
                        requireInteraction: config.requireInteraction,
                        timestamp: Date.now(),
                        silent: false
                    };
                    
                    try {
                        await self.registration.showNotification(title, notificationOptions);
                        console.log('SW: Background notification shown successfully');
                    } catch (error) {
                        console.error('SW: Failed to show notification:', error);
                    }
                }
                
                resolve();
            })
        );
        
    } catch (error) {
        console.error('SW: Error handling FCM push:', error);
        
        // Fallback notification
        event.waitUntil(
            self.registration.showNotification('Task Reminder', {
                body: 'You have a task reminder',
                icon: './icons/icon-192x192.png',
                badge: './icons/favicon-32x32.png',
                actions: [{ action: 'open', title: 'Open App' }],
                tag: `fcm-error-${Date.now()}`,
                timestamp: Date.now()
            })
        );
    }
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
    console.log('SW: Notification clicked:', event.notification.tag);
    event.notification.close();
    
    if (event.action === 'dismiss') {
        console.log('SW: Notification dismissed');
        return;
    }
    
    // Open or focus the app
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            const existingClient = clients.find(client => 
                client.url.includes(self.location.origin)
            );
            
            if (existingClient) {
                console.log('SW: Focusing existing window');
                return existingClient.focus();
            } else {
                console.log('SW: Opening new window');
                return self.clients.openWindow('/');
            }
        })
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
    console.log('SW: Notification clicked:', event.notification.tag);
    event.notification.close();
    
    if (event.action === 'dismiss') {
        console.log('SW: Notification dismissed');
        return;
    }
    
    // Open or focus the app
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            // Try to focus existing window
            const existingClient = clients.find(client => 
                client.url.includes(self.location.origin)
            );
            
            if (existingClient) {
                console.log('SW: Focusing existing window');
                return existingClient.focus();
            } else {
                console.log('SW: Opening new window');
                return self.clients.openWindow('/');
            }
        })
    );
});
// -------------------------
// Background Sync for Offline Queue
// -------------------------
self.addEventListener('sync', event => {
    console.log('SW: Background sync event:', event.tag);
    
    if (event.tag === 'fcm-queue-retry') {
        console.log('SW: Background sync triggered for FCM queue');
        event.waitUntil(processOfflineQueue());
    }
    else if (event.tag === 'check-notifications') {
        event.waitUntil(checkTaskReminders());
    }
    else if (event.tag === 'offline-queue-process') {
        console.log('SW: Background sync triggered for offline queue processing');
        event.waitUntil(processOfflineQueue());
    }
});

// Enhanced offline queue processing
async function processOfflineQueue() {
    try {
        console.log('SW: Processing offline queue...');
        
        // Open IndexedDB to get queued notifications
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        return new Promise((resolve, reject) => {
            request.onerror = () => {
                console.error('SW: Failed to open IndexedDB:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = async () => {
                const db = request.result;
                
                try {
                    const transaction = db.transaction(['notification_queue'], 'readwrite');
                    const store = transaction.objectStore('notification_queue');
                    const getRequest = store.getAll();
                    
                    getRequest.onsuccess = async () => {
                        const queueItems = getRequest.result;
                        console.log('SW: Found', queueItems.length, 'queued items');
                        
                        if (queueItems.length === 0) {
                            resolve();
                            return;
                        }
                        
                        let processedCount = 0;
                        let failedCount = 0;
                        
                        // Process items with exponential backoff consideration
                        for (const item of queueItems) {
                            try {
                                // Check if retry time has passed
                                const nextRetryTime = new Date(item.nextRetryAt || 0);
                                const now = new Date();
                                
                                if (nextRetryTime > now) {
                                    console.log(`SW: Skipping item ${item.id} - retry time not reached`);
                                    continue;
                                }
                                
                                // Check retry limits
                                if (item.retryCount >= (item.maxRetries || 3)) {
                                    console.log(`SW: Removing expired item ${item.id} - max retries exceeded`);
                                    await deleteQueueItem(item.id);
                                    continue;
                                }
                                
                                // Process based on operation type
                                let success = false;
                                
                                if (item.operation === 'register_token') {
                                    success = await retryTokenRegistration(item);
                                } else if (item.operation === 'unregister_token') {
                                    success = await retryTokenUnregistration(item);
                                }
                                
                                if (success) {
                                    await deleteQueueItem(item.id);
                                    processedCount++;
                                    console.log(`SW: Successfully processed ${item.operation} for item ${item.id}`);
                                } else {
                                    // Update retry count and schedule next retry
                                    const updatedItem = {
                                        ...item,
                                        retryCount: item.retryCount + 1,
                                        nextRetryAt: new Date(Date.now() + calculateBackoffDelay(item.retryCount + 1)).toISOString(),
                                        lastRetryAt: new Date().toISOString()
                                    };
                                    
                                    const updateTransaction = db.transaction(['notification_queue'], 'readwrite');
                                    const updateStore = updateTransaction.objectStore('notification_queue');
                                    await updateStore.put(updatedItem);
                                    
                                    failedCount++;
                                    console.log(`SW: Updated retry count for item ${item.id}: ${updatedItem.retryCount}/${updatedItem.maxRetries}`);
                                }
                                
                                // Add delay between requests to avoid rate limiting
                                if (queueItems.indexOf(item) < queueItems.length - 1) {
                                    await new Promise(resolve => setTimeout(resolve, 500));
                                }
                                
                            } catch (itemError) {
                                console.error(`SW: Error processing queue item ${item.id}:`, itemError);
                                failedCount++;
                            }
                        }
                        
                        console.log(`SW: Queue processing completed - ${processedCount} processed, ${failedCount} failed`);
                        resolve();
                    };
                    
                    getRequest.onerror = () => {
                        console.error('SW: Failed to get queue items:', getRequest.error);
                        reject(getRequest.error);
                    };
                    
                } catch (transactionError) {
                    console.error('SW: Transaction error:', transactionError);
                    reject(transactionError);
                }
            };
        });
    } catch (error) {
        console.error('SW: Error processing offline queue:', error);
    }
}

// Calculate exponential backoff delay
function calculateBackoffDelay(retryCount) {
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const multiplier = 2;
    
    const delay = baseDelay * Math.pow(multiplier, retryCount);
    return Math.min(delay, maxDelay);
}

// Retry token registration
async function retryTokenRegistration(queueItem) {
    if (queueItem.retryCount >= 3) {
        console.log('SW: Max retries reached for token registration:', queueItem.id);
        return false;
    }

    try {
        // Check if we have necessary data
        if (!queueItem.data || !queueItem.data.token) {
            console.error('SW: Invalid token data in queue item:', queueItem.id);
            return false;
        }

        const response = await fetch('/api/fcm/register', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
                // Note: No auth header available in SW - backend should handle token validation
            },
            body: JSON.stringify({
                token: queueItem.data.token,
                device_id: queueItem.data.deviceId || queueItem.data.device_id,
                device_name: queueItem.data.device_name || 'Unknown Device'
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('SW: Token registration successful:', result);
        return true;

    } catch (error) {
        console.error('SW: Token registration retry failed:', error);
        return false;
    }
}

// Retry token unregistration
async function retryTokenUnregistration(queueItem) {
    if (queueItem.retryCount >= 3) {
        console.log('SW: Max retries reached for token unregistration:', queueItem.id);
        return false;
    }

    try {
        if (!queueItem.data || !queueItem.data.device_id) {
            console.error('SW: Invalid device data in queue item:', queueItem.id);
            return false;
        }

        const response = await fetch('/api/fcm/unregister', {
            method: 'DELETE',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                device_id: queueItem.data.device_id
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        console.log('SW: Token unregistration successful');
        return true;

    } catch (error) {
        console.error('SW: Token unregistration retry failed:', error);
        return false;
    }
}

// Delete queue item from IndexedDB
async function deleteQueueItem(id) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['notification_queue'], 'readwrite');
            const store = transaction.objectStore('notification_queue');
            const deleteRequest = store.delete(id);
            
            deleteRequest.onsuccess = () => {
                console.log('SW: Deleted queue item:', id);
                resolve();
            };
            deleteRequest.onerror = () => {
                console.error('SW: Failed to delete queue item:', deleteRequest.error);
                reject(deleteRequest.error);
            };
        };
        request.onerror = () => {
            console.error('SW: Failed to open DB for delete:', request.error);
            reject(request.error);
        };
    });
}

// -------------------------
// Notification Click Handler (Both FCM and Local)
// -------------------------
self.addEventListener('notificationclick', event => {
    console.log('SW: Notification clicked:', event.notification.tag, event.action);
    event.notification.close();
    
    if (event.action === 'dismiss') {
        return;
    }
    
    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
                // Try to focus existing window
                for (const client of clientList) {
                    if (client.url.includes('index.html') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Open new window if none found
                return clients.openWindow('./index.html');
            })
        );
    }
});

// -------------------------
// Local Notification Functions (Guest Users)
// -------------------------
function showLocalNotification(task, notificationId, userNameOverride = null) {
    const now = new Date();
    const displayName = userNameOverride || userName;
    
    if (
        enableReminders &&
        Notification.permission === 'granted' &&
        (!lastNotificationTimes.has(notificationId) ||
         (now - lastNotificationTimes.get(notificationId)) > 10 * 60 * 1000)
    ) {
        console.log(`SW: Showing local notification for task "${task.name}" at ${task.startTime}`);
        
        self.registration.showNotification('Task Reminder', {
            body: `Hey, ${displayName}! ${task.name} is starting in 10 minutes—let's do this!😊💪 Priority: ${task.priority}`,
            icon: './icons/icon-192x192.png',
            vibrate: [200, 100, 200],
            actions: [{ action: 'open', title: 'Open App' }],
            tag: notificationId,
            timestamp: Date.now()
        });
        
        lastNotificationTimes.set(notificationId, now);
        setTimeout(() => lastNotificationTimes.delete(notificationId), 10 * 60 * 1000);
    } else {
        console.log(`SW: Skipped local notification for task "${task.name}": enableReminders=${enableReminders}, permission=${Notification.permission}, alreadyNotified=${lastNotificationTimes.has(notificationId)}`);
    }
}

// -------------------------
// Task Reminder Checking (Guest Users Only)
// -------------------------
function checkTaskReminders() {
    // CRITICAL: Skip if authenticated (FCM handles this) or reminders disabled
    if (isAuthenticated || !enableReminders || !('Notification' in self) || Notification.permission !== 'granted') {
        console.log('SW: Skipped checkTaskReminders: isAuthenticated=', isAuthenticated, 'enableReminders=', enableReminders);
        return Promise.resolve();
    }
    
    console.log('SW: Checking task reminders for GUEST USER ONLY');
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
            timeDiff >= 9.5 * 60 * 1000 &&
            !lastNotificationTimes.has(notificationId)
        ) {
            console.log(`SW: Showing LOCAL notification for GUEST USER - task "${task.name}" at ${task.startTime}: timeDiff=${timeDiff}ms`);
            return self.registration.showNotification('Task Reminder', {
                body: `Hey, ${userName}! ${task.name} is starting in 10 minutes—let's do this!😊💪 Priority: ${task.priority}`,
                icon: './icons/icon-192x192.png',
                vibrate: [200, 100, 200],
                actions: [{ action: 'open', title: 'Open App' }],
                tag: notificationId,
                timestamp: Date.now()
            }).then(() => {
                lastNotificationTimes.set(notificationId, now);
                setTimeout(() => lastNotificationTimes.delete(notificationId), 10 * 60 * 1000);
            });
        } else {
            return Promise.resolve();
        }
    });

    return Promise.all(promises);
}
// -------------------------
// Periodic Sync Event
// -------------------------
self.addEventListener('periodicsync', event => {
    if (event.tag === 'check-notifications') {
        event.waitUntil(checkTaskReminders());
    } else if (event.tag === 'process-offline-queue') {
        event.waitUntil(processOfflineQueue());
    }
});

// -------------------------
// Background Task Checking Timer - GUEST USERS ONLY
// -------------------------
// Only run periodic checks for guest users (authenticated users get FCM from backend)
setInterval(() => {
    if (!isAuthenticated && enableReminders) {
        console.log('SW: Running periodic check for GUEST USER');
        checkTaskReminders();
    } else {
        console.log('SW: Skipped periodic check - authenticated user or reminders disabled');
    }
}, 30 * 1000);

// Periodic offline queue processing (every 5 minutes)
setInterval(() => {
    if (navigator.onLine) {
        processOfflineQueue();
    }
}, 5 * 60 * 1000);

// Run initial check on SW load
checkTaskReminders();