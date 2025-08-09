/* Import db.js CRUD functions */
import { addTask, getAllTasks, getTaskById, updateTask, deleteTask, setSetting, getSetting,  } from './db.js';
import { isAuthenticated, initAuth, user } from './authHandler.js';
import { setupRealtimeSubscriptions,  fetchBackendTasks, cacheBackendTasks } from './sync.js';

/* Initialize global variables */
let today = new Date().toDateString();
let hoveredLabel = null;
let lastCheckDate = null;
let userName = 'you';
let enableReminders = true;
let taskCounter = 0;
let tasks = [];
let hasCustomTasks = false;
let lateTaskIndex = null;
let isCelebrating = false;
let lastRenderHash = '';
let deferredPrompt = null;
let confettiAnimation;
let statsChart = null;
let lastProgressUpdate = 0;

let spinnerInstance = null;



const notifiedTasks = new Set(); // Track notified task IDs
const canvas = document.getElementById('confettiCanvas');
const ctx = canvas.getContext('2d');
const scheduleContainer = document.getElementById('scheduleContainer');
const showFormBtn = document.getElementById('showFormBtn');
const resetDefaultBtn = document.getElementById('resetDefaultBtn');
const showReportBtn = document.getElementById('showReportBtn');
const showSettingsBtn = document.getElementById('showSettingsBtn');
const taskForm = document.getElementById('taskForm');
const addTaskBtn = document.getElementById('addTaskBtn');
const clearFormBtn = document.getElementById('clearFormBtn');
const cancelFormBtn = document.getElementById('cancelFormBtn');
const editTaskModal = document.getElementById('edit-task-modal');
const saveEditBtn = document.getElementById('saveEditBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const lateTaskModal = document.getElementById('lateTaskModal');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalError = document.getElementById('modalError');
const lateReasonInput = document.getElementById('lateReason');
const settingsModal = document.getElementById('settingsModal');
const enableRemindersInput = document.getElementById('enableReminders');
const userNameInput = document.getElementById('userName');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const permissionError = document.getElementById('permissionError');
const statsPanel = document.getElementById('statsPanel');
const chartError = document.getElementById('chartError');
const installPrompt = document.getElementById('installPrompt');
const installBtn = document.getElementById('installBtn');
const dismissInstallBtn = document.getElementById('dismissInstallBtn');
const closeInstallPrompt = document.getElementById('closeInstallPrompt');
const congratsText = document.getElementById('congratsMessage');
const customTaskBanner = document.getElementById('customTaskBanner');
const dismissBannerBtn = document.getElementById('dismissBannerBtn');
const errorToast = document.createElement('div');
errorToast.id = 'errorToast';
errorToast.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(20, 20, 20, 0.9);
    color: #E5E5E5; padding: 10px 20px; border-radius: 8px; z-index: 6000; display: none;
    font-family: 'Inter', sans-serif; font-size: clamp(12px, 3vw, 14px); box-shadow: 0 4px 12px rgba(255, 177, 0, 0.25);
`;
document.body.appendChild(errorToast);

/* Default tasks */
const defaultTasks = [
    { start_time: '06:00', end_time: '06:30', name: 'Morning Nature Walk/Virtual 🌳', category: 'Health', priority: 'Medium', id: 'task1', completed: false, is_late: false, user_id: null, created_at: new Date().toISOString().split('T')[0], pending_sync: null },
    { start_time: '06:30', end_time: '07:15', name: 'Workout + Shower 🏋️‍♂️🚿', category: 'Fitness', priority: 'Medium', id: 'task2', completed: false, is_late: false, user_id: null, created_at: new Date().toISOString().split('T')[0], pending_sync: null },
    { start_time: '07:15', end_time: '07:45', name: 'Cooking Breakfast & Quick Chat Break 🍳 💬', category: 'Routine', priority: 'Medium', id: 'task3', completed: false, is_late: false, user_id: null, created_at: new Date().toISOString().split('T')[0], pending_sync: null },
    { start_time: '07:45', end_time: '09:00', name: 'Data Science/ML Study 📖', category: 'Learning', priority: 'High', id: 'task4', completed: false, is_late: false, user_id: null, created_at: new Date().toISOString().split('T')[0], pending_sync: null },
    { start_time: '09:00', end_time: '10:30', name: 'Focused Project Work 💻', category: 'Project', priority: 'High', id: 'task5', completed: false, is_late: false, user_id: null, created_at: new Date().toISOString().split('T')[0], pending_sync: null },
    { start_time: '10:30', end_time: '12:30', name: 'Data Science/ML Study 📖', category: 'Learning', priority: 'High', id: 'task7', completed: false, is_late: false, user_id: null, created_at: new Date().toISOString().split('T')[0], pending_sync: null },
    { start_time: '12:30', end_time: '13:30', name: 'Lunch Cooking & Eating 🍲', category: 'Routine', priority: 'Medium', id: 'task8', completed: false, is_late: false, user_id: null, created_at: new Date().toISOString().split('T')[0], pending_sync: null },
    { start_time: '13:30', end_time: '14:30', name: 'Financial Education 📈', category: 'Finance', priority: 'High', id: 'task9', completed: false, is_late: false, user_id: null, created_at: new Date().toISOString().split('T')[0], pending_sync: null },
    { start_time: '14:30', end_time: '15:00', name: 'Chat Break 💬', category: 'Social', priority: 'Low', id: 'task10', completed: false, is_late: false, user_id: null, created_at: new Date().toISOString().split('T')[0], pending_sync: null },
    { start_time: '15:00', end_time: '16:30', name: 'Professional Networking (LinkedIn/X/Medium/Github) + Article Writing 🌐', category: 'Professional', priority: 'High', id: 'task11', completed: false, is_late: false, user_id: null, created_at: new Date().toISOString().split('T')[0], pending_sync: null },
    { start_time: '16:30', end_time: '17:00', name: 'Data Science/ML Study 💻', category: 'Project', priority: 'High', id: 'task12', completed: false, is_late: false, user_id: null, created_at: new Date().toISOString().split('T')[0], pending_sync: null },
    { start_time: '17:00', end_time: '19:00', name: 'Movie/Walk/Sports Break 🎬🏀 while making dinner', category: 'Leisure', priority: 'Low', id: 'task13', completed: false, is_late: false, user_id: null, created_at: new Date().toISOString().split('T')[0], pending_sync: null },
    { start_time: '19:00', end_time: '19:30', name: 'Evening Workout + Shower 🏋️‍♂️🚿', category: 'Routine', priority: 'Medium', id: 'task14', completed: false, is_late: false, user_id: null, created_at: new Date().toISOString().split('T')[0], pending_sync: null },
    { start_time: '19:30', end_time: '20:15', name: 'Eat Dinner + Social Media Check-in 📰 + Chat Break 💬', category: 'Routine', priority: 'Medium', id: 'task15', completed: false, is_late: false, user_id: null, created_at: new Date().toISOString().split('T')[0], pending_sync: null },
    { start_time: '20:15', end_time: '22:30', name: 'Project Work 💻', category: 'Project', priority: 'High', id: 'task16', completed: false, is_late: false, user_id: null, created_at: new Date().toISOString().split('T')[0], pending_sync: null },
    { start_time: '22:30', end_time: '23:00', name: 'Reflection & Goal Setting for Tomorrow 🔮', category: 'Personal Growth', priority: 'High', id: 'task17', completed: false, is_late: false, user_id: null, created_at: new Date().toISOString().split('T')[0], pending_sync: null },
    { start_time: '23:30', end_time: '05:30', name: 'Sleep 🌙', category: 'Health', priority: 'High', id: 'task18', completed: false, is_late: false, user_id: null, created_at: new Date().toISOString().split('T')[0], pending_sync: null }
];

/* Show toast notification */
export function showToast(message) {
    errorToast.textContent = message;
    errorToast.style.display = 'block';
    setTimeout(() => errorToast.style.display = 'none', 5000);
}







export function createSpinner() {
    if (spinnerInstance) return spinnerInstance;
    
    const spinner = document.createElement('div');
    spinner.id = 'loadingSpinner';
    spinner.innerHTML = `
        <div class="spinner"></div>
        <p>Processing...</p>
    `;
    spinner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.7);
        display: none;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        z-index: 10000;
        color: white;
    `;
    document.body.appendChild(spinner);
    spinnerInstance = spinner;
    return spinner;
}

export function initGlobalUtils() {
    createSpinner();
    // Initialize toast element
    errorToast.id = 'errorToast';
    document.body.appendChild(errorToast);
}

export function showLoading(show) {
    const spinner = document.getElementById('loadingSpinner') || createSpinner();
    spinner.style.display = show ? 'flex' : 'none';
}






/* Debounce function to limit notification checks */
function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

/* Load tasks and settings from IndexedDB */
export async function loadTasks() {
    today = new Date().toDateString();
    lastRenderHash = ''; // Reset to force initial render
    try {
        hasCustomTasks = (await getSetting('hasCustomTasks')) === 'true';
        taskCounter = parseInt(await getSetting('taskCounter') || '0');
        userName = (await getSetting('userName')) || 'you';
        enableReminders = (await getSetting('enableReminders')) === 'true';
        lastCheckDate = (await getSetting('lastCheckDate')) || today;
        const firstCustomTaskAdded = (await getSetting('firstCustomTaskAdded')) === 'true';

        tasks = await getAllTasks();
        tasks = sortTasksByTime(tasks); // Sort tasks immediately after fetch
        console.log('Loaded and sorted tasks:', tasks.map(t => ({ id: t.id, name: t.name, start_time: t.start_time, is_late: t.is_late, completed: t.completed })));

        // Update user_id for logged-in users
        if (user) {
            for (let task of tasks) {
                if (task.user_id === null || task.user_id === undefined) {
                    task.user_id = user.id;
                    task.pending_sync = task.pending_sync || 'create';
                    await updateTask(task);
                    console.log(`Updated task ${task.id} with user_id: ${user.id}`);
                }
            }
        }

        if (tasks.length === 0 && !hasCustomTasks) {
            // Initialize default tasks with user_id if logged in
            for (const task of defaultTasks) {
                try {
                    const taskToAdd = { ...task, user_id: user ? user.id : null, pending_sync: user ? 'create' : null };
                    await addTask(taskToAdd);
                } catch (error) {
                    if (error.name === 'ConstraintError') {
                        console.log(`Task ${task.id} already exists, skipping`);
                        continue;
                    }
                    throw error;
                }
            }
            tasks = sortTasksByTime(await getAllTasks()); // Re-fetch and sort default tasks
            console.log('Initialized default tasks:', tasks.map(t => ({ id: t.id, name: t.name, start_time: t.start_time })));
            await setSetting('hasCustomTasks', 'false');
        }

        // Show banner if custom tasks exist but banner hasn't been shown
        if (hasCustomTasks && !firstCustomTaskAdded && customTaskBanner) {
            customTaskBanner.classList.remove('hidden');
            customTaskBanner.classList.add('active');
        }

        enableRemindersInput.checked = enableReminders;
        userNameInput.value = userName;
        permissionError.style.display = (await getSetting('notificationPermission')) === 'denied' ? 'block' : 'none';
        await syncTasksWithServiceWorker(); // Sync tasks on load
        renderTasks();
    } catch (error) {
        console.error('Error loading tasks:', error);
        // Recover by loading existing tasks
        tasks = await getAllTasks();
        tasks = sortTasksByTime(tasks); // Ensure sorting on recovery
        if (tasks.length > 0) {
            console.log('Recovered by loading existing tasks:', tasks.map(t => ({ id: t.id, name: t.name, start_time: t.start_time })));
            renderTasks();
        } else {
            showToast('Failed to load tasks. Please reset to default.');
        }
    }
}
/* Save daily data to IndexedDB */
async function saveDailyData() {
    today = new Date().toDateString();
    try {
        const dateKey = `tasks_${today}`;
        await setSetting(dateKey, JSON.stringify(tasks));
        const completed = tasks.filter(task => task.completed).length;
        const total = tasks.length;
        const timelyCompleted = tasks.filter(task => task.completed && !task.is_late).length;
        const lateCompleted = tasks.filter(task => task.completed && task.is_late).length;
        const percentage = total ? Math.round((completed / total) * 100) : 0;
        await setSetting(`completion_${today}`, percentage.toString());
        await setSetting(`timely_${today}`, timelyCompleted.toString());
        await setSetting(`late_${today}`, lateCompleted.toString());
        console.log(`Saved daily data: completed=${completed}, total=${total}, percentage=${percentage}`);
        await cleanOldData();
    } catch (error) {
        console.error('Error saving daily data:', error);
        showToast('Failed to save daily data. Clear some tasks or reset to default.');
    }
}

/* Clean old data (7-30 days) from settings store */
async function cleanOldData() {
    const now = new Date();
    for (let i = 7; i <= 30; i++) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        const dateKey = `tasks_${date.toDateString()}`;
        const completionKey = `completion_${date.toDateString()}`;
        const timelyKey = `timely_${date.toDateString()}`;
        const lateKey = `late_${date.toDateString()}`;
        const db = await idb.openDB('getitdone', 1);
        const tx = db.transaction('settings', 'readwrite');
        const store = tx.objectStore('settings');
        await store.delete(dateKey);
        await store.delete(completionKey);
        await store.delete(timelyKey);
        await store.delete(lateKey);
        await tx.complete;
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

/* Check if task is expired (with 15-minute grace period) */
function isTaskExpired(task, now) {
    const [hours, minutes] = task.end_time.split(':').map(Number);
    const endDate = new Date(now);
    endDate.setHours(hours, minutes, 0, 0);
    const gracePeriod = 15 * 60 * 1000;
    return now > new Date(endDate.getTime() + gracePeriod);
}

/* Validate time range */
function isValidTimeRange(startTime, endTime) {
    if (!startTime || !endTime) return false;
    const start = new Date(`1970-01-01T${startTime}:00`);
    const end = new Date(`1970-01-01T${endTime}:00`);
    return start < end;
}

/* Check if task is starting soon (9.5–10 minutes before start) */
function isTaskStartingSoon(task, now) {
    const [hours, minutes] = task.start_time.split(':').map(Number);
    const startDate = new Date(now);
    startDate.setHours(hours, minutes, 0, 0);
    const timeDiff = startDate.getTime() - now.getTime();
    const startingSoon = timeDiff >= 0 && timeDiff <= 10 * 60 * 1000 && timeDiff >= 9.5 * 60 * 1000;
    console.log(`Checking notification for task "${task.name}": timeDiff=${timeDiff}ms, startingSoon=${startingSoon}`);
    return startingSoon;
}

/* Sync tasks with service worker */
async function syncTasksWithServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.warn('Service worker not supported by browser');
        return;
    }
    try {
        const registration = await navigator.serviceWorker.getRegistration('sw.js');
        if (registration && registration.active) {
            const syncTasks = tasks.filter(task => !task.completed && !isTaskExpired(task, new Date())).map(task => ({
                id: task.id,
                startTime: task.start_time,
                name: task.name,
                priority: task.priority
            }));
            console.log('Syncing tasks with service worker:', syncTasks.map(t => t.name));
            registration.active.postMessage({
                type: 'SYNC_TASKS',
                tasks: syncTasks,
                userName,
                enableReminders
            });
        } else {
            console.warn('No active service worker, registering sw.js');
            const newRegistration = await navigator.serviceWorker.register('sw.js');
            console.log('Service worker registered:', newRegistration);
            if (newRegistration.active) {
                const syncTasks = tasks.filter(task => !task.completed && !isTaskExpired(task, new Date())).map(task => ({
                    id: task.id,
                    startTime: task.start_time,
                    name: task.name,
                    priority: task.priority
                }));
                console.log('Syncing tasks with new service worker:', syncTasks.map(t => t.name));
                newRegistration.active.postMessage({
                    type: 'SYNC_TASKS',
                    tasks: syncTasks,
                    userName,
                    enableReminders
                });
            }
        }
    } catch (err) {
        console.error('Error syncing with service worker:', err);
        showToast('Failed to sync tasks with service worker. Notifications may not work.');
    }
}

/* Service worker registration */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('sw.js');
            console.log('Service Worker registered:', registration);
            if (registration.active) {
                console.log('Service worker active, syncing tasks');
                await syncTasksWithServiceWorker();
            }
            if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
                Notification.requestPermission().then(async permission => {
                    await setSetting('notificationPermission', permission);
                    console.log('Initial notification permission:', permission);
                    if (permission === 'denied') {
                        permissionError.style.display = 'block';
                        enableRemindersInput.checked = false;
                        enableReminders = false;
                        await setSetting('enableReminders', 'false');
                        showToast('Notifications blocked. Enable in browser settings.');
                    }
                    await syncTasksWithServiceWorker();
                    debouncedCheckNotifications();
                });
            } else {
                console.log('Notification permission on load:', Notification.permission);
                await syncTasksWithServiceWorker();
                debouncedCheckNotifications();
            }
        } catch (err) {
            console.error('Service Worker registration failed:', err);
            showToast('Service worker failed to register. Notifications may not work.');
        }
    });
}

/* Trigger notification */
function triggerNotification(task) {
    if ('serviceWorker' in navigator && enableReminders && isTaskStartingSoon(task, new Date()) && !notifiedTasks.has(task.id)) {
        navigator.serviceWorker.getRegistration('sw.js').then(registration => {
            if (registration && registration.active) {
                console.log(`Triggering notification for task "${task.name}" at ${task.start_time}`);
                registration.active.postMessage({
                    type: 'TRIGGER_NOTIFICATION',
                    task: { id: task.id, startTime: task.start_time, name: task.name, priority: task.priority },
                    userName
                });
                notifiedTasks.add(task.id);
                setTimeout(() => notifiedTasks.delete(task.id), 10 * 60 * 1000);
            } else {
                console.warn(`No active service worker for notification of task "${task.name}"`);
            }
        }).catch(err => {
            console.error('Error accessing service worker for notification:', err);
        });
    } else {
        console.log(`Notification skipped for task "${task.name}": serviceWorker=${!!navigator.serviceWorker.controller}, enableReminders=${enableReminders}, startingSoon=${isTaskStartingSoon(task, new Date())}, alreadyNotified=${notifiedTasks.has(task.id)}`);
    }
}

/* Check notifications with debouncing */
const debouncedCheckNotifications = debounce(() => {
    console.log(`checkNotifications called at ${new Date().toISOString()}`);
    console.log('Checking notifications for tasks:', tasks.map(t => t.name));
    console.log('Notification permission:', Notification.permission);
    console.log('Enable reminders:', enableReminders);
    // Clear notified tasks for completed or expired tasks
    tasks.forEach(task => {
        if (task.completed || isTaskExpired(task, new Date())) {
            notifiedTasks.delete(task.id);
        }
    });
    tasks.forEach(task => {
        if (!task.completed && !isTaskExpired(task, new Date())) {
            triggerNotification(task);
        }
    });
}, 30000);

/* Render tasks */
export function renderTasks() {
    const now = new Date();
    // Create a task state snapshot for rendering
    const taskSnapshot = tasks.map(task => ({
        id: task.id,
        start_time: task.start_time,
        end_time: task.end_time,
        name: task.name,
        category: task.category,
        priority: task.priority,
        completed: task.completed,
        is_late: task.is_late,
        expired: isTaskExpired(task, now)
    }));
    const taskHash = JSON.stringify(taskSnapshot);

    // Only re-render if task states have changed
    if (taskHash === lastRenderHash) {
        console.log('Skipping render: no changes');
        return;
    }
    lastRenderHash = taskHash;
    console.log('Rendering tasks:', tasks.map(t => ({ id: t.id, name: t.name, start_time: t.start_time, is_late: t.is_late, completed: t.completed })));

    scheduleContainer.innerHTML = '';
    tasks.forEach((task, index) => {
        const isExpired = isTaskExpired(task, now);
        const showCompleteLate = isExpired && !task.completed && !task.is_late;
        console.log(`Task ${task.name}: isExpired=${isExpired}, completed=${task.completed}, is_late=${task.is_late}, showCompleteLate=${showCompleteLate}`);
        const taskDiv = document.createElement('div');
        taskDiv.className = `task task-added ${isExpired ? 'task-expired' : ''}`;
        taskDiv.setAttribute('data-index', index);
        taskDiv.innerHTML = `
            <h2>${task.start_time} – ${task.end_time}</h2>
            <p><input type="checkbox" id="${task.id}" aria-label="${task.name} task" ${task.completed ? 'checked' : ''} ${isExpired && !task.completed && !task.is_late ? 'disabled title="Time passed"' : ''}><label for="${task.id}"><strong>${task.name}</strong></label></p>
            <p class="category">${task.category}</p>
            <p>Priority: ${task.priority}</p>
            <div class="task-actions">
                <button class="edit-btn" data-index="${index}" aria-label="Edit ${task.name}">✏️ Edit</button>
                <button class="delete-btn" data-index="${index}" aria-label="Delete ${task.name}">🗑️ Delete</button>
                ${showCompleteLate ? `<button class="complete-late-btn" data-index="${index}" aria-label="Complete ${task.name} late">🔓 Complete Late</button>` : ''}
            </div>
        `;
        scheduleContainer.appendChild(taskDiv);
    });

    const notesDiv = document.createElement('div');
    notesDiv.className = 'task';
    notesDiv.innerHTML = `
        <h2>NOTES 📋</h2>
        <p class="category">General</p>
        <p>Priority: Low</p>
        <p>Note: Customize your schedule to align with your goals and lifestyle.</p>
    `;
    scheduleContainer.appendChild(notesDiv);
    initializeCheckboxes();
    attachTaskActions();
    updateProgress();
    if (statsPanel.classList.contains('active')) renderStats();
}

/* Initialize checkboxes */
function initializeCheckboxes() {
    const now = new Date();
    const checkboxes = document.querySelectorAll('input[type="checkbox"]:not(#enableReminders)');
    console.log(`Initializing ${checkboxes.length} checkboxes, expected ${tasks.length}`);
    checkboxes.forEach(checkbox => {
        const task = tasks.find(t => t.id === checkbox.id);
        if (task) {
            checkbox.checked = task.completed;
            checkbox.disabled = isTaskExpired(task, now) && !task.completed && !task.is_late;
            console.log(`Initialized checkbox ${checkbox.id}: completed=${task.completed}, disabled=${checkbox.disabled}`);
        } else {
            console.warn(`No task found for checkbox ${checkbox.id}`);
        }
        checkbox.removeEventListener('change', handleCheckboxChange);
        checkbox.addEventListener('change', handleCheckboxChange);
    });
}

/* Handle checkbox change */
async function handleCheckboxChange(event) {
    const task = await getTaskById(event.target.id);
    const now = new Date();
    if (task && (!isTaskExpired(task, now) || task.is_late)) {
        try {
            task.completed = event.target.checked;
            task.is_late = task.is_late && task.completed;
            task.pending_sync = task.pending_sync || 'update';
            await updateTask(task);
            tasks = tasks.map(t => t.id === task.id ? task : t);
            console.log(`Checkbox ${task.id} changed: completed=${task.completed}, is_late=${task.is_late}`);
            await saveDailyData();
            lastRenderHash = ''; // Force re-render to ensure all late buttons show
            renderTasks();
            await syncTasksWithServiceWorker(); // Sync after completion
            updateProgress();
            // Clear notified status if task is completed
            if (task.completed) notifiedTasks.delete(task.id);
        } catch (error) {
            console.error('Error updating checkbox:', error);
            event.target.checked = !event.target.checked;
            task.completed = event.target.checked;
            showToast('Failed to update task. Check console for details.');
        }
    } else if (task && !task.is_late) {
        event.target.checked = false;
        showToast('Cannot check expired task. Mark as late if needed.');
    }
}

/* Clear weekly data */
async function clearWeeklyData() {
    const now = new Date();
    for (let i = 0; i < 7; i++) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        const dateKey = `tasks_${date.toDateString()}`;
        const completionKey = `completion_${date.toDateString()}`;
        const timelyKey = `timely_${date.toDateString()}`;
        const lateKey = `late_${date.toDateString()}`;
        const db = await idb.openDB('getitdone', 1);
        const tx = db.transaction('settings', 'readwrite');
        const store = tx.objectStore('settings');
        await store.delete(dateKey);
        await store.delete(completionKey);
        await store.delete(timelyKey);
        await store.delete(lateKey);
        await tx.complete;
    }
}

/* Get weekly stats */
async function getWeeklyStats() {
    today = new Date().toDateString();
    const now = new Date();
    const days = [];
    const timelyPercentages = [];
    const latePercentages = [];
    let hundredPercentDays = 0;
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let totalTasks = 0;
    let completedTasks = 0;
    let missedTasksByDay = {};
    let lateTasksByDay = {};

    function addTaskToDay(obj, day, taskName) {
        if (!obj[day]) obj[day] = [];
        obj[day].push(taskName);
    }

    function getDayName(date) {
        return date.toLocaleDateString('en-US', { weekday: 'short' });
    }

    const todayKey = `tasks_${today}`;
    const todayCompletionKey = `completion_${today}`;
    const todayTimelyKey = `timely_${today}`;
    const todayLateKey = `late_${today}`;
    const todayTasks = await getSetting(todayKey);
    const todayPercentage = parseInt(await getSetting(todayCompletionKey) || '0');
    const todayTimely = parseInt(await getSetting(todayTimelyKey) || '0');
    const todayLate = parseInt(await getSetting(todayLateKey) || '0');
    const todayName = getDayName(now);

    days.push(todayName);
    timelyPercentages.push(todayTasks ? Math.round((todayTimely / JSON.parse(todayTasks).length) * 100) : 0);
    latePercentages.push(todayTasks ? Math.round((todayLate / JSON.parse(todayTasks).length) * 100) : 0);

    if (todayPercentage === 100) {
        hundredPercentDays++;
        tempStreak++;
        currentStreak = tempStreak;
        longestStreak = tempStreak;
    }

    if (todayTasks) {
        const dailyTasks = JSON.parse(todayTasks);
        totalTasks += dailyTasks.length;
        completedTasks += dailyTasks.filter(task => task.completed).length;
        dailyTasks.forEach(task => {
            if (!task.completed && isTaskExpired(task, now)) {
                addTaskToDay(missedTasksByDay, todayName, task.name);
            } else if (task.is_late) {
                addTaskToDay(lateTasksByDay, todayName, task.name);
            }
        });
    }

    for (let i = 1; i < 7; i++) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        const dateKey = `tasks_${date.toDateString()}`;
        const completionKey = `completion_${date.toDateString()}`;
        const timelyKey = `timely_${date.toDateString()}`;
        const lateKey = `late_${date.toDateString()}`;
        const tasksData = await getSetting(dateKey);
        const percentage = parseInt(await getSetting(completionKey) || '0');
        const timely = parseInt(await getSetting(timelyKey) || '0');
        const late = parseInt(await getSetting(lateKey) || '0');
        const dayName = getDayName(date);

        days.push(dayName);
        timelyPercentages.push(tasksData ? Math.round((timely / JSON.parse(tasksData).length) * 100) : 0);
        latePercentages.push(tasksData ? Math.round((late / JSON.parse(tasksData).length) * 100) : 0);

        if (percentage === 100) {
            hundredPercentDays++;
            tempStreak++;
            longestStreak = Math.max(longestStreak, tempStreak);
        } else {
            tempStreak = 0;
        }

        if (tasksData) {
            const dailyTasks = JSON.parse(tasksData);
            totalTasks += dailyTasks.length;
            completedTasks += dailyTasks.filter(task => task.completed).length;
            dailyTasks.forEach(task => {
                if (!task.completed && isTaskExpired(task, new Date(date))) {
                    addTaskToDay(missedTasksByDay, dayName, task.name);
                } else if (task.is_late) {
                    addTaskToDay(lateTasksByDay, dayName, task.name);
                }
            });
        }
    }

    return {
        days: days.reverse(),
        timelyPercentages: timelyPercentages.reverse(),
        latePercentages: latePercentages.reverse(),
        hundredPercentDays,
        currentStreak,
        longestStreak,
        totalTasks,
        completedTasks,
        missedTasksByDay,
        lateTasksByDay
    };
}

/* Render stats */
async function renderStats() {
    today = new Date().toDateString();
    const stats = await getWeeklyStats();
    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'short' });

    const summaryText = `
        <strong>${stats.completedTasks}/${stats.totalTasks} tasks completed (${Math.round((stats.completedTasks / stats.totalTasks) * 100) || 0}%)</strong>
        <br>100% Days: ${stats.hundredPercentDays}
        <br>Current Streak: ${stats.currentStreak} day${stats.currentStreak !== 1 ? 's' : ''}
        <br>Longest Streak: ${stats.longestStreak} day${stats.longestStreak !== 1 ? 's' : ''}
    `;

    let detailsHTML = '';
    Object.keys(stats.missedTasksByDay).forEach(day => {
        const tasks = stats.missedTasksByDay[day];
        if (day === todayName) {
            detailsHTML += `<div class="today-header missed-header">Missed Today:</div>
                <ul>${tasks.map(t => `<li>${t}</li>`).join('')}</ul>`;
        } else {
            detailsHTML += `<div class="summary-line missed-summary" data-day="${day}" data-type="missed">
                ⚠️ Missed ${tasks.length} task${tasks.length > 1 ? 's' : ''} on ${day}
            </div>
            <ul class="hidden" id="missed-${day}">${tasks.map(t => `<li>${t}</li>`).join('')}</ul>`;
        }
    });

    Object.keys(stats.lateTasksByDay).forEach(day => {
        const tasks = stats.lateTasksByDay[day];
        if (day === todayName) {
            detailsHTML += `<div class="today-header late-header">Late Today:</div>
                <ul>${tasks.map(t => `<li>${t}</li>`).join('')}</ul>`;
        } else {
            detailsHTML += `<div class="summary-line late-summary" data-day="${day}" data-type="late">
                🕑 ${tasks.length} Late task${tasks.length > 1 ? 's' : ''} on ${day}
            </div>
            <ul class="hidden" id="late-${day}">${tasks.map(t => `<li>${t}</li>`).join('')}</ul>`;
        }
    });

    document.getElementById('weeklySummary').innerHTML = summaryText;
    document.getElementById('weeklyDetails').innerHTML = detailsHTML || '<p>No missed or late tasks.</p>';

    document.querySelectorAll('.summary-line').forEach(line => {
        line.removeEventListener('click', toggleSummary);
        line.addEventListener('click', toggleSummary);
    });

    function toggleSummary() {
        const day = this.dataset.day;
        const type = this.dataset.type;
        const list = document.getElementById(`${type}-${day}`);
        if (list) list.classList.toggle('hidden');
    }

    if (typeof Chart === 'undefined') {
        console.error('Chart.js not loaded');
        chartError.style.display = 'block';
        return;
    }
    chartError.style.display = 'none';

    if (statsChart) {
        statsChart.destroy();
        statsChart = null;
    }

    const chartCanvas = document.getElementById('statsChart');
    chartCanvas.style.display = 'block';
    chartCanvas.width = chartCanvas.parentElement.offsetWidth;
    chartCanvas.height = window.innerWidth <= 600 ? 250 : 350;
    const ctx = chartCanvas.getContext('2d');
    ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);

    try {
        const isMobile = window.innerWidth <= 600;
        const last7Days = stats.days.slice(-7);
        const last7Timely = stats.timelyPercentages.slice(-7);
        const last7Late = stats.latePercentages.slice(-7);
        const last7Totals = last7Timely.map((val, i) => val + last7Late[i]);
        statsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: last7Days,
                datasets: [
                    {
                        label: 'Total Completion %',
                        data: last7Totals,
                        borderColor: '#4BC0C0',
                        backgroundColor: 'rgba(75,192,192,0.06)',
                        borderWidth: 2.5,
                        tension: 0.45,
                        pointBackgroundColor: '#ffffff',
                        pointBorderColor: '#4BC0C0',
                        pointBorderWidth: 2,
                        pointRadius: 3.5,
                        pointHoverRadius: 6,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: { left: 10, right: 10, top: 10, bottom: 10 }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            color: '#E5E5E5',
                            stepSize: 10,
                            font: { size: isMobile ? 11 : 13, weight: '600' }
                        },
                        grid: {
                            color: 'rgba(255,255,255,0.05)',
                            lineWidth: 1,
                            drawBorder: false,
                            tickLength: 0
                        },
                        title: {
                            display: true,
                            text: 'Completion %',
                            color: '#FFB100',
                            font: { size: isMobile ? 14 : 16, weight: '700' },
                            padding: { top: 10, bottom: 5 }
                        }
                    },
                    x: {
                        ticks: {
                            color: '#E5E5E5',
                            font: { size: isMobile ? 10 : 13, weight: '600' },
                            maxRotation: 0,
                            minRotation: 0
                        },
                        grid: {
                            color: (context) => {
                                return context.tick && context.tick.label === hoveredLabel ? 'rgba(75,192,192,0.25)' : 'rgba(255,255,255,0.05)';
                            },
                            lineWidth: (context) => {
                                return context.tick && context.tick.label === hoveredLabel ? 2 : 1;
                            },
                            drawBorder: false,
                            tickLength: 0
                        },
                        title: {
                            display: true,
                            text: 'Day of Week',
                            color: '#FFB100',
                            font: { size: 16, weight: '600' },
                            padding: { top: 10 }
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: '#E5E5E5',
                            font: { size: isMobile ? 11 : 13, weight: '600' },
                            boxWidth: isMobile ? 14 : 18
                        },
                        position: 'top'
                    },
                    title: {
                        display: true,
                        text: 'Weekly Task Completion',
                        color: '#FFB100',
                        font: { size: isMobile ? 16 : 18, weight: '900' },
                        padding: isMobile ? 15 : 20
                    },
                    tooltip: {
                        backgroundColor: '#3A3A3A',
                        titleColor: '#FFB100',
                        bodyColor: '#E5E5E5',
                        borderColor: '#FFB100',
                        borderWidth: 1,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            label: function (context) {
                                const index = context.dataIndex;
                                const timely = last7Timely[index];
                                const late = last7Late[index];
                                const total = timely + late;
                                return [
                                    `Total: ${total.toFixed(1)}%`,
                                    `Timely: ${timely.toFixed(1)}%`,
                                    `Late: ${late.toFixed(1)}%`
                                ];
                            }
                        }
                    }
                },
                animation: {
                    duration: 1400,
                    easing: 'easeInOutQuart'
                },
                hover: {
                    mode: 'nearest',
                    intersect: true,
                    onHover: (event, chartElements) => {
                        if (chartElements.length) {
                            hoveredLabel = chartElements[0].element.$context.rawLabel;
                            statsChart.update('none');
                        } else {
                            if (hoveredLabel) {
                                hoveredLabel = null;
                                statsChart.update('none');
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error rendering chart:', error);
        chartError.style.display = 'block';
    }
}

/* Fire confetti animation */
function fireConfetti() {
    if (isCelebrating) {
        console.log('Confetti already running, skipping');
        return;
    }
    const total = tasks.length;
    const completed = tasks.filter(task => task.completed).length;
    const percentage = total ? Math.round((completed / total) * 100) : 0;
    console.log(`Checking confetti: completed=${completed}, total=${total}, percentage=${percentage}, tasks=[${tasks.map(t => t.name).join(', ')}]`);
    if (percentage !== 100 || total === 0) {
        console.log(`Cannot start confetti: percentage=${percentage}, total=${total}`);
        return;
    }
    console.log('Starting confetti animation');
    isCelebrating = true;
    const startTime = Date.now();
    const duration = 20000;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';
    canvas.style.zIndex = '5000';
    congratsText.style.display = 'block';
    congratsText.style.zIndex = '5001';

    let xPos = Math.random() * (window.innerWidth - 200);
    let yPos = Math.random() * (window.innerHeight - 100);
    let xSpeed = 2;
    let ySpeed = 2;
    const colors = ['#FFB100', '#FFD700', '#FFFFFF', '#B00020'];
    const confetti = [];
    const confettiCount = 200;

    for (let i = 0; i < confettiCount; i++) {
        confetti.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            r: Math.random() * 4 + 4,
            d: Math.random() * confettiCount + 2,
            color: colors[Math.floor(Math.random() * colors.length)],
            tilt: Math.random() * 10 - 10,
            tiltAngleIncremental: Math.random() * 0.07 + 0.05,
            tiltAngle: 0
        });
    }

    function animate() {
        const currentTime = Date.now();
        const elapsed = currentTime - startTime;
        const currentCompleted = tasks.filter(task => task.completed).length;
        const currentPercentage = total ? Math.round((currentCompleted / total) * 100) : 0;

        if (elapsed >= duration || currentPercentage < 100) {
            console.log(`Stopping confetti: elapsed=${elapsed >= duration}, percentage=${currentPercentage}, completed=${currentCompleted}, total=${total}`);
            stopEffects();
            return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        confetti.forEach((p, i) => {
            p.tiltAngle += p.tiltAngleIncremental;
            p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
            p.tilt = Math.sin(p.tiltAngle - i / 3) * 15;
            if (p.y > canvas.height) {
                p.y = -20;
                p.x = Math.random() * canvas.width;
            }
            ctx.beginPath();
            ctx.lineWidth = p.r;
            ctx.strokeStyle = p.color;
            ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
            ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
            ctx.stroke();
        });

        xPos += xSpeed;
        yPos += ySpeed;
        if (xPos + congratsText.offsetWidth > window.innerWidth || xPos < 0) {
            xSpeed = -xSpeed;
            congratsText.style.color = colors[Math.floor(Math.random() * colors.length)];
        }
        if (yPos + congratsText.offsetHeight > window.innerHeight || yPos < 0) {
            ySpeed = -ySpeed;
            congratsText.style.color = colors[Math.floor(Math.random() * colors.length)];
        }
        congratsText.style.left = `${xPos}px`;
        congratsText.style.top = `${yPos}px`;
        congratsText.style.transform = `translate(-50%, -50%)`;

        confettiAnimation = requestAnimationFrame(animate);
    }

    animate();
}

/* Stop confetti and effects */
function stopEffects() {
    console.log('Stopping effects');
    cancelAnimationFrame(confettiAnimation);
    canvas.style.display = 'none';
    congratsText.style.display = 'none';
    isCelebrating = false;
}

/* Update progress bar */
async function updateProgress() {
    const now = Date.now();
    if (now - lastProgressUpdate < 200) {
        console.log('Progress update debounced');
        return;
    }
    lastProgressUpdate = now;

    const total = tasks.length;
    const completed = tasks.filter(task => task.completed).length;
    const percentage = total ? Math.round((completed / total) * 100) : 0;
    document.getElementById('progressBar').style.width = `${percentage}%`;
    document.getElementById('progressText').textContent = `${percentage}% Completed`;
    console.log(`Progress: ${percentage}% (completed=${completed}, total=${total}, isCelebrating=${isCelebrating}, tasks=[${tasks.map(t => t.name).join(', ')}])`);
    if (percentage === 100 && completed > 0 && !isCelebrating) {
        fireConfetti();
    } else if (percentage < 100 && isCelebrating) {
        stopEffects();
    }
    try {
        await saveDailyData();
        if (statsPanel.classList.contains('active')) renderStats();
    } catch (error) {
        console.error('Error updating progress:', error);
        showToast('Failed to update progress. Clear some tasks or reset to default.');
    }
}

/* Check date change for midnight reset */
async function checkDateChange() {
    const currentDate = new Date().toDateString();
    if (lastCheckDate !== currentDate && !isCelebrating) {
        try {
            tasks = await getAllTasks();
            for (const task of tasks) {
                task.completed = false;
                task.is_late = false;
                task.pending_sync = task.pending_sync || 'update';
                await updateTask(task);
                notifiedTasks.delete(task.id); // Clear notifications on reset
            }
            tasks = sortTasksByTime(tasks); // Sort tasks by start_time after reset
            lastCheckDate = currentDate;
            await setSetting('lastCheckDate', currentDate);
            lastRenderHash = '';
            console.log('Date changed, resetting and sorting tasks:', tasks.map(t => ({ name: t.name, start_time: t.start_time })));
            renderTasks();
            await saveDailyData();
            await syncTasksWithServiceWorker(); // Sync after reset
        } catch (error) {
            console.error('Error during date change:', error);
            showToast('Failed to reset tasks. Clear some tasks or reset to default.');
        }
    } else {
        const anyExpired = tasks.some(task => isTaskExpired(task, new Date()) !== document.getElementById(task.id)?.disabled);
        if (anyExpired && !isCelebrating) {
            console.log('Expired tasks detected, re-rendering');
            renderTasks();
        }
    }
}

/* Show task form */
showFormBtn.addEventListener('click', () => {
    taskForm.classList.add('active');
    document.getElementById('editTaskIndex').value = '';
    document.getElementById('addTaskBtn').textContent = '✅ Save Task';
    taskForm.querySelector('h3').textContent = 'Create New Task';
    clearForm(taskForm);
    taskForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* Clear form */
function clearForm(form) {
    form.querySelectorAll('input:not([type="hidden"])').forEach(input => input.value = '');
    form.querySelectorAll('select').forEach(select => select.value = '');
    const customCategory = form.querySelector('#custom-category, #edit-custom-category');
    customCategory.style.display = 'none';
    customCategory.classList.remove('visible');
}

/* Clear form button */
clearFormBtn.addEventListener('click', () => {
    clearForm(taskForm);
});

/* Cancel form button */
cancelFormBtn.addEventListener('click', () => {
    taskForm.classList.remove('active');
    clearForm(taskForm);
    document.getElementById('editTaskIndex').value = '';
    document.getElementById('addTaskBtn').textContent = '✅ Save Task';
    taskForm.querySelector('h3').textContent = 'Create New Task';
});

/* Handle category selection */
document.getElementById('category').addEventListener('change', () => {
    const categorySelect = document.getElementById('category');
    const customCategory = document.getElementById('custom-category');
    customCategory.style.display = categorySelect.value === 'Custom' ? 'block' : 'none';
    customCategory.classList.toggle('visible', categorySelect.value === 'Custom');
    if (categorySelect.value !== 'Custom') customCategory.value = '';
});

document.getElementById('edit-category').addEventListener('change', () => {
    const categorySelect = document.getElementById('edit-category');
    const customCategory = document.getElementById('edit-custom-category');
    customCategory.style.display = categorySelect.value === 'Custom' ? 'block' : 'none';
    customCategory.classList.toggle('visible', categorySelect.value === 'Custom');
    if (categorySelect.value !== 'Custom') customCategory.value = '';
});

/* Add or edit task */
addTaskBtn.addEventListener('click', async () => {
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const taskName = document.getElementById('taskName').value.trim();
    let category = document.getElementById('category').value;
    const customCategory = document.getElementById('custom-category').value.trim();
    const priority = document.getElementById('priority').value;
    const editIndex = document.getElementById('editTaskIndex').value;

    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!startTime || !endTime || !taskName || !category || !priority) {
        showToast('Please fill in all fields!');
        return;
    }
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
        showToast('Invalid time format. Use HH:MM (24-hour).');
        return;
    }
    if (category === 'Custom' && !customCategory) {
        showToast('Please enter a custom category.');
        return;
    }
    if (!isValidTimeRange(startTime, endTime)) {
        showToast('End time must be after start time.');
        return;
    }

    category = category === 'Custom' ? customCategory : category;

    const task = {
        id: editIndex !== '' ? tasks[parseInt(editIndex)].id : `customTask${taskCounter++}`,
        user_id: user ? user.id : null,
        name: taskName,
        start_time: startTime,
        end_time: endTime,
        category,
        priority,
        completed: editIndex !== '' ? tasks[parseInt(editIndex)].completed : false,
        is_late: editIndex !== '' ? tasks[parseInt(editIndex)].is_late : false,
        created_at: new Date().toISOString().split('T')[0],
        pending_sync: editIndex !== '' ? (tasks[parseInt(editIndex)].pending_sync || 'update') : 'create'
    };

    try {
        if (editIndex === '') {
            // Check if this is the first custom task
            const wasEmpty = tasks.every(t => defaultTasks.some(dt => dt.id === t.id));
            await addTask(task);
            tasks.push(task);
            console.log(`Added task "${task.name}", tasks now: [${tasks.map(t => t.name).join(', ')}]`);
            if (wasEmpty && customTaskBanner) {
                await setSetting('hasCustomTasks', 'true');
                hasCustomTasks = true;
                customTaskBanner.classList.remove('hidden');
                customTaskBanner.classList.add('active');
                await setSetting('firstCustomTaskAdded', 'true');
            }
            await syncTasksWithServiceWorker(); // Sync after adding task
            triggerNotification(task); // Check notification for new task
        } else {
            await updateTask(task);
            tasks[parseInt(editIndex)] = task;
            console.log(`Edited task "${task.name}", tasks now: [${tasks.map(t => t.name).join(', ')}]`);
            await syncTasksWithServiceWorker(); // Sync after editing task
            triggerNotification(task); // Check notification for edited task
        }
        tasks = sortTasksByTime(tasks);
        await setSetting('taskCounter', taskCounter.toString());
        await saveDailyData();
        lastRenderHash = ''; // Force re-render
        renderTasks();
        taskForm.classList.remove('active');
        clearForm(taskForm);
    } catch (error) {
        console.error('Error saving task:', error);
        showToast('Failed to save task. Check console for details.');
    }
});
/* Save edited task */
saveEditBtn.addEventListener('click', async () => {
    const startTime = document.getElementById('edit-startTime').value;
    const endTime = document.getElementById('edit-endTime').value;
    const taskName = document.getElementById('edit-taskName').value.trim();
    let category = document.getElementById('edit-category').value;
    const customCategory = document.getElementById('edit-custom-category').value.trim();
    const priority = document.getElementById('edit-priority').value;
    const editIndex = document.getElementById('editTaskIndex').value;

    if (!startTime || !endTime || !taskName || !category || !priority) {
        showToast('Please fill in all fields!');
        return;
    }
    if (!isValidTimeRange(startTime, endTime)) {
        showToast('End time must be after start time.');
        return;
    }
    if (category === 'Custom' && !customCategory) {
        showToast('Please enter a custom category.');
        return;
    }

    category = category === 'Custom' ? customCategory : category;

    try {
        const task = await getTaskById(tasks[parseInt(editIndex)].id);
        task.start_time = startTime;
        task.end_time = endTime;
        task.name = taskName;
        task.category = category;
        task.priority = priority;
        task.pending_sync = task.pending_sync || 'update';
        await updateTask(task);
        tasks[parseInt(editIndex)] = task;
        console.log(`Saved edited task "${task.name}", tasks now: [${tasks.map(t => t.name).join(', ')}]`);
        tasks = sortTasksByTime(tasks);
        await saveDailyData();
        lastRenderHash = ''; // Force re-render
        renderTasks();
        editTaskModal.classList.remove('active');
        clearForm(editTaskModal);
        await syncTasksWithServiceWorker(); // Sync after editing task
        triggerNotification(task); // Check notification for edited task
    } catch (error) {
        console.error('Error saving edited task:', error);
        showToast('Failed to save task. Please try again.');
    }
});

/* Cancel edit */
cancelEditBtn.addEventListener('click', () => {
    editTaskModal.classList.remove('active');
    clearForm(editTaskModal);
    document.getElementById('editTaskIndex').value = '';
});

/* Reset to default tasks */
resetDefaultBtn.addEventListener('click', async () => {
    if (confirm('Reset to default schedule? All custom tasks will be cleared.')) {
        try {
            const db = await idb.openDB('getitdone', 1);
            const tx = db.transaction('tasks', 'readwrite');
            const store = tx.objectStore('tasks');
            await store.clear();
            await tx.complete;
            tasks = defaultTasks.map(task => ({ ...task }));
            for (const task of tasks) {
                try {
                    await addTask(task);
                } catch (error) {
                    if (error.name === 'ConstraintError') {
                        console.log(`Task ${task.id} already exists, skipping`);
                        continue;
                    }
                    throw error;
                }
            }
            hasCustomTasks = false;
            taskCounter = 0;
            await setSetting('hasCustomTasks', 'false');
            await setSetting('taskCounter', '0');
            await setSetting('firstCustomTaskAdded', 'false');
            if (customTaskBanner) {
                customTaskBanner.classList.add('hidden');
                customTaskBanner.classList.remove('active');
            }
            await clearWeeklyData();
            console.log('Reset to default tasks:', tasks.map(t => t.name));
            await saveDailyData();
            lastRenderHash = '';
            renderTasks();
            await syncTasksWithServiceWorker(); // Sync after reset
            notifiedTasks.clear(); // Clear notifications on reset
        } catch (error) {
            console.error('Error resetting to default:', error);
            showToast('Failed to reset to default. Please try again.');
        }
    }
});

/* Dismiss banner */
if (dismissBannerBtn) {
    dismissBannerBtn.addEventListener('click', async () => {
        customTaskBanner.classList.add('hidden');
        customTaskBanner.classList.remove('active');
        await setSetting('firstCustomTaskAdded', 'true');
    });
}

/* Show stats panel */
showReportBtn.addEventListener('click', () => {
    const isActive = statsPanel.classList.contains('active');
    statsPanel.classList.toggle('active', !isActive);
    renderStats();
    if (!isActive) {
        statsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
});

/* Show settings modal */
showSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('active');
    enableRemindersInput.checked = enableReminders;
    userNameInput.value = userName;
    permissionError.style.display = (localStorage.getItem('notificationPermission') || 'default') === 'denied' ? 'block' : 'none';
    settingsModal.scrollIntoView({ behavior: 'smooth', block: 'start' });
    console.log('Settings opened: enableReminders=', enableReminders);
});

/* Save settings */
saveSettingsBtn.addEventListener('click', async () => {
    const wasEnabled = enableReminders;
    const newUserName = userNameInput.value.trim() || 'you';
    enableReminders = enableRemindersInput.checked;

    try {
        await setSetting('userName', newUserName);
        await setSetting('enableReminders', enableReminders.toString());
        userName = newUserName;

        console.log('Saving settings: enableReminders=', enableReminders, 'userName=', newUserName);

        if (enableReminders && !wasEnabled) {
            Notification.requestPermission().then(async permission => {
                await setSetting('notificationPermission', permission);
                console.log('Notification permission:', permission);
                if (permission === 'denied') {
                    permissionError.style.display = 'block';
                    enableRemindersInput.checked = false;
                    enableReminders = false;
                    await setSetting('enableReminders', 'false');
                    showToast('Notifications blocked. Enable in browser settings.');
                } else {
                    permissionError.style.display = 'none';
                    await syncTasksWithServiceWorker();
                    debouncedCheckNotifications();
                }
            });
        } else {
            await syncTasksWithServiceWorker(); // Sync on any settings change
        }

        settingsModal.classList.remove('active');
    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Failed to save settings. Please try again.');
    }
});

/* Cancel settings */
cancelSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('active');
    userNameInput.value = userName;
    enableRemindersInput.checked = enableReminders;
    permissionError.style.display = 'none';
});

/* Handle late task reason input */
lateReasonInput.addEventListener('input', () => {
    modalConfirmBtn.disabled = !lateReasonInput.value.trim();
    modalError.style.display = lateReasonInput.value.trim() ? 'none' : 'block';
});

/* Confirm late task */
modalConfirmBtn.addEventListener('click', async () => {
    if (lateReasonInput.value.trim() && lateTaskIndex !== null && lateTaskIndex >= 0 && lateTaskIndex < tasks.length) {
        try {
            const task = await getTaskById(tasks[lateTaskIndex].id);
            console.log(`Before marking late: task=${JSON.stringify({ id: task.id, name: task.name, is_late: task.is_late, completed: task.completed })}`);
            task.completed = true;
            task.is_late = true;
            task.pending_sync = task.pending_sync || 'update';
            await updateTask(task);
            tasks = tasks.map(t => t.id === task.id ? task : t);
            console.log(`After marking late: task=${JSON.stringify({ id: task.id, name: task.name, is_late: task.is_late, completed: task.completed })}`);
            const checkbox = document.getElementById(task.id);
            if (checkbox) {
                checkbox.checked = true;
                checkbox.disabled = false;
            }
            console.log(`Marked task "${task.name}" as late and completed`);
            await saveDailyData();
            lastRenderHash = ''; // Force re-render to ensure all late buttons show
            renderTasks();
            await syncTasksWithServiceWorker(); // Sync after marking late
            lateTaskModal.classList.remove('active');
            lateReasonInput.value = '';
            modalError.style.display = 'none';
            lateTaskIndex = null;
            notifiedTasks.delete(task.id); // Clear notification status
        } catch (error) {
            console.error('Error marking task as late:', error);
            showToast('Failed to mark task as late. Please try again.');
        }
    } else {
        modalError.style.display = 'block';
    }
});

/* Cancel late task */
modalCancelBtn.addEventListener('click', () => {
    lateTaskModal.classList.remove('active');
    lateTaskIndex = null;
    lateReasonInput.value = '';
    modalError.style.display = 'none';
});

/* Attach task actions (edit, delete, complete late) */
function attachTaskActions() {
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-index'));
            const task = tasks[index];
            document.getElementById('edit-startTime').value = task.start_time;
            document.getElementById('edit-endTime').value = task.end_time;
            document.getElementById('edit-taskName').value = task.name;
            const categorySelect = document.getElementById('edit-category');
            const customCategory = document.getElementById('edit-custom-category');
            if ([...categorySelect.options].some(opt => opt.value === task.category)) {
                categorySelect.value = task.category;
                customCategory.style.display = 'none';
                customCategory.classList.remove('visible');
                customCategory.value = '';
            } else {
                categorySelect.value = 'Custom';
                customCategory.style.display = 'block';
                customCategory.classList.add('visible');
                customCategory.value = task.category;
            }
            document.getElementById('edit-priority').value = task.priority;
            document.getElementById('editTaskIndex').value = index;
            editTaskModal.classList.add('active');
            editTaskModal.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    document.querySelectorAll('.complete-late-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            lateTaskIndex = parseInt(btn.getAttribute('data-index'));
            lateTaskModal.classList.add('active');
            lateReasonInput.value = '';
            modalConfirmBtn.disabled = true;
            modalError.style.display = 'block';
            lateTaskModal.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const index = parseInt(btn.getAttribute('data-index'));
            const task = tasks[index];
            if (confirm(`Delete "${task.name}"?`)) {
                try {
                    await deleteTask(task.id);
                    tasks = tasks.filter(t => t.id !== task.id);
                    if (tasks.length === 0) {
                        tasks = defaultTasks.map(task => ({ ...task }));
                        for (const defaultTask of tasks) {
                            try {
                                await addTask(defaultTask);
                            } catch (error) {
                                if (error.name === 'ConstraintError') {
                                    console.log(`Task ${defaultTask.id} already exists, skipping`);
                                    continue;
                                }
                                throw error;
                            }
                        }
                        hasCustomTasks = false;
                        await setSetting('hasCustomTasks', 'false');
                        await setSetting('firstCustomTaskAdded', 'false');
                        if (customTaskBanner) {
                            customTaskBanner.classList.add('hidden');
                            customTaskBanner.classList.remove('active');
                        }
                    }
                    console.log(`Deleted task "${task.name}", tasks now: [${tasks.map(t => t.name).join(', ')}]`);
                    await saveDailyData();
                    lastRenderHash = '';
                    renderTasks();
                    await syncTasksWithServiceWorker(); // Sync after deletion
                    notifiedTasks.delete(task.id); // Clear notification status
                } catch (error) {
                    console.error('Error deleting task:', error);
                    showToast('Failed to delete task. Please try again.');
                }
            }
        });
    });
}

/* Emoji picker initialization */
const emojiPickers = document.querySelectorAll('emoji-picker');
const emojiButtons = document.querySelectorAll('.emoji-btn');
const taskNameInputs = [document.getElementById('taskName'), document.getElementById('edit-taskName')];

emojiButtons.forEach((btn, index) => {
    const picker = emojiPickers[index];
    const input = taskNameInputs[index];
    btn.addEventListener('click', () => {
        picker.classList.toggle('active');
        picker.style.top = `${btn.offsetTop + btn.offsetHeight + 5}px`;
        picker.style.left = `${btn.offsetLeft}px`;
    });
    picker.addEventListener('emoji-click', event => {
        input.value += event.detail.unicode;
        picker.classList.remove('active');
    });
    document.addEventListener('click', e => {
        if (!picker.contains(e.target) && !btn.contains(e.target)) {
            picker.classList.remove('active');
        }
    });
});

/* PWA install prompt */
window.addEventListener('beforeinstallprompt', async (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if ((await getSetting('installPromptDismissed')) !== 'true') {
        installPrompt.classList.add('active');
    }
});

installBtn.addEventListener('click', () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(choiceResult => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
            } else {
                console.log('User dismissed the install prompt');
            }
            deferredPrompt = null;
            installPrompt.classList.remove('active');
        });
    }
});

dismissInstallBtn.addEventListener('click', async () => {
    await setSetting('installPromptDismissed', 'true');
    installPrompt.classList.remove('active');
});

closeInstallPrompt.addEventListener('click', async () => {
    await setSetting('installPromptDismissed', 'true');
    installPrompt.classList.remove('active');
});

/* Mobile dropdown functionality */
const moreOptionsBtn = document.querySelector('.more-options-btn');
const mobileDropdown = document.querySelector('.mobile-dropdown');

if (moreOptionsBtn && mobileDropdown) {
    moreOptionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        mobileDropdown.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (mobileDropdown.classList.contains('active') && !e.target.closest('.mobile-dropdown')) {
            mobileDropdown.classList.remove('active');
        }
    });

    document.getElementById('mobileResetDefaultBtn')?.addEventListener('click', () => {
        document.getElementById('resetDefaultBtn').click();
        mobileDropdown.classList.remove('active');
    });

    document.getElementById('mobileShowReportBtn')?.addEventListener('click', () => {
        document.getElementById('showReportBtn').click();
        mobileDropdown.classList.remove('active');
    });

    document.getElementById('mobileShowSettingsBtn')?.addEventListener('click', () => {
        document.getElementById('showSettingsBtn').click();
        mobileDropdown.classList.remove('active');
    });
}

/* Window resize handling */
window.addEventListener('resize', () => {
    if (isCelebrating) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        console.log('Resized canvas during confetti');
    }
    if (statsPanel.classList.contains('active')) {
        renderStats();
    }
});




/* Initialize app */
async function init() {
    initGlobalUtils();
    await initAuth();
    await loadTasks();
    setInterval(checkDateChange, 30000);
    setInterval(debouncedCheckNotifications, 30000);
}

/* Start app - ONLY CALL ONCE */
init();  // <-- This is the only line needed