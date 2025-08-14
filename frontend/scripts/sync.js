import { user, access_token, isAuthenticated, supabase } from './authHandler.js';
import { addTask, updateTask, deleteTask, getAllTasks, deleteTasksByUserId, getTaskById } from './db.js';
import { renderTasks } from './app.js';

// If sortTasksByTime is global, fine. If you import it elsewhere, keep that import.
// Here we safely fall back to identity to avoid crashes if it's global.
const safeSort = typeof sortTasksByTime === 'function' ? sortTasksByTime : (arr) => arr;

// Base URL for FastAPI backend (adjust for production)
const API_BASE_URL = 'http://localhost:8000/tasks';

/* ------------------------------ Sync State ------------------------------ */
let SYNC_LOCK = false;                         // Mutex for syncPendingTasks
const inFlightIds = new Set();                 // Task IDs being created/updated/deleted
const tempToServerId = new Map();              // Map temp-id -> server-id

// Helper: Add/remove to inFlightIds with auto-timeout
function markInFlight(id, ms = 8000) {
    if (!id) return;
    inFlightIds.add(String(id));
    setTimeout(() => inFlightIds.delete(String(id)), ms);
}
function clearInFlight(id) {
    if (!id) return;
    inFlightIds.delete(String(id));
}

// Helper: Retry fetch with exponential backoff
async function fetchWithRetry(url, options, maxRetries = 3, baseDelay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetch(url, options);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
        } catch (err) {
            if (attempt === maxRetries) {
                console.error(`fetchWithRetry: failed after ${maxRetries} attempts for ${url}`, err);
                throw err;
            }
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.log(`fetchWithRetry: attempt ${attempt} failed for ${url}, retrying in ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/* -------------------------- Backend Fetch / Cache -------------------------- */
async function fetchBackendTasks() {
    if (!isAuthenticated()) {
        console.warn('Not authenticated, skipping backend task fetch');
        return [];
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
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

/* -------------------------- Cache from Backend -------------------------- */
async function cacheBackendTasks(backendTasks) {
    try {
        if (!Array.isArray(backendTasks)) {
            console.warn('cacheBackendTasks: backendTasks not an array');
            return false;
        }

        const localTasks = await getAllTasks();
        const localMap = new Map(localTasks.map(t => [String(t.id), t]));
        const backendIdSet = new Set();

        console.log('cacheBackendTasks: merging', backendTasks.length, 'tasks');

        for (const bt of backendTasks) {
            const id = String(bt.id);
            backendIdSet.add(id);

            const existing = localMap.get(id);

            // If we have a local "pending delete", do NOT merge backend copy.
            if (existing?.pending_sync === 'delete') {
                console.log(`cacheBackendTasks: skip merge for ${id} (pending local delete)`);
                continue;
            }

            // Merge strategy:
            // - Use backend values for canonical fields.
            // - If local has pending 'create' or 'update', preserve local completed/is_late.
            const preserveLocalFlags =
                existing?.pending_sync === 'create' || existing?.pending_sync === 'update';

            const merged = {
                id,
                user_id: bt.user_id ?? existing?.user_id ?? user?.id ?? null,
                name: bt.name,
                start_time: bt.start_time,
                end_time: bt.end_time,
                category: bt.category,
                priority: bt.priority,
                completed: preserveLocalFlags
                    ? (existing?.completed ?? false)
                    : (typeof bt.completed !== 'undefined'
                        ? bt.completed
                        : (existing?.completed ?? false)),
                is_late: preserveLocalFlags
                    ? (existing?.is_late ?? false)
                    : (typeof bt.is_late !== 'undefined'
                        ? bt.is_late
                        : (existing?.is_late ?? false)),
                created_at: bt.created_at ?? existing?.created_at ?? new Date().toISOString().split('T')[0],
                // Keep any local pending_sync intact so we don't lose unsynced intent.
                pending_sync: existing?.pending_sync ?? null
            };

            if (existing) {
                await updateTask(merged);
            } else {
                await addTask(merged);
            }
        }

        // Cleanup: delete local user tasks that aren't on backend AND have no pending sync.
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

/* ------------------------------ Sync Outbox ------------------------------ */
async function syncPendingTasks() {
    if (!isAuthenticated() || !navigator.onLine) {
        console.warn('syncPendingTasks: not authenticated or offline — skipping');
        return false;
    }
    if (SYNC_LOCK) {
        console.log('syncPendingTasks: already running, skipping');
        return false;
    }

    SYNC_LOCK = true;
    tempToServerId.clear();

    try {
        const allLocal = await getAllTasks(true); // Get ALL tasks including pending deletes for sync
        const pending = allLocal.filter(t => t.pending_sync && t.user_id === user?.id);

        if (pending.length === 0) {
            console.log('syncPendingTasks: nothing to sync');
            SYNC_LOCK = false;
            return true;
        }

        // Deduplicate pending tasks by name, start_time, user_id
        const uniquePending = [];
        const seenKeys = new Set();
        for (const task of pending) {
            const key = `${task.name}|${task.start_time}|${task.user_id}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                uniquePending.push(task);
            } else {
                console.log(`syncPendingTasks: removing duplicate task ${task.id}`);
                await deleteTask(task.id);
            }
        }

        // Phase order: creates → updates → deletes (deletes last, in a logical batch)
        const creates = [];
        const updates = [];
        const deletes = [];

        for (const t of uniquePending) {
            if (t.pending_sync === 'create') creates.push(t);
            else if (t.pending_sync === 'update') updates.push(t);
            else if (t.pending_sync === 'delete') deletes.push(t);
        }

        const baseHeaders = {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json'
        };

        // ---------- Creates ----------
        for (const task of creates) {
            const localId = String(task.id);
            try {
                if (inFlightIds.has(localId)) {
                    console.log(`syncPendingTasks(create): skip in-flight ${localId}`);
                    continue;
                }
                markInFlight(localId);

                const headers = {
                    ...baseHeaders,
                    'Idempotency-Key': `${localId}:${task.created_at || ''}`
                };

                const payload = {
                    name: task.name,
                    start_time: task.start_time,
                    end_time: task.end_time,
                    category: task.category,
                    priority: task.priority,
                    completed: !!task.completed,
                    is_late: !!task.is_late,
                    created_at: task.created_at,
                    user_id: task.user_id
                };

                const res = await fetchWithRetry(API_BASE_URL, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                });
                const json = await res.json();

                const serverId = String(json.id);
                if (serverId !== localId) {
                    await deleteTask(localId);
                    const newLocal = { ...task, id: serverId, pending_sync: null };
                    await addTask(newLocal);
                    tempToServerId.set(localId, serverId);
                    console.log(`syncPendingTasks: create mapped local ${localId} -> server ${serverId}`);
                    markInFlight(serverId);
                } else {
                    await updateTask({ ...task, pending_sync: null });
                    console.log(`syncPendingTasks: created task ${serverId}`);
                }
            } catch (err) {
                console.error(`syncPendingTasks(create): error for ${localId}`, err);
            } finally {
                clearInFlight(localId);
            }
        }

        // ---------- Updates ----------
        for (const task of updates) {
            const localId = String(task.id);
            try {
                if (inFlightIds.has(localId)) {
                    console.log(`syncPendingTasks(update): skip in-flight ${localId}`);
                    continue;
                }
                markInFlight(localId);

                const headers = {
                    ...baseHeaders,
                    'Idempotency-Key': `${localId}:${task.created_at || ''}`
                };

                const effectiveId = tempToServerId.get(localId) || localId;
                const payload = {
                    name: task.name,
                    start_time: task.start_time,
                    end_time: task.end_time,
                    category: task.category,
                    priority: task.priority,
                    completed: !!task.completed,
                    is_late: !!task.is_late,
                    created_at: task.created_at,
                    user_id: task.user_id
                };

                const res = await fetchWithRetry(`${API_BASE_URL}/${effectiveId}`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(payload)
                });
                await updateTask({ ...task, id: effectiveId, pending_sync: null });
                console.log(`syncPendingTasks: updated task ${effectiveId}`);
                markInFlight(effectiveId);
            } catch (err) {
                console.error(`syncPendingTasks(update): error for ${localId}`, err);
            } finally {
                clearInFlight(localId);
            }
        }

        // ---------- Deletes (logical batch) ----------
        if (deletes.length) {
            console.log(`syncPendingTasks: deleting ${deletes.length} tasks in batch`);
        }
        const locallyDeleteAfterServer = [];
        for (const task of deletes) {
            const localId = String(task.id);
            try {
                if (inFlightIds.has(localId)) {
                    console.log(`syncPendingTasks(delete): skip in-flight ${localId}`);
                    continue;
                }
                markInFlight(localId);

                const headers = {
                    ...baseHeaders,
                    'Idempotency-Key': `${localId}:${task.created_at || ''}`
                };

                const effectiveId = tempToServerId.get(localId) || localId;
                const res = await fetchWithRetry(`${API_BASE_URL}/${effectiveId}`, {
                    method: 'DELETE',
                    headers
                });
                locallyDeleteAfterServer.push(effectiveId);
                console.log(`syncPendingTasks: server delete ok for ${effectiveId}`);
                markInFlight(effectiveId);
            } catch (err) {
                console.error(`syncPendingTasks(delete): error for ${localId}`, err);
            } finally {
                clearInFlight(localId);
            }
        }

        // Now remove all server-deleted tasks from IndexedDB in one pass.
        for (const id of locallyDeleteAfterServer) {
            try {
                await deleteTask(id);
                console.log(`syncPendingTasks: local delete ok for ${id}`);
            } catch (err) {
                console.error(`syncPendingTasks: local delete failed for ${id}`, err);
            }
        }

        SYNC_LOCK = false;
        return true;
    } catch (err) {
        console.error('syncPendingTasks: top-level error', err);
        SYNC_LOCK = false;
        return false;
    }
}

/* -------------------------- Supabase Realtime -------------------------- */
function setupRealtimeSubscriptions() {
    if (!isAuthenticated() || !navigator.onLine) {
        console.warn('Not authenticated or offline, skipping real-time subscriptions');
        return;
    }

    try {
        let subscription = null;
        if (subscription) {
            subscription.unsubscribe();
        }

        subscription = supabase
            .channel('tasks')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'tasks',
                    filter: `user_id=eq.${user.id}`,
                },
                async (payload) => {
                    try {
                        const { eventType, new: newData, old: oldData } = payload;
                        const effectedId = String(newData?.id || oldData?.id);

                        if (inFlightIds.has(effectedId)) {
                            console.log(`Realtime: ignoring echo for in-flight ${effectedId} (${eventType})`);
                            clearInFlight(effectedId);
                            return;
                        }

                        console.log(`Real-time event: ${eventType} for task ${effectedId}`, { newData, oldData });

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
                            let existingTask = localTasks.find((t) => String(t.id) === String(task.id));

                            // Content-based deduplication
                            if (!existingTask) {
                                existingTask = localTasks.find(t =>
                                    t.name === task.name &&
                                    t.start_time === task.start_time &&
                                    t.user_id === task.user_id
                                );
                            }

                            if (existingTask) {
                                await updateTask({ ...task, pending_sync: existingTask.pending_sync });
                                console.log(`Updated existing task ${task.id} in IndexedDB`);
                                if (existingTask.id !== task.id) {
                                    await deleteTask(existingTask.id);
                                    tempToServerId.set(String(existingTask.id), String(task.id));
                                    console.log(`Deleted temp task ${existingTask.id} for server ${task.id}`);
                                }
                            } else {
                                await addTask(task);
                                console.log(`Added new task ${task.id} to IndexedDB`);
                            }
                        } else if (eventType === 'DELETE') {
                            await deleteTask(oldData.id);
                            console.log(`Deleted task ${oldData.id} from IndexedDB`);
                        }

                        const freshTasks = await getAllTasks();
                        const userTasks = freshTasks.filter((t) => t.user_id === user.id);
                        const sortedTasks = safeSort(userTasks);

                        console.log(`Rendering ${sortedTasks.length} sorted user tasks:`, sortedTasks.map(t => ({
                            id: t.id,
                            name: t.name,
                            completed: t.completed,
                            is_late: t.is_late,
                        })));

                        await renderTasks(sortedTasks);
                        console.log(`Real-time update complete: ${eventType} for task ${effectedId}`);
                    } catch (error) {
                        console.error('Real-time update failed:', error.message);
                    }
                }
            )
            .subscribe();

        console.log('Real-time subscriptions set up for user', user.id);

        window.addEventListener('unload', () => {
            try { subscription.unsubscribe(); } catch {}
        });
    } catch (error) {
        console.error('Failed to set up real-time subscriptions:', error.message);
    }
}

/* ------------------------------ Retry on Online ------------------------------ */
function retrySyncTasks() {
    window.addEventListener('online', async () => {
        console.log('Network online, retrying sync...');
        try {
            // Push local changes first to ensure deletes are processed before fetching
            await syncPendingTasks();
            // Then fetch and merge backend tasks
            const tasks = await fetchBackendTasks();
            await cacheBackendTasks(tasks);
            console.log('Retry sync completed');
        } catch (error) {
            console.error('Retry sync failed:', error.message);
        }
    });
}

export { fetchBackendTasks, cacheBackendTasks, syncPendingTasks, setupRealtimeSubscriptions, retrySyncTasks };