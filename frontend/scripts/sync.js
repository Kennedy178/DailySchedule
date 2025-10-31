import { user, access_token, isAuthenticated, supabase } from './authHandler.js';
import { addTask, updateTask, deleteTask, getAllTasks, deleteTasksByUserId, getTaskById } from './db.js';
import { renderTasks } from './app.js';

// Disable console logs in production
if (location.hostname !== "localhost") {
    console.log = function () {};
    console.debug = function () {};
    console.info = function () {};
    console.warn = function () {};
    //Only console.error for actual error reporting
}

// Base URL for FastAPI backend (Will adjust for production)
const API_BASE_URL = window.API_BASE_URL; // Uses config.js

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
        return null; // Changed from [] to null for network failure indication
    }

    let retries = 0;
    const maxRetries = 3;
    const retryDelay = 1000;

    while (retries <= maxRetries) {
        try {
            if (!access_token) {
                console.log(`fetchBackendTasks: No access token available (attempt ${retries + 1})`);
                if (retries < maxRetries) {
                    retries++;
                    await new Promise(resolve => setTimeout(resolve, retryDelay * retries));
                    continue;
                }
                return null; // Network/auth failure
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 7000);
            
            const response = await fetch(`${API_BASE_URL}/tasks`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 401 && retries < maxRetries) {
                    console.log(`fetchBackendTasks: Got 401, auth not ready yet (attempt ${retries + 1}). Retrying...`);
                    retries++;
                    await new Promise(resolve => setTimeout(resolve, retryDelay * retries));
                    continue;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const tasks = await response.json();
            console.log(`Fetched ${tasks.length} tasks for user ${user.id}`);
            return tasks; // Return actual tasks array (could be empty [])

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log(`fetchBackendTasks: Request timed out (attempt ${retries + 1})`);
            } else if (error.message.includes('401') && retries < maxRetries) {
                console.log(`fetchBackendTasks: Auth error, retrying (attempt ${retries + 1})`);
            } else if (retries >= maxRetries) {
                console.error('fetchBackendTasks: Max retries reached, network failure');
                return null; // Network failure after all retries
            } else {
                console.log(`fetchBackendTasks: Error occurred (attempt ${retries + 1}):`, error.message);
            }

            if (retries < maxRetries) {
                retries++;
                await new Promise(resolve => setTimeout(resolve, retryDelay * retries));
            } else {
                console.error('Fetch tasks failed after all retries:', error.message);
                return null; // Network failure
            }
        }
    }

    return null; // Network failure fallback
}
/* -------------------------- Cache from Backend -------------------------- */

async function cacheBackendTasks(backendTasks) {
    try {
        if (!Array.isArray(backendTasks)) {
            console.warn('cacheBackendTasks: backendTasks not an array');
            return false;
        }

        console.log(`cacheBackendTasks: Starting merge of ${backendTasks.length} tasks from backend`);

        // Get current local tasks
        const localTasks = await getAllTasks(true); // Include pending deletes
        const localMap = new Map(localTasks.map(t => [String(t.id), t]));
        const backendIdSet = new Set(backendTasks.map(t => String(t.id)));

        // Step 1: Add/Update tasks from backend
        for (const bt of backendTasks) {
            const id = String(bt.id);
            const existing = localMap.get(id);

            // Skip if we have a pending delete locally (we're waiting to delete from server)
            if (existing?.pending_sync === 'delete') {
                console.log(`cacheBackendTasks: Skipping ${id} - has pending local delete`);
                continue;
            }

            // Skip if we have a pending create/update (preserve local changes)
            if (existing?.pending_sync === 'create' || existing?.pending_sync === 'update') {
                console.log(`cacheBackendTasks: Skipping ${id} - has pending local changes`);
                continue;
            }

            // Merge task data
            const merged = {
                id,
                user_id: bt.user_id ?? existing?.user_id ?? user?.id ?? null,
                name: bt.name,
                start_time: bt.start_time,
                end_time: bt.end_time,
                category: bt.category,
                priority: bt.priority,
                completed: bt.completed ?? false,
                is_late: bt.is_late ?? false,
                created_at: bt.created_at ?? existing?.created_at ?? new Date().toISOString().split('T')[0],
                pending_sync: null // Clear sync flag since this is from server
            };

            if (existing) {
                await updateTask(merged);
                console.log(`cacheBackendTasks: Updated task ${id}`);
            } else {
                await addTask(merged);
                console.log(`cacheBackendTasks: Added new task ${id}`);
            }
        }

        // Step 2: Delete local tasks that don't exist on backend anymore
        // BUT ONLY if they have no pending sync operations
        const localUserTasks = localTasks.filter(t => t.user_id === user?.id);
        let deletedCount = 0;

        for (const lt of localUserTasks) {
            const localId = String(lt.id);
            
            // Keep tasks with pending operations
            if (lt.pending_sync) {
                console.log(`cacheBackendTasks: Keeping ${localId} - has pending operation: ${lt.pending_sync}`);
                continue;
            }

            // Delete if not in backend anymore
            if (!backendIdSet.has(localId)) {
                await deleteTask(localId);
                deletedCount++;
                console.log(`cacheBackendTasks: Deleted stale local task ${localId} (${lt.name})`);
            }
        }

        console.log(`cacheBackendTasks: Merge complete - Added/Updated ${backendTasks.length} tasks, Deleted ${deletedCount} stale tasks`);
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

                const res = await fetchWithRetry(`${API_BASE_URL}/tasks`, {
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

        // Try UPDATE first
        try {
            const res = await fetchWithRetry(`${API_BASE_URL}/tasks/${effectiveId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(payload)
            });
            await updateTask({ ...task, id: effectiveId, pending_sync: null });
            console.log(`syncPendingTasks: updated task ${effectiveId}`);
            markInFlight(effectiveId);
        } catch (updateError) {
            // If update fails with 400/404, task probably doesn't exist - try CREATE
            if (updateError.message.includes('400') || updateError.message.includes('404')) {
                console.log(`syncPendingTasks: Update failed (task doesn't exist on server), creating instead for ${localId}`);
                
                try {
                    const createRes = await fetchWithRetry(`${API_BASE_URL}/tasks`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(payload)
                    });
                    const json = await createRes.json();
                    const serverId = String(json.id);
                    
                    // Replace local with server version
                    if (serverId !== localId) {
                        await deleteTask(localId);
                        await addTask({ ...task, id: serverId, pending_sync: null });
                        tempToServerId.set(localId, serverId);
                        console.log(`syncPendingTasks: Created as new task - mapped ${localId} -> ${serverId}`);
                    } else {
                        await updateTask({ ...task, pending_sync: null });
                        console.log(`syncPendingTasks: Created task ${serverId}`);
                    }
                    markInFlight(serverId);
                } catch (createError) {
                    console.error(`syncPendingTasks: Both update and create failed for ${localId}`, createError);
                    throw createError;
                }
            } else {
                // Some other error - rethrow
                throw updateError;
            }
        }
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
                const res = await fetchWithRetry(`${API_BASE_URL}/tasks/${effectiveId}`, {
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
let currentSubscription = null; // Store subscription globally for cleanup

function setupRealtimeSubscriptions() {
    if (!isAuthenticated() || !navigator.onLine) {
        console.warn('Not authenticated or offline, skipping real-time subscriptions');
        return;
    }

    try {
        // Clean up any existing subscription first
        if (currentSubscription) {
            currentSubscription.unsubscribe();
            currentSubscription = null;
            console.log('Cleaned up previous subscription');
        }

        currentSubscription = supabase
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
                        // Tasks are already sorted from getAllTasks()

                        console.log(`Rendering ${userTasks.length} sorted user tasks:`, userTasks.map(t => ({
                            id: t.id,
                            name: t.name,
                            completed: t.completed,
                            is_late: t.is_late,
                        })));

                        await renderTasks(userTasks);
                        console.log(`Real-time update complete: ${eventType} for task ${effectedId}`);
                    } catch (error) {
                        console.error('Real-time update failed:', error.message);
                    }
                }
            )
            .subscribe();

        console.log('Real-time subscriptions set up for user', user.id);

        // Modern cleanup using visibilitychange
        setupSubscriptionCleanup();

    } catch (error) {
        console.error('Failed to set up real-time subscriptions:', error.message);
    }
}

// Separate function for managing subscription lifecycle
function setupSubscriptionCleanup() {
    // Remove any existing listeners to avoid duplicates
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    
    // Add the new listener
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
        // Clean up subscription when app is hidden
        if (currentSubscription) {
            try {
                currentSubscription.unsubscribe();
                currentSubscription = null;
                console.log('Subscription cleaned up - app hidden');
            } catch (error) {
                console.error('Error cleaning up subscription:', error);
            }
        }
    } else if (document.visibilityState === 'visible' && isAuthenticated() && navigator.onLine) {
        // Reestablish subscription when app becomes visible again
        if (!currentSubscription) {
            console.log('App visible again - reestablishing subscription');
            setupRealtimeSubscriptions();
        }
    }
}

// Optional: Function to manually cleanup subscription (useful for logout)
function cleanupRealtimeSubscriptions() {
    if (currentSubscription) {
        try {
            currentSubscription.unsubscribe();
            currentSubscription = null;
            console.log('Manual subscription cleanup completed');
        } catch (error) {
            console.error('Error during manual cleanup:', error);
        }
    }
    
    // Remove the visibility listener
    document.removeEventListener('visibilitychange', handleVisibilityChange);
}



// In sync.js - add a simple cache to avoid redundant calls
let profileUpdateCache = new Set();

async function updateUserProfileFlag(hasCreatedTasks = true) {
    if (!isAuthenticated()) return;
    
    const cacheKey = `${user.id}-${hasCreatedTasks}`;
    if (profileUpdateCache.has(cacheKey)) {
        console.log('Profile update already in progress or completed');
        return;
    }
    
    profileUpdateCache.add(cacheKey);
    
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ has_created_tasks: hasCreatedTasks })
            .eq('id', user.id);
                     
        if (error) throw error;
        console.log('Updated profile has_created_tasks flag');
    } catch (error) {
        console.error('Failed to update profile flag:', error);
        profileUpdateCache.delete(cacheKey); // Remove from cache on error
    }
}
async function checkUserHasCreatedTasks() {
    if (!isAuthenticated()) return false;
    
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('has_created_tasks')
            .eq('id', user.id)
            .single();
            
        if (error) throw error;
        return data?.has_created_tasks || false;
    } catch (error) {
        console.error('Failed to check profile flag:', error);
        return false; // Assume false on error
    }
}

/* ------------------------------ Retry on Online ------------------------------ */
/* ------------------------------ Retry on Online ------------------------------ */
function retrySyncTasks() {
    // DISABLED: This was causing conflicts with authHandler.js online handler
    // The online sync is now handled exclusively in authHandler.js
    console.log('retrySyncTasks: Function disabled - sync handled by authHandler.js');
    
    /*
    window.addEventListener('online', async () => {
        console.log('Network online, retrying sync...');
        try {
            await syncPendingTasks();
            const tasks = await fetchBackendTasks();
            await cacheBackendTasks(tasks);
            console.log('Retry sync completed');
        } catch (error) {
            console.error('Retry sync failed:', error.message);
        }
    });
    */
}

export { fetchBackendTasks, cacheBackendTasks, syncPendingTasks, setupRealtimeSubscriptions, retrySyncTasks, cleanupRealtimeSubscriptions,updateUserProfileFlag, checkUserHasCreatedTasks };