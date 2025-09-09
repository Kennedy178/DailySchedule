/* Import db.js CRUD functions */
import { DB_NAME, DB_VERSION } from './db.js';
import * as idb from 'https://cdn.jsdelivr.net/npm/idb@7.0.2/+esm';
import { addTask, getAllTasks, getTaskById, updateTask, deleteTask, setSetting, getSetting,markTaskAsPendingDelete  } from './db.js';
import { isAuthenticated, initAuth, user, } from './authHandler.js';
import { fetchBackendTasks, cacheBackendTasks, setupRealtimeSubscriptions, syncPendingTasks, updateUserProfileFlag, checkUserHasCreatedTasks } from './sync.js';
import { supabase } from './auth.js';
import { fcmToken, initFCMManager, registerFCMToken, isTokenRegistered } from './fcm-manager.js';
import { initOfflineQueue } from './offline-queue.js';


/* Initialize global variables */
let today = new Date().toDateString();
let hoveredLabel = null;
let lastCheckDate = null;
let lastResetDate = null;
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
let  firstCustomTaskAdded;

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

// Disable console logs in production
//if (location.hostname !== "localhost") {
    //console.log = function () {};
    //console.debug = function () {};
    //console.info = function () {};
    //console.warn = function () {};
    // Only console.error for actual error reporting
//}

/* Default tasks */
const defaultTasks = [
    { start_time: '06:30', end_time: '07:00', name: 'Morning Walk(virtual on Youtube) 🌳🌅', category: 'Health', priority: 'Medium', completed: false, is_late: false, created_at: new Date().toISOString().split('T')[0] },
    { start_time: '07:00', end_time: '07:45', name: 'Workout + Shower 💪🚿', category: 'Fitness', priority: 'Medium', completed: false, is_late: false, created_at: new Date().toISOString().split('T')[0] },
    { start_time: '07:45', end_time: '08:15', name: 'Breakfast & Quick Chat Break 🍳 💬', category: 'Routine', priority: 'Medium', completed: false, is_late: false, created_at: new Date().toISOString().split('T')[0] },
    { start_time: '08:15', end_time: '09:45', name: 'Skill Development/Online Learning 📚', category: 'Learning', priority: 'High', completed: false, is_late: false, created_at: new Date().toISOString().split('T')[0] },
    { start_time: '09:45', end_time: '11:15', name: 'Personal Projects/Portfolio Work 💻', category: 'Project', priority: 'High', completed: false, is_late: false, created_at: new Date().toISOString().split('T')[0] },
    { start_time: '11:15', end_time: '12:45', name: 'Research Career Growth & Industry Insights 🎯', category: 'Career', priority: 'High', completed: false, is_late: false, created_at: new Date().toISOString().split('T')[0] },
    { start_time: '12:45', end_time: '13:45', name: 'Lunch Break & Social Time 🍕', category: 'Routine', priority: 'Medium', completed: false, is_late: false, created_at: new Date().toISOString().split('T')[0] },
    { start_time: '13:45', end_time: '14:45', name: 'Financial Education/Planning 💰', category: 'Finance', priority: 'High', completed: false, is_late: false, created_at: new Date().toISOString().split('T')[0] },
    { start_time: '14:45', end_time: '15:15', name: 'Chat Break 💬', category: 'Social', priority: 'Low', completed: false, is_late: false, created_at: new Date().toISOString().split('T')[0] },
    { start_time: '15:15', end_time: '16:45', name: 'Professional Networking i.e (LinkedIn) + Article Writing 🌐', category: 'Professional', priority: 'High', completed: false, is_late: false, created_at: new Date().toISOString().split('T')[0] },
    { start_time: '16:45', end_time: '17:15', name: 'Skill Development/Online Learning 📚', category: 'Learning', priority: 'High', completed: false, is_late: false, created_at: new Date().toISOString().split('T')[0] },
    { start_time: '17:15', end_time: '19:00', name: 'Free Time/Hobbies/Social Activities 🎮🎬', category: 'Leisure', priority: 'Low', completed: false, is_late: false, created_at: new Date().toISOString().split('T')[0] },
    { start_time: '19:00', end_time: '19:30', name: 'Evening Workout + Shower 🚴‍♂️🚿', category: 'Fitness', priority: 'Medium', completed: false, is_late: false, created_at: new Date().toISOString().split('T')[0] },
    { start_time: '19:30', end_time: '20:30', name: 'Dinner & Family/Friends Time 🍽️', category: 'Social', priority: 'Medium', completed: false, is_late: false, created_at: new Date().toISOString().split('T')[0] },
    { start_time: '20:30', end_time: '22:00', name: 'Personal Projects/Side Hustle 🚀', category: 'Project', priority: 'High', completed: false, is_late: false, created_at: new Date().toISOString().split('T')[0] },
    { start_time: '22:00', end_time: '22:30', name: 'Daily Reflection & Tomorrow\'s Planning 📝', category: 'Personal Growth', priority: 'High', completed: false, is_late: false, created_at: new Date().toISOString().split('T')[0] },
    { start_time: '23:00', end_time: '06:30', name: 'Sleep 😴', category: 'Health', priority: 'High', completed: false, is_late: false, created_at: new Date().toISOString().split('T')[0] }
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
        <div class="spinner-container">
            <div class="spinner-rings">
                <div class="ring ring-1"></div>
                <div class="ring ring-2"></div>
                <div class="ring ring-3"></div>
            </div>
            <div class="spinner-logo">
                <div class="logo-circle">
                    <span class="logo-text">✓</span>
                </div>
            </div>
        </div>
        <div class="spinner-content">
            <h3 class="spinner-title">GetItDone</h3>
            <p class="spinner-message">Organizing your tasks...</p>
            <div class="spinner-dots">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    
    spinner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, #0D0D0F 0%, #1A1A20 50%, #0D0D0F 100%);
        display: none;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        z-index: 10000;
        color: white;
        backdrop-filter: blur(20px);
    `;
    
    // advanced CSS styles-extra sleekness
    const styles = document.createElement('style');
    styles.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        
        .spinner-container {
            position: relative;
            width: 120px;
            height: 120px;
            margin-bottom: 30px;
        }
        
        .spinner-rings {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
        }
        
        .ring {
            position: absolute;
            border-radius: 50%;
            border: 2px solid transparent;
            border-top: 2px solid #FFCA28;
            animation: spin 2s linear infinite;
        }
        
        .ring-1 {
            width: 120px;
            height: 120px;
            top: -60px;
            left: -60px;
            border-top-color: #FFCA28;
            animation-duration: 2s;
        }
        
        .ring-2 {
            width: 90px;
            height: 90px;
            top: -45px;
            left: -45px;
            border-top-color: #FFD740;
            animation-duration: 1.5s;
            animation-direction: reverse;
        }
        
        .ring-3 {
            width: 60px;
            height: 60px;
            top: -30px;
            left: -30px;
            border-top-color: #FFB300;
            animation-duration: 1s;
        }
        
        .spinner-logo {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 10;
        }
        
        .logo-circle {
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #FFCA28, #FFB300);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 20px rgba(255, 202, 40, 0.4);
            animation: pulse 2s ease-in-out infinite;
        }
        
        .logo-text {
            font-size: 20px;
            font-weight: bold;
            color: #0D0D0F;
            animation: checkmark 2s ease-in-out infinite;
        }
        
        .spinner-content {
            text-align: center;
            animation: fadeInUp 0.8s ease-out;
        }
        
        .spinner-title {
            font-family: 'Inter', sans-serif;
            font-size: 28px;
            font-weight: 700;
            background: linear-gradient(135deg, #FFCA28, #FFD740);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin: 0 0 8px 0;
            letter-spacing: 0.5px;
        }
        
        .spinner-message {
            font-family: 'Inter', sans-serif;
            font-size: 16px;
            font-weight: 500;
            color: #A0A0A0;
            margin: 0 0 20px 0;
            opacity: 0.9;
        }
        
        .spinner-dots {
            display: flex;
            justify-content: center;
            gap: 6px;
        }
        
        .spinner-dots span {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #FFCA28;
            animation: dotPulse 1.4s ease-in-out infinite both;
        }
        
        .spinner-dots span:nth-child(1) {
            animation-delay: -0.32s;
        }
        
        .spinner-dots span:nth-child(2) {
            animation-delay: -0.16s;
        }
        
        @keyframes spin {
            0% {
                transform: rotate(0deg);
            }
            100% {
                transform: rotate(360deg);
            }
        }
        
        @keyframes pulse {
            0%, 100% {
                transform: translate(-50%, -50%) scale(1);
                box-shadow: 0 0 20px rgba(255, 202, 40, 0.4);
            }
            50% {
                transform: translate(-50%, -50%) scale(1.1);
                box-shadow: 0 0 30px rgba(255, 202, 40, 0.6);
            }
        }
        
        @keyframes checkmark {
            0%, 50% {
                opacity: 1;
            }
            51%, 100% {
                opacity: 0.7;
            }
        }
        
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        @keyframes dotPulse {
            0%, 80%, 100% {
                transform: scale(0.8);
                opacity: 0.5;
            }
            40% {
                transform: scale(1.2);
                opacity: 1;
            }
        }
        
        /* Responsive design */
        @media (max-width: 480px) {
            .spinner-container {
                width: 100px;
                height: 100px;
            }
            
            .ring-1 {
                width: 100px;
                height: 100px;
                top: -50px;
                left: -50px;
            }
            
            .ring-2 {
                width: 75px;
                height: 75px;
                top: -37.5px;
                left: -37.5px;
            }
            
            .ring-3 {
                width: 50px;
                height: 50px;
                top: -25px;
                left: -25px;
            }
            
            .logo-circle {
                width: 32px;
                height: 32px;
            }
            
            .logo-text {
                font-size: 16px;
            }
            
            .spinner-title {
                font-size: 24px;
            }
            
            .spinner-message {
                font-size: 14px;
            }
        }
    `;
    
    document.head.appendChild(styles);
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

export function showLoading(show, customMessage = null) {
    const spinner = document.getElementById('loadingSpinner') || createSpinner();
    
    // Update message if provided
    if (customMessage && show) {
        const messageElement = spinner.querySelector('.spinner-message');
        if (messageElement) {
            messageElement.textContent = customMessage;
        }
    }
    
    spinner.style.display = show ? 'flex' : 'none';
    
    // Add smooth transition
    if (show) {
        spinner.style.opacity = '0';
        setTimeout(() => {
            spinner.style.opacity = '1';
            spinner.style.transition = 'opacity 0.3s ease-in-out';
        }, 10);
    }
}



//---UTILITY FUNCS--//

/* Debounce function to limit notification checks */
function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}
//--END OF UTILITY FUNCS--//

/**
 * Load tasks for either authenticated or guest mode
 * Phase 3 goals implemented:
 * - Offline skip backend fetch for instant load
 * - IndexedDB caching & fallback to defaults
 * - Single render at the end to avoid flicker
 * - Delayed syncTasksWithServiceWorker until after UI is ready
 */
export async function loadTasks(mode) {

    try {
        // Load settings
        taskCounter = parseInt(await getSetting('taskCounter') || '0');
        userName = (await getSetting('userName')) || 'you';
        enableReminders = (await getSetting('enableReminders')) === 'true';
        lastCheckDate = (await getSetting('lastCheckDate')) || today;
        lastResetDate = (await getSetting('lastResetDate')) || today;

        firstCustomTaskAdded = (await getSetting('firstCustomTaskAdded')) === 'true';

        if (mode === 'authenticated') {
    if (!isAuthenticated()) {
        console.warn('Not authenticated, cannot load tasks');
        showToast('Please sign in to load tasks.', 'error');
        return;
    }

    // Start with local IndexedDB tasks for this user
    tasks = (await getAllTasks()).filter(task => task.user_id === user.id);

    if (navigator.onLine) {
        // Fix any broken custom task IDs before syncing
        for (const task of tasks) {
            if (task.id.startsWith('customTask') && task.user_id === user.id) {
                const newTask = { ...task, id: crypto.randomUUID(), pending_sync: 'update' };
                await updateTask(newTask);
            }
        }

        // Sync pending local changes first
        await syncPendingTasks();

        // Check if user has ever created tasks
        // Check if user has ever created tasks (both local and server)
const localFlag = (await getSetting('userHasCreatedTasks')) === 'true';
const serverFlag = await checkUserHasCreatedTasks();
const userHasCreatedTasks = localFlag || serverFlag;

// Sync the flags if they're mismatched
if (serverFlag && !localFlag) {
    await setSetting('userHasCreatedTasks', 'true');
} else if (localFlag && !serverFlag) {
    await updateUserProfileFlag(true);
}

        // Try fetching backend tasks
        const backendTasks = await fetchBackendTasks();

        if (backendTasks === null) {
            // Network failure - show reconnecting message
            if (!userHasCreatedTasks && tasks.length === 0) {
                showReconnectingState();
                return; // Don't load anything
            } else {
                // User has created tasks before or has cached tasks - use cached
                console.log("Network failed, using cached tasks");
                showToast('Using offline data. Reconnecting...', 'warning');
            }
        } else if (Array.isArray(backendTasks)) {
            if (backendTasks.length > 0) {
                // User has tasks on backend
                await cacheBackendTasks(backendTasks);
                tasks = (await getAllTasks()).filter(task => task.user_id === user.id);
                
                // Mark that user has created tasks
                if (!userHasCreatedTasks) {
                    await setSetting('userHasCreatedTasks', 'true');
                }
            } else if (!userHasCreatedTasks && tasks.length === 0) {
                // Truly new user - safe to load defaults
                tasks = defaultTasks.map(task => ({
                    ...task,
                    id: crypto.randomUUID(),
                    user_id: user.id,
                    pending_sync: 'create'
                }));
                for (const task of tasks) {
                    await addTask(task);
                }
                await syncPendingTasks();
                console.log('Loaded defaults for new authenticated user');
            } else {
                // User deleted all their tasks but has created before - don't load defaults
                console.log('User has no tasks but has created before - not loading defaults');
            }
        }

        setupRealtimeSubscriptions();
    } else if (tasks.length === 0) {
        // Offline & no cached tasks → show offline message
        showReconnectingState();
        return;
    }
} else if (mode === 'guest') {
            tasks = (await getAllTasks()).filter(task => task.user_id === null);

            // Clear pending_sync for guest tasks
            for (const task of tasks) {
                if (task.pending_sync !== null) {
                    await updateTask({ ...task, pending_sync: null });
                }
            }

            if (tasks.length === 0) {
                tasks = defaultTasks.map(task => ({
                    ...task,
                    id: crypto.randomUUID(),
                    user_id: null,
                    pending_sync: null
                }));
                for (const task of tasks) {
                    await addTask(task);
                }
                console.log('Loaded and cached default tasks for guest mode');
            }
        } else {
            console.error('Invalid mode:', mode);
            showToast('Invalid mode selected.', 'error');
            return;
        }

        // Sort tasks
        
        console.log('Loaded and sorted tasks:', tasks.map(t => ({
            id: t.id,
            name: t.name,
            start_time: t.start_time,
            is_late: t.is_late,
            completed: t.completed
        })));

        // Update UI controls
        const enableRemindersInput = document.getElementById('enableRemindersInput');
        const userNameInput = document.getElementById('userNameInput');
        const permissionError = document.getElementById('permissionError');
        

        if (enableRemindersInput) enableRemindersInput.checked = enableReminders;
        if (userNameInput) userNameInput.value = userName;
        if (permissionError) {
            permissionError.style.display = (await getSetting('notificationPermission')) === 'denied' ? 'block' : 'none';
        }

        
        // Render once at the end
        await handleCustomTaskBanner(tasks);
        await renderTasks(tasks);
        await syncTasksWithServiceWorker();

    } catch (error) {
        console.error('Error loading tasks:', error);
        tasks = (await getAllTasks()).filter(task => mode === 'authenticated' ? task.user_id === user.id : task.user_id === null);
        // Tasks are already sorted from getAllTasks()

        if (tasks.length > 0) {
            console.log('Recovered tasks:', tasks.map(t => ({
                id: t.id,
                name: t.name,
                start_time: t.start_time
            })));
            await handleCustomTaskBanner(tasks);
            await renderTasks(tasks);
            await syncTasksWithServiceWorker();
        } else {
            showToast('Failed to load tasks.', 'error');
        }
    }
}


// CUSTOM TASK BANNER LOGIC
async function handleCustomTaskBanner(tasks) {
    const firstCustomTaskAdded = await getSetting('firstCustomTaskAdded');
    
    // Fix: Handle both authenticated and guest modes
    // Using global hasCustomTasks variable
    if (isAuthenticated() && user && user.id) {
        // Authenticated mode: check for user's custom tasks
        hasCustomTasks = tasks.some(t => t.user_id === user.id);
    } else {
        // Guest mode: check for guest tasks (user_id === null)
        hasCustomTasks = tasks.some(t => t.user_id === null);
    }

    if (!firstCustomTaskAdded && hasCustomTasks && customTaskBanner) {
        console.log('Showing custom task banner for first time custom task');
        customTaskBanner.classList.remove('hidden');
        customTaskBanner.classList.add('active');
    }

    if (dismissBannerBtn) {
        dismissBannerBtn.onclick = async () => {
            customTaskBanner.classList.add('hidden');
            customTaskBanner.classList.remove('active');
            await setSetting('firstCustomTaskAdded', 'true');
            console.log('Banner dismissed permanently');
        };
    }
}

function showReconnectingState() {
    scheduleContainer.innerHTML = `
        <div class="task" style="text-align: center; padding: 40px;">
            <h2>🌐 Couldn't load your tasks</h2>
            <p>Slow network detected. Reconnecting...</p>
            <div style="margin: 20px 0;">
                <div class="spinner" style="margin: 0 auto;"></div>
            </div>
            <p><a href="story.html" target="_blank">📖 Read a story while you wait</a></p>
            <button onclick="location.reload()" style="margin-top: 15px; padding: 10px 20px;">
                🔄 Try Again
            </button>
        </div>
    `;
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
        const db = await idb.openDB(DB_NAME, DB_VERSION);
        const tx = db.transaction('settings', 'readwrite');
        const store = tx.objectStore('settings');
        await store.delete(dateKey);
        await store.delete(completionKey);
        await store.delete(timelyKey);
        await store.delete(lateKey);
        await tx.complete;
    }
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


// service worker sync function to include authentication and FCM status
/* Sync tasks with service worker - GUEST USERS ONLY */
async function syncTasksWithServiceWorker() {
    // CRITICAL: Only sync for guest users - authenticated users use FCM backend
    if (isAuthenticated()) {
        console.log('Authenticated user - skipping local task sync, using FCM backend only');
        return;
    }
    
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
            
            console.log('Syncing tasks with service worker for GUEST USER:', syncTasks.map(t => t.name));
            
            registration.active.postMessage({
                type: 'SYNC_TASKS',
                tasks: syncTasks,
                userName,
                enableReminders,
                isAuthenticated: false,  // Always false here since we checked above
                fcmToken: null
            });
        } else {
            console.warn('No active service worker available');
        }
    } catch (err) {
        console.error('Error syncing with service worker:', err);
    }
}

/* Service worker registration - Enhanced for FCM */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('sw.js');
            console.log('Service Worker registered:', registration);
            
            // Handle notification permissions
            if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
                const permission = await Notification.requestPermission();
                await setSetting('notificationPermission', permission);
                console.log('Initial notification permission:', permission);
                
                if (permission === 'denied') {
                    const permissionError = document.getElementById('permissionError');
                    if (permissionError) {
                        permissionError.style.display = 'block';
                    }
                    document.getElementById('enableRemindersInput').checked = false;
                    enableReminders = false;
                    await setSetting('enableReminders', 'false');
                    showToast('Notifications blocked. Enable in browser settings.');
                }
            }
        } catch (err) {
            console.error('Service Worker registration failed:', err);
        }
    });
}


/* Trigger notification - Route to appropriate handler */
async function triggerNotification(task) {
    if (!enableReminders || !isTaskStartingSoon(task, new Date()) || notifiedTasks.has(task.id)) {
        return;
    }

    if (isAuthenticated()) {
        // For authenticated users: FCM backend handles everything
        console.log(`Authenticated user - FCM backend will handle notification for task "${task.name}"`);
        
        // Mark as notified to prevent any local duplicates
        notifiedTasks.add(task.id);
        setTimeout(() => notifiedTasks.delete(task.id), 10 * 60 * 1000);
        return;
    } else {
        // For guest users: Use local notifications
        console.log(`Guest user - sending local notification for task: "${task.name}"`);
        await sendLocalNotification(task);
        
        notifiedTasks.add(task.id);
        setTimeout(() => notifiedTasks.delete(task.id), 10 * 60 * 1000);
    }
}


/* Send local notification via service worker - GUEST USERS ONLY */
async function sendLocalNotification(task) {
    try {
        if (!('serviceWorker' in navigator) || !('Notification' in window)) {
            console.log(`Local notification not supported for task "${task.name}"`);
            return false;
        }

        const permission = Notification.permission;
        if (permission !== 'granted') {
            console.log(`Local notification permission denied for task "${task.name}": ${permission}`);
            return false;
        }

        const registration = await navigator.serviceWorker.getRegistration('sw.js');
        if (registration && registration.active) {
            console.log(`Sending local notification via service worker for task "${task.name}"`);
            
            registration.active.postMessage({
                type: 'TRIGGER_NOTIFICATION',
                task: { 
                    id: task.id, 
                    startTime: task.start_time, 
                    name: task.name, 
                    priority: task.priority 
                },
                userName
            });
            return true;
        } else {
            console.warn(`No active service worker for local notification of task "${task.name}"`);
            return false;
        }
    } catch (error) {
        console.error(`Local notification failed for task "${task.name}":`, error);
        return false;
    }
}


/* Check notifications with debouncing - GUEST USERS ONLY */
const debouncedCheckNotifications = debounce(() => {
    console.log(`checkNotifications called at ${new Date().toISOString()}`);
    
    // ABSOLUTE GUARD: No local notifications for authenticated users
    if (isAuthenticated()) {
        console.log('AUTHENTICATED USER - FCM backend handles all notifications, completely skipping local checks');
        return;
    }
    
    console.log('GUEST USER - proceeding with local notification checks');
    console.log('Checking notifications for tasks:', tasks.map(t => t.name));
    console.log('Enable reminders:', enableReminders);
    
    // Clear notified tasks for completed or expired tasks
    tasks.forEach(task => {
        if (task.completed || isTaskExpired(task, new Date())) {
            notifiedTasks.delete(task.id);
        }
    });
    
    // Check each active task for notifications (GUEST USERS ONLY)
    tasks.forEach(task => {
        if (!task.completed && !isTaskExpired(task, new Date())) {
            triggerNotification(task);
        }
    });
}, 30000);

/* Render tasks */
/* FIXED: Accept tasks as parameter to ensure fresh data */
export async function renderTasks(tasksToRender = null) {
    
    // Use passed tasks or fall back to global tasks
    const currentTasks = tasksToRender || tasks;
   

    
    const now = new Date();
    // Create a task state snapshot for rendering
    const taskSnapshot = currentTasks.map(task => ({
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
    
    // FIXED: Update global tasks array with fresh data
    tasks = [...currentTasks];
    
    console.log('Rendering tasks:', currentTasks.map(t => ({ id: t.id, name: t.name, start_time: t.start_time, is_late: t.is_late, completed: t.completed })));

    // Added: Check for empty tasks to avoid unnecessary DOM work
    if (currentTasks.length === 0) {
        console.log('No tasks to render');
        scheduleContainer.innerHTML = '';
        return;
    }

    // Changed: Use DocumentFragment for batch DOM updates to improve performance
    const fragment = document.createDocumentFragment();
    currentTasks.forEach((task, index) => {
        const isExpired = isTaskExpired(task, now);
        const showCompleteLate = isExpired && !task.completed && !task.is_late;
        console.log(`Task ${task.name}: isExpired=${isExpired}, completed=${task.completed}, is_late=${task.is_late}, showCompleteLate=${showCompleteLate}`);
        
        const taskDiv = document.createElement('div');
        taskDiv.className = `task task-added ${isExpired ? 'task-expired' : ''}`;
        taskDiv.setAttribute('data-index', index);

        // Build task HTML (keeping your existing DOM creation logic)
        const timeHeader = document.createElement('h2');
        timeHeader.textContent = `${task.start_time} – ${task.end_time}`;
        taskDiv.appendChild(timeHeader);

        const taskNameP = document.createElement('p');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = task.id;
        checkbox.setAttribute('aria-label', `${task.name} task`);
        checkbox.checked = task.completed; // FIXED: Ensure this reflects backend state
        if (isExpired && !task.completed && !task.is_late) {
            checkbox.disabled = true;
            checkbox.title = 'Time passed';
        }
        const label = document.createElement('label');
        label.htmlFor = task.id;
        const strong = document.createElement('strong');
        strong.textContent = task.name;
        label.appendChild(strong);
        taskNameP.appendChild(checkbox);
        taskNameP.appendChild(label);
        taskDiv.appendChild(taskNameP);

        const categoryP = document.createElement('p');
        categoryP.className = 'category';
        categoryP.textContent = task.category;
        taskDiv.appendChild(categoryP);

        const priorityP = document.createElement('p');
        priorityP.textContent = `Priority: ${task.priority}`;
        taskDiv.appendChild(priorityP);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'task-actions';
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.setAttribute('data-index', index);
        editBtn.setAttribute('aria-label', `Edit ${task.name}`);
        editBtn.textContent = '✏️ Edit';
        actionsDiv.appendChild(editBtn);
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.setAttribute('data-index', index);
        deleteBtn.setAttribute('aria-label', `Delete ${task.name}`);
        deleteBtn.textContent = '🗑️ Delete';
        actionsDiv.appendChild(deleteBtn);
        if (showCompleteLate) {
            const completeLateBtn = document.createElement('button');
            completeLateBtn.className = 'complete-late-btn';
            completeLateBtn.setAttribute('data-index', index);
            completeLateBtn.setAttribute('aria-label', `Complete ${task.name} late`);
            completeLateBtn.textContent = '🔓 Complete Late';
            actionsDiv.appendChild(completeLateBtn);
        }
        taskDiv.appendChild(actionsDiv);

        fragment.appendChild(taskDiv);
    });
    //Always show notes section at the end
    // FIXED: Ensure notes section is always rendered
    const notesDiv = document.createElement('div');
    notesDiv.className = 'task';
    notesDiv.innerHTML = `
        <h2>NOTES 📋</h2>
        <p class="category">General</p>
        <p>Priority: Low</p>
        <p>Note: Customize your schedule to align with your goals and lifestyle.</p>
    `;
    fragment.appendChild(notesDiv);

    // Clear container and append fragment once
    scheduleContainer.innerHTML = '';
    scheduleContainer.appendChild(fragment);

    // FIXED: Use the fresh currentTasks for initialization
    requestAnimationFrame(() => {
        initializeCheckboxes(currentTasks);
        attachTaskActions();
        updateProgress();
        if (statsPanel.classList.contains('active')) renderStats();
    });
}

/* FIXED: Accept tasks parameter for accurate initialization */
function initializeCheckboxes(tasksToInitialize = null) {
    const currentTasks = tasksToInitialize || tasks;
    const now = new Date();
    const checkboxes = document.querySelectorAll('input[type="checkbox"]:not(#enableReminders)');
    console.log(`Initializing ${checkboxes.length} checkboxes, expected ${currentTasks.length}`);

    // Create task lookup map for faster access
    const taskMap = new Map(currentTasks.map(task => [task.id, task]));
    
    checkboxes.forEach(checkbox => {
        const task = taskMap.get(checkbox.id);
        if (task) {
            checkbox.checked = task.completed; // FIXED: Now uses fresh backend data
            checkbox.disabled = isTaskExpired(task, now) && !task.completed && !task.is_late;
            console.log(`Initialized checkbox ${checkbox.id}: completed=${task.completed}, disabled=${checkbox.disabled}`);
        } else {
            console.warn(`No task found for checkbox ${checkbox.id} in taskMap`);
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
            if (isAuthenticated()) {
    task.pending_sync = 'update'; // Always set for authenticated users
}
            await updateTask(task);
            tasks = tasks.map(t => t.id === task.id ? task : t);
            console.log(`Checkbox ${task.id} changed: completed=${task.completed}, is_late=${task.is_late}`);
            await saveDailyData();
           //lastRenderHash = ''; // Force re-render to ensure all late buttons show
            // Changed: Await renderTasks to ensure UI updates before sync
            await renderTasks();
            // Changed: Log sync errors for debugging
            try {
                await syncTasksWithServiceWorker(); // Sync after completion
            } catch (syncError) {
                console.error('Sync failed after checkbox change:', syncError);
            }
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
        const db = await idb.openDB(DB_NAME, DB_VERSION);
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
            //“live” missed detection during the current day
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
                if (!task.completed && isTaskExpired(task, endOfDay(date))) {
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

async function checkDateChange() {
    const currentDate = new Date().toDateString();

    // Load saved reset date from settings if not already in memory
    if (!lastResetDate) {
        lastResetDate = await getSetting('lastResetDate') || currentDate;
    }

    if (!lastCheckDate) {
        lastCheckDate = await getSetting('lastCheckDate') || currentDate;
    }

    // Run only if: new date AND not celebrating AND not already reset today
    if (lastCheckDate !== currentDate && !isCelebrating && lastResetDate !== currentDate) {
        try {
            console.log(`Midnight reset triggered for ${currentDate}`);

            // CRITICAL FIX: Prevent any renders during the reset process
            lastRenderHash = 'RESETTING'; // Block renders
            
            // Load and filter tasks properly (matching loadTasks logic)
            const allTasks = await getAllTasks();
            let filteredTasks;
            
            if (isAuthenticated()) {
                filteredTasks = allTasks.filter(task => task.user_id === user.id);
            } else {
                filteredTasks = allTasks.filter(task => task.user_id === null);
            }

            console.log('Tasks before reset:', filteredTasks.map(t => ({ 
                name: t.name, 
                start_time: t.start_time, 
                completed: t.completed, 
                is_late: t.is_late 
            })));

            // Reset task states in batch
            const resetTasks = filteredTasks.map(task => ({
                ...task,
                completed: false,
                is_late: false,
                pending_sync: task.pending_sync || 'update'
            }));

            // Update IndexedDB in batch
            for (const task of resetTasks) {
                await updateTask(task);
            }

            // Bulk Supabase update (only for authenticated users)
            if (isAuthenticated() && resetTasks.length > 0) {
                const ids = resetTasks.map(t => t.id);
                const { error } = await supabase
                    .from('tasks')
                    .update({ completed: false, is_late: false })
                    .in('id', ids);
                if (error) {
                    console.error('Supabase bulk update error:', error);
                    throw error;
                }
            }

            // Re-fetch sorted tasks from IndexedDB
            tasks = await getAllTasks();
            
            console.log('Tasks after reset and sort:', tasks.map(t => ({ 
                name: t.name, 
                start_time: t.start_time, 
                completed: t.completed, 
                is_late: t.is_late 
            })));

            // Update date settings
            lastCheckDate = currentDate;
            lastResetDate = currentDate;
            await setSetting('lastCheckDate', currentDate);
            await setSetting('lastResetDate', currentDate);
            
            // CRITICAL: Reset render hash to force fresh render
            lastRenderHash = '';

            // Single render call with explicitly sorted tasks
            console.log('About to render sorted tasks');
            await renderTasks(tasks);
            
            // Additional operations
            await saveDailyData();
            await syncTasksWithServiceWorker();
            
            console.log('Midnight reset completed successfully');
            
        } catch (error) {
            console.error('Error during date change:', error);
            showToast('Failed to reset tasks. Clear some tasks or reset to default.');
            
            // Recovery: try to reload tasks properly
            try {
                const mode = isAuthenticated() ? 'authenticated' : 'guest';
                await loadTasks(mode);
            } catch (recoveryError) {
                console.error('Recovery failed:', recoveryError);
            }
        }
    } else {
        // Re-render only if late tasks detected (no changes here)
        const anyExpired = tasks.some(
            task => isTaskExpired(task, new Date()) !== document.getElementById(task.id)?.disabled
        );
        if (anyExpired && !isCelebrating) {
            console.log('Expired tasks detected, re-rendering');
            await renderTasks(tasks);
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

    let task;
    if (editIndex === '') {
        // New task
        task = {
            id: isAuthenticated() ? crypto.randomUUID() : `customTask${taskCounter++}`,
            user_id: isAuthenticated() ? user.id : null,
            name: taskName,
            start_time: startTime,
            end_time: endTime,
            category,
            priority,
            completed: false,
            is_late: false,
            created_at: new Date().toISOString().split('T')[0],
            pending_sync: isAuthenticated() ? 'create' : null
        };
    } else {
        // Editing task — preserve state
        const existingTask = tasks[parseInt(editIndex)];
        task = {
            ...existingTask,
            name: taskName,
            start_time: startTime,
            end_time: endTime,
            category,
            priority,
            pending_sync: isAuthenticated() ? 'update' : null,
            updated_at: new Date().toISOString()
        };
    }

    // 1. CLOSE FORM IMMEDIATELY - Give instant feedback to user
    taskForm.classList.remove('active');
    clearForm(taskForm);
    showToast('Task saved locally. Syncing...', 'info'); // Optional: show saving status

    // 2. DO ALL HEAVY OPERATIONS IN BACKGROUND
    try {
        if (editIndex === '') {
            // Save to IndexedDB first (this should be fast)
            await addTask(task);
            
            // Update local tasks array
            tasks = await getAllTasks();
            
            // Update UI immediately
            lastRenderHash = ''; 
            await renderTasks(tasks);
            
            // Show success message
            showToast('Task added successfully!', 'success');
            
            // Background operations (don't await these - let them run async)
            Promise.all([
                // Banner check
                (async () => {
                    const wasEmpty = tasks.filter(t => !t.id.startsWith('customTask')).length === 1;
                    if (wasEmpty && customTaskBanner) {
                        await setSetting('hasCustomTasks', 'true');
                        hasCustomTasks = true;
                        customTaskBanner.classList.remove('hidden');
                        customTaskBanner.classList.add('active');
                        await setSetting('firstCustomTaskAdded', 'true');
                    }
                })(),
                
                // Settings update (background)
                setSetting('taskCounter', taskCounter.toString()),
                saveDailyData(),
                
                // Profile updates (background) - these can be slow
                (async () => {
                    if (isAuthenticated()) {
                        try {
                            await setSetting('userHasCreatedTasks', 'true');
                            await updateUserProfileFlag(true);
                        } catch (error) {
                            console.error('Background profile update failed:', error);
                        }
                    }
                })(),
                
                // Notification (background)
                triggerNotification(task)
            ]).catch(error => {
                console.error('Background operations failed:', error);
                // Don't show error to user since main task was saved successfully
            });
            
        } else {
            // Edit task
            await updateTask(task);
            tasks = await getAllTasks();
            
            // Update UI immediately
            lastRenderHash = ''; 
            await renderTasks(tasks);
            showToast('Task updated successfully!', 'success');
            
            // Background operations
            Promise.all([
                setSetting('taskCounter', taskCounter.toString()),
                saveDailyData(),
                triggerNotification(task),
                
                // Profile updates (background)
                (async () => {
                    if (isAuthenticated()) {
                        try {
                            await setSetting('userHasCreatedTasks', 'true');
                            await updateUserProfileFlag(true);
                        } catch (error) {
                            console.error('Background profile update failed:', error);
                        }
                    }
                })()
            ]).catch(error => {
                console.error('Background operations failed:', error);
            });
        }

        // Sync operations (background) - don't block UI
        if (isAuthenticated() && navigator.onLine) {
            syncPendingTasks().catch(error => {
                console.error('Background sync failed:', error);
                showToast('Task saved locally, sync will retry later', 'warning');
            });
        } else {
            syncTasksWithServiceWorker().catch(error => {
                console.error('Background SW sync failed:', error);
            });
        }

    } catch (error) {
        console.error('Error saving task:', error);
        showToast('Failed to save task. Please try again.', 'error');
        
        // Reopen form if critical save failed
        taskForm.classList.add('active');
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

    // CLOSE MODAL IMMEDIATELY
    editTaskModal.classList.remove('active');
    clearForm(editTaskModal);
    showToast('Updating task...', 'info');

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
        
        // Update UI immediately
        lastRenderHash = '';
        renderTasks();
        showToast('Task updated successfully!', 'success');
        
        // Background operations
        Promise.all([
            saveDailyData(),
            syncTasksWithServiceWorker(),
            triggerNotification(task),
            
            // Profile update (background)
            (async () => {
                if (isAuthenticated()) {
                    try {
                        await setSetting('userHasCreatedTasks', 'true');
                        await updateUserProfileFlag(true);
                    } catch (error) {
                        console.error('Background profile update failed:', error);
                    }
                }
            })()
        ]).catch(error => {
            console.error('Background operations failed:', error);
        });
        
    } catch (error) {
        console.error('Error saving edited task:', error);
        showToast('Failed to save task. Please try again.', 'error');
        // Reopen modal if critical save failed
        editTaskModal.classList.add('active');
    }
});

/* Cancel edit */
cancelEditBtn.addEventListener('click', () => {
    editTaskModal.classList.remove('active');
    clearForm(editTaskModal);
    document.getElementById('editTaskIndex').value = '';
});

/* Help/FAQ button functionality */
resetDefaultBtn.addEventListener('click', function() {
    window.location.href = 'help.html';
});



/* Show stats panel */
showReportBtn.addEventListener('click', () => {
    const isActive = statsPanel.classList.contains('active');
    statsPanel.classList.toggle('active', !isActive);
    renderStats();
    if (!isActive) {
        statsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
});

// Add this at the top of your file - cache for user profiles
let profileCache = {
    displayName: null,
    lastUpdated: null
};

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
    const newEnableReminders = enableRemindersInput.checked;

    // Validation
    if (newUserName.length > 50) {
        showToast('Name too long. Maximum 50 characters.');
        return;
    }

    // 1. CLOSE MODAL IMMEDIATELY - Give instant feedback
    settingsModal.classList.remove('active');
    showToast('Saving settings...', 'info');

    try {
        // 2. FAST LOCAL OPERATIONS (await these)
        await setSetting('userName', newUserName);
        await setSetting('enableReminders', newEnableReminders.toString());
        
        // Update local variables
        userName = newUserName;
        enableReminders = newEnableReminders;
        
        console.log('✅ Local settings saved: enableReminders=', enableReminders, 'userName=', newUserName);

        // Show immediate success for local save
        showToast('Settings saved locally!', 'success');

        // Dispatch custom event for settings change
        document.dispatchEvent(new CustomEvent('settingsChange', {
            detail: { setting: 'enableReminders', value: newEnableReminders.toString() }
        }));

        // 3. BACKGROUND OPERATIONS (don't await - let them run async)
        
        // Background: Supabase profile update with caching
        if (isAuthenticated() && user?.id) {
            const shouldUpdateProfile = (
                profileCache.displayName !== newUserName || 
                !profileCache.lastUpdated || 
                Date.now() - profileCache.lastUpdated > 60000 // Update if older than 1 minute
            );

            if (shouldUpdateProfile) {
                updateUserProfileInBackground(newUserName).catch(error => {
                    console.error('Background profile update failed:', error);
                    showToast('Settings saved locally. Profile sync will retry later.', 'warning');
                });
            } else {
                console.log('⚡ Skipping profile update - same name in cache');
                showToast('Settings updated!', 'success');
            }
        } else {
            console.log('Guest user - using local storage only');
            showToast('Settings updated!', 'success');
        }

        // Background: Handle notification permissions
        handleNotificationPermissions(wasEnabled, enableReminders).catch(error => {
            console.error('Notification permission handling failed:', error);
        });

        // Background: Service worker sync
        syncTasksWithServiceWorker().catch(error => {
            console.error('Service worker sync failed:', error);
        });

    } catch (error) {
        console.error('Error saving settings locally:', error);
        showToast('Failed to save settings. Please try again.', 'error');
        
        // Reopen modal if critical local save failed
        settingsModal.classList.add('active');
        userNameInput.value = userName; // Reset to previous value
        enableRemindersInput.checked = enableReminders;
    }
});

// Separate function for background profile update with caching
async function updateUserProfileInBackground(newUserName) {
    console.log('🔄 Updating user profile in background:', newUserName);
    
    try {
        const { data, error } = await supabase
            .from('profiles')
            .upsert({ 
                id: user.id,
                display_name: newUserName,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'id'
            });

        if (error) {
            throw error;
        }

        // Update cache on success
        profileCache.displayName = newUserName;
        profileCache.lastUpdated = Date.now();
        
        console.log('✅ Profile updated successfully at the database');
        showToast('Profile synced to cloud!', 'success');
        
    } catch (error) {
        console.error('❌ Failed to update profile:', error);
        throw error; // Re-throw so caller can handle
    }
}

// Separate function for notification permission handling
async function handleNotificationPermissions(wasEnabled, enableReminders) {
    if (enableReminders && !wasEnabled) {
        try {
            const permission = await Notification.requestPermission();
            await setSetting('notificationPermission', permission);
            console.log('Notification permission:', permission);
            
            if (permission === 'denied') {
                // Update UI to show error
                permissionError.style.display = 'block';
                
                // Reset the setting
                enableRemindersInput.checked = false;
                enableReminders = false;
                await setSetting('enableReminders', 'false');
                
                showToast('Notifications blocked. Enable in browser settings.', 'warning');
            } else {
                permissionError.style.display = 'none';
                await syncTasksWithServiceWorker();
                debouncedCheckNotifications();
                showToast('Notifications enabled!', 'success');
            }
        } catch (error) {
            console.error('Notification permission error:', error);
            showToast('Failed to set notification permissions', 'warning');
        }
    } else {
        // Just sync for any other settings change
        await syncTasksWithServiceWorker();
    }
}

/* Cancel settings */
cancelSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('active');
    userNameInput.value = userName;
    enableRemindersInput.checked = enableReminders;
    permissionError.style.display = 'none';
});

// Optional: Add function to clear profile cache when user logs out
export function clearProfileCache() {
    profileCache = {
        displayName: null,
        lastUpdated: null
    };
}

// Optional: Add function to preload profile cache when user logs in
export async function preloadProfileCache() {
    if (!isAuthenticated() || !user?.id) return;
    
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', user.id)
            .single();

        if (data && !error) {
            profileCache.displayName = data.display_name;
            profileCache.lastUpdated = Date.now();
            console.log('✅ Profile cache preloaded:', data.display_name);
        }
    } catch (error) {
        console.error('Failed to preload profile cache:', error);
    }
}

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
                // Mark for deletion instead of deleting immediately
                await markTaskAsPendingDelete(task.id);
                await syncPendingTasks(); // Push DELETE to Supabase

                // Update local array
                tasks = tasks.filter(t => t.id !== task.id);

                // If no tasks remain, show empty state
if (tasks.length === 0) {
    console.log('All tasks deleted - showing empty state');
    hasCustomTasks = false;
    await setSetting('hasCustomTasks', 'false');
    await setSetting('firstCustomTaskAdded', 'false');
    if (customTaskBanner) {
        customTaskBanner.classList.add('hidden');
        customTaskBanner.classList.remove('active');
    }
    // Don't load any defaults - just show empty UI
}

                console.log(
                    `Deleted task "${task.name}", tasks now: [${tasks.map(t => t.name).join(', ')}]`
                );

                await saveDailyData();
                lastRenderHash = '';
                renderTasks();
                await syncTasksWithServiceWorker(); // Still sync with SW after local changes
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

document.getElementById('mobileResetDefaultBtn')?.addEventListener('click', function() {
    window.location.href = 'help.html';
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
// Handle Contact Developer link - redirect to help page
document.addEventListener('DOMContentLoaded', function() {
    const contactLink = document.getElementById('contactDeveloper');
    
    if (contactLink) {
        contactLink.addEventListener('click', function(e) {
            e.preventDefault();
            // Redirect to help.html with parameters to open contact form
            window.location.href = 'help.html?openContact=true#contact';
        });
    }
});
// Back to Top Button Functionality
const backToTopBtn = document.getElementById('backToTopBtn');

if (backToTopBtn) {
    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            backToTopBtn.classList.add('visible');
        } else {
            backToTopBtn.classList.remove('visible');
        }
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


function listenForSettingsChange() {
    document.addEventListener('settingsChange', async (event) => {
        if (event.detail.setting === 'enableReminders' && event.detail.value === 'true') {
            console.log('FCM: enableReminders toggled to true, attempting token registration');
            try {
                const token = await registerFCMToken();
                if (token) {
                    showToast('Notifications enabled successfully!', 'success');
                } else {
                    showToast('Failed to enable notifications. Please try again.', 'warning');
                }
            } catch (error) {
                console.error('FCM: Error registering token after settings change:', error);
                showToast('Failed to enable notifications. Please try again.', 'error');
            }
        }
    });
}

// Call  during app initialization
listenForSettingsChange();

/* Updated init function - Different strategies for auth vs guest */ 
async function init() {     
    try {         
        initGlobalUtils();         
        await initAuth();                  
        
        // Initialize the offline queue system         
        await initOfflineQueue();                  
        
        // Initialize FCM manager         
        await initFCMManager();                  
        
        // Start listening for settings changes
        listenForSettingsChange();
        
        // Load lastResetDate from IndexedDB at startup         
        const savedResetDate = await getSetting('lastResetDate');         
        const currentDate = new Date().toDateString();          
        
        // If we haven't reset yet today, do it immediately on startup         
        if (savedResetDate !== currentDate) {             
            await checkDateChange();         
        }          
        
        // Always schedule daily reset checks         
        setInterval(checkDateChange, 30000);          
        
        // PRELOAD PROFILE CACHE: If user is already authenticated on page load
        if (isAuthenticated()) {
            console.log("Authenticated user detected on init - preloading profile cache");
            try {
                await preloadProfileCache();
            } catch (error) {
                console.error('Failed to preload profile cache on init:', error);
            }
        }
        
        // CRITICAL: Different notification strategies based on auth status         
        if (isAuthenticated()) {             
            console.log("Authenticated user: FCM backend handles all notifications");             
            // No local notification polling for authenticated users         
        } else {             
            console.log("Guest user: enabling local notification polling");             
            // Enable local notification checking for guests             
            setInterval(debouncedCheckNotifications, 30000);         
        }              
        
    } catch (error) {         
        console.error('App initialization failed:', error);         
        showToast('Failed to initialize app completely. Some features may not work.');     
    } 
}

init();