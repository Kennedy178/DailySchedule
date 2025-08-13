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
// sync.js
async function cacheBackendTasks(backendTasks) {
    try {
        if (!Array.isArray(backendTasks)) {
            console.warn('cacheBackendTasks: backendTasks not an array');
            return false;
        }

        // Get all local tasks once
        const localTasks = await getAllTasks();
        const localMap = new Map(localTasks.map(t => [String(t.id), t]));
        const backendIdSet = new Set();

        console.log('cacheBackendTasks: merging', backendTasks.length, 'tasks');

        for (const bt of backendTasks) {
            const id = String(bt.id);
            backendIdSet.add(id);

            const existing = localMap.get(id);

            // Merge strategy:
            // - Use backend values for canonical fields (name, times, etc.)
            // - For completed/is_late: preserve backend value when provided,
            //   otherwise fall back to local existing value, otherwise default false.
            // - Preserve local pending_sync if present (don't clear unsynced local edits).
            const merged = {
                id,
                user_id: bt.user_id ?? existing?.user_id ?? user?.id ?? null,
                name: bt.name,
                start_time: bt.start_time,
                end_time: bt.end_time,
                category: bt.category,
                priority: bt.priority,
                completed: (typeof bt.completed !== 'undefined') ? bt.completed : (existing?.completed ?? false),
                is_late: (typeof bt.is_late !== 'undefined') ? bt.is_late : (existing?.is_late ?? false),
                created_at: bt.created_at ?? existing?.created_at ?? new Date().toISOString().split('T')[0],
                // Keep any local pending_sync (user-driven changes) intact.
                pending_sync: existing?.pending_sync ?? null
            };

            if (existing) {
                await updateTask(merged);
            } else {
                await addTask(merged);
            }
        }

        // Cleanup: remove local user tasks that aren't on backend and have no pending_sync.
        // (Don't delete local tasks that are pending sync — user intent must be preserved.)
        const localUserTasks = localTasks.filter(t => t.user_id === user?.id);
        for (const lt of localUserTasks) {
            if (!backendIdSet.has(String(lt.id)) && (lt.pending_sync == null)) {
                console.log(`cacheBackendTasks: deleting stale local task ${lt.id}`);
                await deleteTask(lt.id);
            }
        }

        console.log('cacheBackendTasks: merge complete');
        return true;
    } catch (err) {
        console.error('cacheBackendTasks error:', err);
        return false;
    }
}

/**
 * Sync pending tasks (create/update/delete) to FastAPI when online.
 * @returns {Promise<void>}
 */
// sync.js
async function syncPendingTasks() {
    if (!isAuthenticated() || !navigator.onLine) {
        console.warn('syncPendingTasks: not authenticated or offline — skipping');
        return false;
    }

    try {
        const allLocal = await getAllTasks();
        const pending = allLocal.filter(t => t.pending_sync && t.user_id === user?.id);

        if (pending.length === 0) {
            console.log('syncPendingTasks: nothing to sync');
            return true;
        }

        console.log('syncPendingTasks: pending:', pending.map(p => ({ id: p.id, op: p.pending_sync, completed: p.completed })));

        for (const task of pending) {
            try {
                const headers = {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/json'
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
                    user_id: task.user_id
                };

                let res, json;

                if (task.pending_sync === 'create') {
                    // create new on backend
                    res = await fetch(API_BASE_URL, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(payload)
                    });
                    if (!res.ok) throw new Error(`Create failed ${res.status}`);
                    json = await res.json();

                    // If backend returned a canonical id different from local temp id,
                    // remove local temp and insert new record with server id (preserve other fields).
                    const serverId = String(json.id);
                    if (serverId !== String(task.id)) {
                        // delete old local record (temp id), then add new one with server id
                        await deleteTask(task.id);
                        const newLocal = { ...task, id: serverId, pending_sync: null };
                        await addTask(newLocal);
                        console.log(`syncPendingTasks: create mapped local ${task.id} -> server ${serverId}`);
                    } else {
                        await updateTask({ ...task, pending_sync: null });
                        console.log(`syncPendingTasks: created task ${serverId}`);
                    }
                } else if (task.pending_sync === 'update') {
                    // update backend
                    res = await fetch(`${API_BASE_URL}/${task.id}`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify(payload)
                    });
                    if (!res.ok) throw new Error(`Update failed ${res.status}`);
                    await updateTask({ ...task, pending_sync: null });
                    console.log(`syncPendingTasks: updated task ${task.id}`);
                } else if (task.pending_sync === 'delete') {
                    // delete backend
                    res = await fetch(`${API_BASE_URL}/${task.id}`, {
                        method: 'DELETE',
                        headers
                    });
                    if (!res.ok) throw new Error(`Delete failed ${res.status}`);
                    // remove from local DB too
                    await deleteTask(task.id);
                    console.log(`syncPendingTasks: deleted task ${task.id}`);
                }

            } catch (taskErr) {
                console.error(`syncPendingTasks: error for ${task.id}:`, taskErr);
                // don't throw — continue with other tasks, we'll retry later
            }
        }

        // After syncing pending tasks, optionally re-fetch backend to reconcile differences
        // (you may want this; uncomment if desired)
        // const fresh = await fetchBackendTasks();
        // await cacheBackendTasks(fresh);

        return true;
    } catch (err) {
        console.error('syncPendingTasks: top-level error', err);
        return false;
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
                        console.log(`Real-time event: ${eventType} for task ${newData?.id || oldData?.id}`, { newData, oldData });

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

                            console.log(`Real-time task data:`, { id: task.id, completed: task.completed, is_late: task.is_late });

                            const localTasks = await getAllTasks();
                            const existingTask = localTasks.find(t => t.id === task.id);

                            if (existingTask) {
                                await updateTask(task);
                                console.log(`Updated existing task ${task.id} in IndexedDB`);
                            } else {
                                await addTask(task);
                                console.log(`Added new task ${task.id} to IndexedDB`);
                            }
                        } else if (eventType === 'DELETE') {
                            await deleteTask(oldData.id);
                            console.log(`Deleted task ${oldData.id} from IndexedDB`);
                        }

                        // FIXED: Get fresh tasks from IndexedDB and pass them to renderTasks
                        const freshTasks = await getAllTasks();
                        const userTasks = freshTasks.filter(t => t.user_id === user.id);
                        console.log(`Rendering ${userTasks.length} fresh user tasks:`, userTasks.map(t => ({ 
                            id: t.id, 
                            name: t.name, 
                            completed: t.completed, 
                            is_late: t.is_late 
                        })));
                        
                        await renderTasks(userTasks);
                        console.log(`Real-time update complete: ${eventType} for task ${newData?.id || oldData?.id}`);
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