import * as idb from 'https://cdn.jsdelivr.net/npm/idb@7.0.2/+esm';

let dbPromise = idb.openDB('getitdone', 1, {
    upgrade(db) {
        if (!db.objectStoreNames.contains('tasks')) {
            const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
            taskStore.createIndex('user_id', 'user_id');
        }
        if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
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
        
        // Filter out pending deletes unless explicitly requested
        let filteredTasks = tasks;
        if (!includePendingDeletes) {
            filteredTasks = tasks.filter(task => task.pending_sync !== 'delete');
        }
        
        // Always sort by start time before returning
        return sortTasksByTime(filteredTasks);
    } catch (error) {
        console.error('Error getting all tasks:', error);
        await tx.complete;
        throw error;
    }
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

export { 
    addTask, 
    getAllTasks, 
    getTaskById, 
    updateTask, 
    markTaskAsPendingDelete, 
    deleteTask, 
    deleteTasksByUserId, 
    setSetting, 
    getSetting 
};
