// Offline Queue Manager for GetItDone App
// Handles queuing, retrying, and cleanup of failed FCM operations

import { storeQueuedNotification, getAllQueuedNotifications, deleteQueuedNotification } from './db.js';
import { access_token } from './authHandler.js';
import { authStateManager } from './authStateManager.js';


// At the top of offline-queue.js
const API_BASE_URL = window.API_BASE_URL; // Uses config.js

// Queue operation types
const QUEUE_OPERATIONS = {
    REGISTER_TOKEN: 'register_token',
    UNREGISTER_TOKEN: 'unregister_token',
    SEND_NOTIFICATION: 'send_notification'
};

// Retry configuration
const RETRY_CONFIG = {
    MAX_RETRIES: 3,
    BASE_DELAY: 1000, // 1 second
    MAX_DELAY: 30000, // 30 seconds
    BACKOFF_MULTIPLIER: 2,
    QUEUE_CLEANUP_HOURS: 24
};

// Active retry timers (to prevent duplicate retries)
const activeRetries = new Map();

/**
 * Generate unique queue item ID
 */
function generateQueueId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(retryCount) {
    const delay = RETRY_CONFIG.BASE_DELAY * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, retryCount);
    return Math.min(delay, RETRY_CONFIG.MAX_DELAY);
}

/**
 * Queue a failed operation for retry
 */
async function queueOperation(operation, data, priority = 'normal') {
    try {
        const queueItem = {
            id: generateQueueId(),
            operation: operation,
            data: data,
            timestamp: new Date().toISOString(),
            retryCount: 0,
            maxRetries: RETRY_CONFIG.MAX_RETRIES,
            priority: priority, // 'high', 'normal', 'low'
            nextRetryAt: new Date(Date.now() + RETRY_CONFIG.BASE_DELAY).toISOString()
        };

        await storeQueuedNotification(queueItem);
        console.log(`Offline Queue: Queued ${operation} operation:`, queueItem.id);
        
        // Schedule immediate retry if online
        if (navigator.onLine) {
            scheduleRetry(queueItem);
        }
        
        return queueItem;
    } catch (error) {
        console.error('Offline Queue: Failed to queue operation:', error);
        throw error;
    }
}

/**
 * Queue FCM token registration
 */
async function queueTokenRegistration(tokenData) {
    return await queueOperation(QUEUE_OPERATIONS.REGISTER_TOKEN, tokenData, 'high');
}

/**
 * Queue FCM token unregistration
 */
async function queueTokenUnregistration(deviceId) {
    return await queueOperation(QUEUE_OPERATIONS.UNREGISTER_TOKEN, { device_id: deviceId }, 'normal');
}

/**
 * Schedule retry for a queue item
 */
function scheduleRetry(queueItem) {
    // Prevent duplicate retries
    if (activeRetries.has(queueItem.id)) {
        return;
    }

    const delay = calculateBackoffDelay(queueItem.retryCount);
    const timeoutId = setTimeout(async () => {
        activeRetries.delete(queueItem.id);
        await retryQueueItem(queueItem);
    }, delay);

    activeRetries.set(queueItem.id, timeoutId);
    console.log(`Offline Queue: Scheduled retry for ${queueItem.id} in ${delay}ms`);
}

/**
 * Retry a specific queue item
 */
async function retryQueueItem(queueItem) {
    try {
        // Check if item still exists (might have been cleaned up)
        const queueItems = await getAllQueuedNotifications();
        const currentItem = queueItems.find(item => item.id === queueItem.id);
        
        if (!currentItem) {
            console.log(`Offline Queue: Item ${queueItem.id} no longer exists, skipping retry`);
            return;
        }

        // Check if max retries exceeded
        if (currentItem.retryCount >= currentItem.maxRetries) {
            console.log(`Offline Queue: Max retries exceeded for ${queueItem.id}, removing from queue`);
            await deleteQueuedNotification(queueItem.id);
            return;
        }

        // Check if we're online
        if (!navigator.onLine) {
            console.log(`Offline Queue: Still offline, postponing retry for ${queueItem.id}`);
            return;
        }

        console.log(`Offline Queue: Retrying ${currentItem.operation} (attempt ${currentItem.retryCount + 1}/${currentItem.maxRetries})`);

        let success = false;

        switch (currentItem.operation) {
            case QUEUE_OPERATIONS.REGISTER_TOKEN:
                success = await retryTokenRegistration(currentItem.data);
                break;
            
            case QUEUE_OPERATIONS.UNREGISTER_TOKEN:
                success = await retryTokenUnregistration(currentItem.data);
                break;
            
            default:
                console.warn(`Offline Queue: Unknown operation type: ${currentItem.operation}`);
                await deleteQueuedNotification(currentItem.id);
                return;
        }

        if (success) {
            console.log(`Offline Queue: Successfully retried ${currentItem.operation} for ${queueItem.id}`);
            await deleteQueuedNotification(currentItem.id);
        } else {
            // Update retry count and schedule next retry
            const updatedItem = {
                ...currentItem,
                retryCount: currentItem.retryCount + 1,
                nextRetryAt: new Date(Date.now() + calculateBackoffDelay(currentItem.retryCount + 1)).toISOString()
            };
            
            await storeQueuedNotification(updatedItem);
            
            if (updatedItem.retryCount < updatedItem.maxRetries) {
                scheduleRetry(updatedItem);
            } else {
                console.log(`Offline Queue: Max retries reached for ${queueItem.id}, removing from queue`);
                await deleteQueuedNotification(queueItem.id);
            }
        }

    } catch (error) {
        console.error(`Offline Queue: Error during retry for ${queueItem.id}:`, error);
        
        // Update retry count even on error
        try {
            const updatedItem = {
                ...queueItem,
                retryCount: queueItem.retryCount + 1,
                lastError: error.message,
                nextRetryAt: new Date(Date.now() + calculateBackoffDelay(queueItem.retryCount + 1)).toISOString()
            };
            
            await storeQueuedNotification(updatedItem);
            
            if (updatedItem.retryCount < updatedItem.maxRetries) {
                scheduleRetry(updatedItem);
            }
        } catch (updateError) {
            console.error('Offline Queue: Failed to update queue item after error:', updateError);
        }
    }
}

/**
 * Retry token registration
 */
async function retryTokenRegistration(tokenData) {
    try {
        if (!access_token) {
            console.log('Offline Queue: No access token available for token registration');
            return false;
        }

        const response = await fetch(`${API_BASE_URL}/api/fcm/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${access_token}`
            },
            body: JSON.stringify({
                token: tokenData.token,
                device_id: tokenData.deviceId || tokenData.device_id,
                device_name: tokenData.device_name || `${navigator.platform} - ${navigator.userAgent.split(' ')[0]}`
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('Offline Queue: Token registration successful:', result);
        return true;

    } catch (error) {
        console.error('Offline Queue: Token registration retry failed:', error);
        return false;
    }
}

/**
 * Retry token unregistration
 */
async function retryTokenUnregistration(data) {
    try {
        if (!access_token) {
            console.log('Offline Queue: No access token available for token unregistration');
            return false;
        }

        const response = await fetch('/api/fcm/unregister', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${access_token}`
            },
            body: JSON.stringify({
                device_id: data.device_id
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        console.log('Offline Queue: Token unregistration successful');
        return true;

    } catch (error) {
        console.error('Offline Queue: Token unregistration retry failed:', error);
        return false;
    }
}

/**
 * Check if there are pending tasks in the queue
 */
async function hasPendingTasks() {
    try {
        const queueItems = await getAllQueuedNotifications();
        return queueItems.length > 0;
    } catch (error) {
        console.error('Offline Queue: Error checking pending tasks:', error);
        return false;
    }
}


/**
 * Process all queued operations
 */
async function processAllQueuedOperations() {
    try {
                // Check auth state first
        const authState = await authStateManager.getAuthState();
        if (!authState) {
            console.log('Offline Queue: No auth state found, skipping sync');
            return;
        }
        if (!navigator.onLine) {
            console.log('Offline Queue: Still offline, skipping queue processing');
            return;
        }

        const queueItems = await getAllQueuedNotifications();
        
        if (queueItems.length === 0) {
            console.log('Offline Queue: No queued operations to process');
            return;
        }

        console.log(`Offline Queue: Processing ${queueItems.length} queued operations`);

        // Sort by priority and timestamp (high priority first, then oldest first)
        const sortedItems = queueItems.sort((a, b) => {
            const priorityOrder = { high: 3, normal: 2, low: 1 };
            const aPriority = priorityOrder[a.priority] || 2;
            const bPriority = priorityOrder[b.priority] || 2;
            
            if (aPriority !== bPriority) {
                return bPriority - aPriority; // Higher priority first
            }
            
            return new Date(a.timestamp) - new Date(b.timestamp); // Older first
        });

        // Process items with delay to avoid overwhelming the server
        for (let i = 0; i < sortedItems.length; i++) {
            const item = sortedItems[i];
            
            // Skip if already being retried
            if (activeRetries.has(item.id)) {
                continue;
            }

            // Check if retry time has passed
            const nextRetryTime = new Date(item.nextRetryAt || 0);
            const now = new Date();
            
            if (nextRetryTime > now) {
                // Schedule for later
                const delay = nextRetryTime.getTime() - now.getTime();
                setTimeout(() => retryQueueItem(item), delay);
                continue;
            }

            // Process immediately
            await retryQueueItem(item);
            
            // Add small delay between requests to avoid rate limiting
            if (i < sortedItems.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

    } catch (error) {
        console.error('Offline Queue: Error processing queued operations:', error);
    }
}

/**
 * Clean up old queue items (older than 24 hours)
 */
async function cleanupOldQueueItems() {
    try {
        const queueItems = await getAllQueuedNotifications();
        const cutoffTime = new Date(Date.now() - (RETRY_CONFIG.QUEUE_CLEANUP_HOURS * 60 * 60 * 1000));
        
        let cleanedCount = 0;
        
        for (const item of queueItems) {
            const itemTime = new Date(item.timestamp);
            
            if (itemTime < cutoffTime) {
                await deleteQueuedNotification(item.id);
                cleanedCount++;
                console.log(`Offline Queue: Cleaned up old queue item: ${item.id} (${item.operation})`);
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`Offline Queue: Cleaned up ${cleanedCount} old queue items`);
        }
        
        return cleanedCount;
        
    } catch (error) {
        console.error('Offline Queue: Error during cleanup:', error);
        return 0;
    }
}

/**
 * Get queue statistics
 */
async function getQueueStats() {
    try {
        const queueItems = await getAllQueuedNotifications();
        
        const stats = {
            total: queueItems.length,
            byOperation: {},
            byPriority: { high: 0, normal: 0, low: 0 },
            oldestItem: null,
            newestItem: null
        };
        
        queueItems.forEach(item => {
            // Count by operation
            stats.byOperation[item.operation] = (stats.byOperation[item.operation] || 0) + 1;
            
            // Count by priority
            stats.byPriority[item.priority] = (stats.byPriority[item.priority] || 0) + 1;
            
            // Track oldest and newest
            const itemTime = new Date(item.timestamp);
            if (!stats.oldestItem || itemTime < new Date(stats.oldestItem.timestamp)) {
                stats.oldestItem = item;
            }
            if (!stats.newestItem || itemTime > new Date(stats.newestItem.timestamp)) {
                stats.newestItem = item;
            }
        });
        
        return stats;
        
    } catch (error) {
        console.error('Offline Queue: Error getting queue stats:', error);
        return null;
    }
}

/**
 * Initialize offline queue manager
 */
async function initOfflineQueue() {
    try {
        console.log('Offline Queue: Initializing...');
        
        // Clean up old items on startup
        await cleanupOldQueueItems();
        
        // Process any existing queue items if online
        if (navigator.onLine) {
            // Delay initial processing to let the app finish loading
            setTimeout(() => processAllQueuedOperations(), 5000);
        }
        
        // Listen for online events
        window.addEventListener('online', () => {
            console.log('Offline Queue: Network back online, processing queued operations');
            setTimeout(() => processAllQueuedOperations(), 1000);
        });
        
        // Listen for offline events
        window.addEventListener('offline', () => {
            console.log('Offline Queue: Network offline, queuing will be available');
        });
        
        // Periodic cleanup (every hour)
        setInterval(cleanupOldQueueItems, 60 * 60 * 1000);
        
        // Periodic queue processing (every 5 minutes when online)
        setInterval(() => {
            if (navigator.onLine) {
                processAllQueuedOperations();
            }
        }, 5 * 60 * 1000);
        
        console.log('Offline Queue: Initialized successfully');
        
        // Log current queue stats
        const stats = await getQueueStats();
        if (stats && stats.total > 0) {
            console.log('Offline Queue: Current queue stats:', stats);
        }
        
    } catch (error) {
        console.error('Offline Queue: Initialization failed:', error);
    }
}

/**
 * Clear all queue items (for testing or cleanup)
 */
async function clearAllQueueItems() {
    try {
        const queueItems = await getAllQueuedNotifications();
        
        for (const item of queueItems) {
            await deleteQueuedNotification(item.id);
        }
        
        console.log(`Offline Queue: Cleared ${queueItems.length} queue items`);
        return queueItems.length;
        
    } catch (error) {
        console.error('Offline Queue: Error clearing queue items:', error);
        return 0;
    }
}


// Export functions
export {
    // Core queue operations
    queueOperation,
    queueTokenRegistration,
    queueTokenUnregistration,
    
    // Processing and retry
    hasPendingTasks,
    processAllQueuedOperations,
    retryQueueItem,
    
    // Management
    initOfflineQueue,
    cleanupOldQueueItems,
    clearAllQueueItems,
    getQueueStats,
    
    // Constants
    QUEUE_OPERATIONS,
    RETRY_CONFIG
};