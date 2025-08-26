import * as idb from 'https://cdn.jsdelivr.net/npm/idb@7.0.2/+esm';

export const DB_NAME = 'getitdone';
export const DB_VERSION = 2;

export const dbPromise = idb.openDB(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion, newVersion, transaction) {
    console.log(`Upgrading DB from v${oldVersion} to v${newVersion}`);

    if (!db.objectStoreNames.contains('tasks')) {
      const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
      taskStore.createIndex('user_id', 'user_id');
    }
    if (!db.objectStoreNames.contains('settings')) {
      db.createObjectStore('settings', { keyPath: 'key' });
    }
    if (!db.objectStoreNames.contains('fcm_tokens')) {
      const fcmStore = db.createObjectStore('fcm_tokens', { keyPath: 'deviceId' });
      fcmStore.createIndex('user_id', 'userId');
    }
    if (!db.objectStoreNames.contains('notification_queue')) {
      db.createObjectStore('notification_queue', { keyPath: 'id' });
    }
  }
});


/* Add a task to IndexedDB */
async function addTask(task) {
  const db = await dbPromise;
  const tx = db.transaction('tasks', 'readwrite');
  const store = tx.objectStore('tasks');
  try {
    const existingTask = await store.get(task.id);
    if (existingTask) {
      console.log(`Task with ID ${task.id} already exists, skipping add`);
      await tx.complete;
      return existingTask;
    }
    await store.add(task);
    await tx.complete;
    console.log(`Added task to IndexedDB: ${task.name}`);
    return task;
  } catch (error) {
    console.error('Error adding task:', error);
    await tx.complete;
    throw error;
  }
}

/* Sort tasks by start time */
function sortTasksByTime(tasks) {
  return tasks.sort((a, b) => {
    const getMinutesSinceMidnight = time => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };
    return getMinutesSinceMidnight(a.start_time) - getMinutesSinceMidnight(b.start_time);
  });
}

/* Get all tasks from IndexedDB - always sorted by start time */
async function getAllTasks(includePendingDeletes = false) {
  const db = await dbPromise;
  const tx = db.transaction('tasks', 'readonly');
  const store = tx.objectStore('tasks');
  try {
    const tasks = await store.getAll();
    await tx.complete;
        
    let filteredTasks = tasks;
    if (!includePendingDeletes) {
      filteredTasks = tasks.filter(task => task.pending_sync !== 'delete');
    }

    // Format time fields to remove seconds before sorting and returning
    const formattedTasks = filteredTasks.map(task => ({
      ...task,
      start_time: formatTimeString(task.start_time),
      end_time: formatTimeString(task.end_time)
    }));
        
    return sortTasksByTime(formattedTasks);
  } catch (error) {
    console.error('Error getting all tasks:', error);
    await tx.complete;
    throw error;
  }
}

// Helper function to format time strings
function formatTimeString(timeString) {
  if (!timeString) return timeString;
  
  // If it's in HH:MM:SS format, truncate to HH:MM
  if (timeString.includes(':') && timeString.split(':').length === 3) {
    return timeString.substring(0, 5); // "14:27:00" becomes "14:27"
  }
  
  // If it's already in HH:MM format, return as-is
  return timeString;
}
/* Get a task by ID */
async function getTaskById(id) {
  const db = await dbPromise;
  const tx = db.transaction('tasks', 'readonly');
  const store = tx.objectStore('tasks');
  try {
    const task = await store.get(id);
    await tx.complete;
    return task;
  } catch (error) {
    console.error('Error getting task by ID:', error);
    await tx.complete;
    throw error;
  }
}

/* Update a task in IndexedDB */
async function updateTask(task) {
  const db = await dbPromise;
  const tx = db.transaction('tasks', 'readwrite');
  const store = tx.objectStore('tasks');
  try {
    await store.put(task);
    await tx.complete;
    console.log(`Updated task in IndexedDB: ${task.name}`);
    return task;
  } catch (error) {
    console.error('Error updating task:', error);
    await tx.complete;
    throw error;
  }
}

/* Mark a task as pending delete in IndexedDB */
async function markTaskAsPendingDelete(id) {
  const db = await dbPromise;
  const tx = db.transaction('tasks', 'readwrite');
  const store = tx.objectStore('tasks');
  try {
    const task = await store.get(id);
    if (task) {
      task.pending_sync = 'delete';
      await store.put(task);
      console.log(`Marked task ${id} as pending delete`);
    } else {
      console.warn(`Task ${id} not found for pending delete`);
    }
    await tx.complete;
  } catch (error) {
    console.error('Error marking task as pending delete:', error);
    await tx.complete;
    throw error;
  }
}

/* Delete a task from IndexedDB */
async function deleteTask(id) {
  const db = await dbPromise;
  const tx = db.transaction('tasks', 'readwrite');
  const store = tx.objectStore('tasks');
  try {
    await store.delete(id);
    await tx.complete;
    console.log(`Deleted task from IndexedDB: ${id}`);
  } catch (error) {
    console.error('Error deleting task:', error);
    await tx.complete;
    throw error;
  }
}

/* Delete all tasks for a user from IndexedDB */
async function deleteTasksByUserId(userId) {
  const db = await dbPromise;
  const tx = db.transaction('tasks', 'readwrite');
  const store = tx.objectStore('tasks');
  try {
    const tasks = await store.getAll();
    const userTasks = tasks.filter(task => task.user_id === userId && task.user_id !== null);
    for (const task of userTasks) {
      await store.delete(task.id);
      console.log(`Deleted task ${task.id} for user ${userId}`);
    }
    await tx.complete;
    console.log(`Deleted ${userTasks.length} tasks for user ${userId}`);
  } catch (error) {
    console.error('Error deleting tasks by user ID:', error);
    await tx.complete;
    throw error;
  }
}

/* Set a setting in IndexedDB */
async function setSetting(key, value) {
  const db = await dbPromise;
  const tx = db.transaction('settings', 'readwrite');
  const store = tx.objectStore('settings');
  try {
    await store.put({ key, value });
    await tx.complete;
    console.log(`Set setting: ${key}=${value}`);
  } catch (error) {
    console.error('Error setting setting:', error);
    await tx.complete;
    throw error;
  }
}

/* Get a setting from IndexedDB */
async function getSetting(key) {
  const db = await dbPromise;
  const tx = db.transaction('settings', 'readonly');
  const store = tx.objectStore('settings');
  try {
    const setting = await store.get(key);
    await tx.complete;
    return setting ? setting.value : null;
  } catch (error) {
    console.error('Error getting setting:', error);
    await tx.complete;
    throw error;
  }
}

/* Store FCM token in IndexedDB */
async function storeFCMToken(tokenData) {
  const db = await dbPromise;
  const tx = db.transaction('fcm_tokens', 'readwrite');
  const store = tx.objectStore('fcm_tokens');
  try {
    await store.put(tokenData);
    await tx.complete;
    console.log(`Stored FCM token for device: ${tokenData.deviceId}`);
    return tokenData;
  } catch (error) {
    console.error('Error storing FCM token:', error);
    await tx.complete;
    throw error;
  }
}

/* Get FCM token by device ID */
async function getFCMToken(deviceId) {
  const db = await dbPromise;
  const tx = db.transaction('fcm_tokens', 'readonly');
  const store = tx.objectStore('fcm_tokens');
  try {
    const tokenData = await store.get(deviceId);
    await tx.complete;
    return tokenData;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    await tx.complete;
    throw error;
  }
}

/* Delete FCM token by device ID */
async function deleteFCMToken(deviceId) {
  const db = await dbPromise;
  const tx = db.transaction('fcm_tokens', 'readwrite');
  const store = tx.objectStore('fcm_tokens');
  try {
    await store.delete(deviceId);
    await tx.complete;
    console.log(`Deleted FCM token for device: ${deviceId}`);
  } catch (error) {
    console.error('Error deleting FCM token:', error);
    await tx.complete;
    throw error;
  }
}

/* Get all FCM tokens for a user */
async function getAllFCMTokens(userId) {
  const db = await dbPromise;
  const tx = db.transaction('fcm_tokens', 'readonly');
  const store = tx.objectStore('fcm_tokens');
  const index = store.index('user_id');
  try {
    const tokens = await index.getAll(userId);
    await tx.complete;
    return tokens;
  } catch (error) {
    console.error('Error getting FCM tokens for user:', error);
    await tx.complete;
    throw error;
  }
}

/* Store queued notification in IndexedDB */
async function storeQueuedNotification(queueItem) {
  const db = await dbPromise;
  const tx = db.transaction('notification_queue', 'readwrite');
  const store = tx.objectStore('notification_queue');
  try {
    await store.put(queueItem);
    await tx.complete;
    console.log(`Stored queued notification: ${queueItem.id}`);
    return queueItem;
  } catch (error) {
    console.error('Error storing queued notification:', error);
    await tx.complete;
    throw error;
  }
}

/* Get all queued notifications */
async function getAllQueuedNotifications() {
  const db = await dbPromise;
  const tx = db.transaction('notification_queue', 'readonly');
  const store = tx.objectStore('notification_queue');
  try {
    const queueItems = await store.getAll();
    await tx.complete;
    return queueItems;
  } catch (error) {
    console.error('Error getting queued notifications:', error);
    await tx.complete;
    throw error;
  }
}

/* Delete queued notification by ID */
async function deleteQueuedNotification(id) {
  const db = await dbPromise;
  const tx = db.transaction('notification_queue', 'readwrite');
  const store = tx.objectStore('notification_queue');
  try {
    await store.delete(id);
    await tx.complete;
    console.log(`Deleted queued notification: ${id}`);
  } catch (error) {
    console.error('Error deleting queued notification:', error);
    await tx.complete;
    throw error;
  }
}

export { 
  addTask, 
  getAllTasks, 
  getTaskById, 
  updateTask, 
  markTaskAsPendingDelete, 
  deleteTask, 
  deleteTasksByUserId, 
  setSetting, 
  getSetting,
  storeFCMToken,
  getFCMToken,
  deleteFCMToken,
  getAllFCMTokens,
  storeQueuedNotification,
  getAllQueuedNotifications,
  deleteQueuedNotification
};