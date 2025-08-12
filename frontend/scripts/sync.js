import { user, access_token, isAuthenticated, supabase } from './authHandler.js';
import { addTask, updateTask, deleteTask, getAllTasks, deleteTasksByUserId, getTaskById } from './db.js';
import { renderTasks } from './app.js';

// Base URL for FastAPI backend (adjust for production)
const API_BASE_URL = 'http://localhost:8000/tasks';

/**
 * Fetch tasks from FastAPI /tasks endpoint for the logged-in user.
 * @returns {Promise<Array>} Array of tasks or local tasks on failure.
 */
async function fetchBackendTasks() {
    if (!isAuthenticated()) {
        console.warn('Not authenticated, skipping backend task fetch');
        return [];
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
        const response = await fetch(API_BASE_URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const tasks = await response.json();
        console.log(`Fetched ${tasks.length} tasks for user ${user.id}`);
        return tasks;
    } catch (error) {
        console.error('Fetch tasks failed:', error.message);
        const localTasks = await getAllTasks();
        return localTasks.filter(task => task.user_id === user.id) || [];
    }
}

/**
 * Cache backend tasks to IndexedDB, clearing existing user tasks.
 * @param {Array} tasks - Tasks from backend to cache.
 * @returns {Promise<void>}
 */
async function cacheBackendTasks(tasks) {
    try {
        // Use deleteTasksByUserId for efficiency
        await deleteTasksByUserId(user.id);

        // Cache backend tasks
        for (const task of tasks) {
            const formattedTask = {
                id: task.id,
                user_id: task.user_id,
                name: task.name,
                start_time: task.start_time,
                end_time: task.end_time,
                category: task.category,
                priority: task.priority,
                completed: task.completed,
                is_late: task.is_late,
                created_at: task.created_at,
                pending_sync: null,
            };
            const localTasks = await getAllTasks();
            const existingTask = localTasks.find(t => t.id === task.id);
            if (existingTask) {
                await updateTask(formattedTask);
            } else {
                await addTask(formattedTask);
            }
        }

        console.log(`Cached ${tasks.length} tasks in IndexedDB`);
    } catch (error) {
        console.error('Cache tasks failed:', error.message);
    }
}

/**
 * Sync pending tasks (create/update/delete) to FastAPI when online.
 * @returns {Promise<void>}
 */
async function syncPendingTasks() {
    if (!isAuthenticated() || !navigator.onLine) {
        console.warn('Not authenticated or offline, skipping sync');
        return;
    }

    try {
        const tasks = await getAllTasks();
        const pendingTasks = tasks.filter(task => task.pending_sync && task.user_id === user.id);

        for (const task of pendingTasks) {
            try {
                let response;
                const headers = {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/json',
                };

                const payload = {
                    name: task.name,
                    start_time: task.start_time,
                    end_time: task.end_time,
                    category: task.category,
                    priority: task.priority,
                    completed: task.completed,
                    is_late: task.is_late,
                    created_at: task.created_at,
                    user_id: task.user_id, // Include user_id in payload
                };

                if (task.pending_sync === 'create') {
                    response = await fetch(API_BASE_URL, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(payload),
                    });
                    if (response.ok) {
                        const newTask = await response.json();
                        await updateTask({ ...task, id: newTask.id, pending_sync: null }); // Update with backend ID
                        console.log(`Synced task ${newTask.id} (create)`);
                    }
                } else if (task.pending_sync === 'update') {
                    response = await fetch(`${API_BASE_URL}/${task.id}`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify(payload),
                    });
                    if (response.ok) {
                        await updateTask({ ...task, pending_sync: null });
                        console.log(`Synced task ${task.id} (update)`);
                    }
                } else if (task.pending_sync === 'delete') {
                    response = await fetch(`${API_BASE_URL}/${task.id}`, {
                        method: 'DELETE',
                        headers,
                    });
                    if (response.ok) {
                        await deleteTask(task.id);
                        console.log(`Synced task ${task.id} (delete)`);
                    }
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            } catch (error) {
                console.error(`Sync failed for task ${task.id}:`, error.message);
                // Retry on next sync
            }
        }
    } catch (error) {
        console.error('Sync pending tasks failed:', error.message);
    }
}

/**
 * Set up Supabase real-time subscriptions for task updates.
 * @returns {void}
 */
function setupRealtimeSubscriptions() {
    if (!isAuthenticated()) {
        console.warn('Not authenticated, skipping real-time subscriptions');
        return;
    }

    try {
        let subscription = null;
        if (subscription) {
            subscription.unsubscribe();
        }
        subscription = supabase
            .channel('tasks')
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'tasks', 
                    filter: `user_id=eq.${user.id}`,
                }, 
                async (payload) => {
                    try {
                        const { eventType, new: newData, old: oldData } = payload;

                        if (eventType === 'INSERT' || eventType === 'UPDATE') {
                            const task = {
                                id: newData.id,
                                user_id: newData.user_id,
                                name: newData.name,
                                start_time: newData.start_time,
                                end_time: newData.end_time,
                                category: newData.category,
                                priority: newData.priority,
                                completed: newData.completed,
                                is_late: newData.is_late,
                                created_at: newData.created_at,
                                pending_sync: null,
                            };

                            const localTasks = await getAllTasks();
                            const existingTask = localTasks.find(t => t.id === task.id);

                            if (existingTask) {
                                await updateTask(task);
                            } else {
                                await addTask(task);
                            }
                        } else if (eventType === 'DELETE') {
                            await deleteTask(oldData.id);
                        }

                        // Refresh UI
                        await renderTasks();
                        console.log(`Real-time update: ${eventType} for task ${newData?.id || oldData?.id}`);
                    } catch (error) {
                        console.error('Real-time update failed:', error.message);
                    }
                }
            )
            .subscribe();

        console.log('Real-time subscriptions set up for user', user.id);

        // Clean up subscription on unload
        window.addEventListener('unload', () => {
            subscription.unsubscribe();
        });
    } catch (error) {
        console.error('Failed to set up real-time subscriptions:', error.message);
    }
}

/**
 * Retry sync when back online
 * @returns {void}
 */
function retrySyncTasks() {
    window.addEventListener('online', async () => {
        console.log('Network online, retrying sync...');
        try {
            const tasks = await fetchBackendTasks();
            await cacheBackendTasks(tasks);
            await syncPendingTasks();
            console.log('Retry sync completed');
        } catch (error) {
            console.error('Retry sync failed:', error.message);
        }
    });
}

export { fetchBackendTasks, cacheBackendTasks, syncPendingTasks, setupRealtimeSubscriptions, retrySyncTasks };