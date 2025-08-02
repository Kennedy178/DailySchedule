let today = new Date().toDateString();
    let hoveredLabel = null;

    let lastCheckDate = localStorage.getItem('lastCheckDate') || today;
    let userName = localStorage.getItem('userName') || 'you';
    let enableReminders = localStorage.getItem('enableReminders') === 'true';
    let taskCounter = parseInt(localStorage.getItem('taskCounter') || '0');
    let tasks = [];
    let hasCustomTasks = localStorage.getItem('hasCustomTasks') === 'true';
    let lateTaskIndex = null;
    let isCelebrating = false;
    let lastRenderHash = '';
    let deferredPrompt = null;
    let confettiAnimation;
    let statsChart = null;
    let lastProgressUpdate = 0;
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
    const errorToast = document.createElement('div');
    errorToast.id = 'errorToast';
    errorToast.style.cssText = `
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(20, 20, 20, 0.9);
        color: #E5E5E5; padding: 10px 20px; border-radius: 8px; z-index: 6000; display: none;
        font-family: 'Inter', sans-serif; font-size: clamp(12px, 3vw, 14px); box-shadow: 0 4px 12px rgba(255, 177, 0, 0.25);
    `;
    document.body.appendChild(errorToast);

    const defaultTasks = [
        { startTime: '06:00', endTime: '06:30', name: 'Morning Nature Walk/Virtual 🌳', category: 'Health', priority: 'Medium', id: 'task1', checked: false, isLate: false },
        { startTime: '06:30', endTime: '07:15', name: 'Workout + Shower 🏋️‍♂️🚿', category: 'Fitness', priority: 'Medium', id: 'task2', checked: false, isLate: false },
        { startTime: '07:15', endTime: '07:45', name: 'Cooking Breakfast & Quick Chat Break 🍳 💬', category: 'Routine', priority: 'Medium', id: 'task3', checked: false, isLate: false },
        { startTime: '07:45', endTime: '09:00', name: 'Data Science/ML Study 📖', category: 'Learning', priority: 'High', id: 'task4', checked: false, isLate: false },
        { startTime: '09:00', endTime: '10:30', name: 'Focused Project Work 💻', category: 'Project', priority: 'High', id: 'task5', checked: false, isLate: false },
        { startTime: '10:30', endTime: '12:30', name: 'Data Science/ML Study 📖', category: 'Learning', priority: 'High', id: 'task7', checked: false, isLate: false },
        { startTime: '12:30', endTime: '13:30', name: 'Lunch Cooking & Eating 🍲', category: 'Routine', priority: 'Medium', id: 'task8', checked: false, isLate: false },
        { startTime: '13:30', endTime: '14:30', name: 'Financial Education 📈', category: 'Finance', priority: 'High', id: 'task9', checked: false, isLate: false },
        { startTime: '14:30', endTime: '15:00', name: 'Chat Break 💬', category: 'Social', priority: 'Low', id: 'task10', checked: false, isLate: false },
        { startTime: '15:00', endTime: '16:30', name: 'Professional Networking (LinkedIn/X/Medium/Github) + Article Writing 🌐', category: 'Professional', priority: 'High', id: 'task11', checked: false, isLate: false },
        { startTime: '16:30', endTime: '17:00', name: 'Data Science/ML Study 💻', category: 'Project', priority: 'High', id: 'task12', checked: false, isLate: false },
        { startTime: '17:00', endTime: '19:00', name: 'Movie/Walk/Sports Break 🎬🏀 while making dinner', category: 'Leisure', priority: 'Low', id: 'task13', checked: false, isLate: false },
        { startTime: '19:00', endTime: '19:30', name: 'Evening Workout + Shower 🏋️‍♂️🚿', category: 'Routine', priority: 'Medium', id: 'task14', checked: false, isLate: false },
        { startTime: '19:30', endTime: '20:15', name: 'Eat Dinner + Social Media Check-in 📰 + Chat Break 💬', category: 'Routine', priority: 'Medium', id: 'task15', checked: false, isLate: false },
        { startTime: '20:15', endTime: '22:30', name: 'Project Work 💻', category: 'Project', priority: 'High', id: 'task16', checked: false, isLate: false },
        { startTime: '22:30', endTime: '23:00', name: 'Reflection & Goal Setting for Tomorrow 🔮', category: 'Personal Growth', priority: 'High', id: 'task17', checked: false, isLate: false },
        { startTime: '23:30', endTime: '05:30', name: 'Sleep 🌙', category: 'Health', priority: 'High', id: 'task18', checked: false, isLate: false }
    ];

    function showToast(message) {
        errorToast.textContent = message;
        errorToast.style.display = 'block';
        setTimeout(() => errorToast.style.display = 'none', 5000);
    }

    function loadTasks() {
    today = new Date().toDateString();
    try {
        if (hasCustomTasks) {
            const savedTasks = localStorage.getItem('customTasks');
            tasks = savedTasks ? JSON.parse(savedTasks) : [];
        } else {
            tasks = defaultTasks.map(task => ({
                ...task,
                checked: localStorage.getItem(task.id) === 'true' || false,
                isLate: localStorage.getItem(`${task.id}_isLate`) === 'true' || false
            }));
        }
        tasks = sortTasksByTime(tasks);
        console.log('Loaded tasks:', tasks.map(t => t.name));
        syncTasksWithServiceWorker();
        renderTasks();
        checkNotifications();
    } catch (error) {
        console.error('Error loading tasks:', error);
        showToast('Failed to load tasks. Please reset to default.');
    }
}

    function saveTasks() {
    try {
        // Validate tasks before saving
        tasks.forEach((task, index) => {
            if (!task.id || typeof task.checked !== 'boolean' || typeof task.isLate !== 'boolean' ||
                !task.startTime || !task.endTime || !task.name || !task.category || !task.priority) {
                throw new Error(`Invalid task at index ${index}: ${JSON.stringify(task)}`);
            }
        });
        localStorage.setItem('customTasks', JSON.stringify(tasks));
        localStorage.setItem('hasCustomTasks', hasCustomTasks);
        localStorage.setItem('taskCounter', taskCounter);
        tasks.forEach(task => {
            localStorage.setItem(task.id, task.checked);
            localStorage.setItem(`${task.id}_isLate`, task.isLate);
        });
        saveDailyData();
        syncTasksWithServiceWorker();
        checkNotifications();
    } catch (error) {
        console.error('Error saving tasks:', error.message, error.stack);
        if (error.name === 'QuotaExceededError') {
            showToast('Storage full. Clear some tasks or reset to default.');
        } else {
            showToast('Failed to save tasks. Check console for details.');
        }
        throw error;
    }
}


    function cleanOldData() {
        const now = new Date();
        for (let i = 7; i <= 30; i++) {
            const date = new Date(now);
            date.setDate(now.getDate() - i);
            const dateKey = `tasks_${date.toDateString()}`;
            const completionKey = `completion_${date.toDateString()}`;
            const timelyKey = `timely_${date.toDateString()}`;
            const lateKey = `late_${date.toDateString()}`;
            localStorage.removeItem(dateKey);
            localStorage.removeItem(completionKey);
            localStorage.removeItem(timelyKey);
            localStorage.removeItem(lateKey);
        }
    }

    function sortTasksByTime(tasks) {
        return tasks.sort((a, b) => {
            const getMinutesSinceMidnight = time => {
                const [hours, minutes] = time.split(':').map(Number);
                return hours * 60 + minutes;
            };
            return getMinutesSinceMidnight(a.startTime) - getMinutesSinceMidnight(b.startTime);
        });
    }

    function isTaskExpired(task, now) {
        const [hours, minutes] = task.endTime.split(':').map(Number);
        const endDate = new Date(now);
        endDate.setHours(hours, minutes, 0, 0);
        const gracePeriod = 15 * 60 * 1000;
        return now > new Date(endDate.getTime() + gracePeriod);
    }

    function isValidTimeRange(startTime, endTime) {
        if (!startTime || !endTime) return false;
        const start = new Date(`1970-01-01T${startTime}:00`);
        const end = new Date(`1970-01-01T${endTime}:00`);
        return start < end;
    }

    function isTaskStartingSoon(task, now) {
        const [hours, minutes] = task.startTime.split(':').map(Number);
        const startDate = new Date(now);
        startDate.setHours(hours, minutes, 0, 0);
        const timeDiff = startDate.getTime() - now.getTime();
        console.log(`Checking notification for task "${task.name}": timeDiff=${timeDiff}ms, startingSoon=${timeDiff >= 0 && timeDiff <= 10 * 60 * 1000}`);
        return timeDiff >= 0 && timeDiff <= 10 * 60 * 1000; // 10 minutes before start
    }

    function syncTasksWithServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.warn('Service worker not supported by browser');
        return;
    }
    if (navigator.serviceWorker.controller) {
        const syncTasks = tasks.filter(task => !task.checked && !isTaskExpired(task, new Date())).map(t => ({
            id: t.id,
            startTime: t.startTime,
            name: t.name,
            priority: t.priority
        }));
        console.log('Syncing tasks with service worker:', syncTasks.map(t => t.name));
        navigator.serviceWorker.controller.postMessage({
            type: 'SYNC_TASKS',
            tasks: syncTasks,
            userName,
            enableReminders
        });
    } else {
        console.warn('Service worker controller not available, checking registration');
        navigator.serviceWorker.getRegistration('sw.js').then(reg => {
            if (reg && reg.active) {
                console.log('Service worker found, syncing tasks');
                navigator.serviceWorker.controller = reg.active;
                const syncTasks = tasks.filter(task => !task.checked && !isTaskExpired(task, new Date())).map(t => ({
                    id: t.id,
                    startTime: t.startTime,
                    name: t.name,
                    priority: t.priority
                }));
                reg.active.postMessage({
                    type: 'SYNC_TASKS',
                    tasks: syncTasks,
                    userName,
                    enableReminders
                });
            } else {
                console.warn('No active service worker, registering sw.js');
                navigator.serviceWorker.register('sw.js').then(reg => {
                    console.log('Service worker registered:', reg);
                }).catch(err => {
                    console.error('Service worker registration failed:', err);
                    showToast('Service worker failed to register. Notifications may not work.');
                });
            }
        }).catch(err => {
            console.error('Error checking service worker registration:', err);
        });
    }
}

// Updated Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(reg => {
            console.log('Service Worker registered:', reg);
            if (reg.active) {
                console.log('Service worker active, syncing tasks');
                syncTasksWithServiceWorker();
            }
            if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
                Notification.requestPermission().then(permission => {
                    localStorage.setItem('notificationPermission', permission);
                    console.log('Initial notification permission:', permission);
                    if (permission === 'denied') {
                        permissionError.style.display = 'block';
                        enableRemindersInput.checked = false;
                        enableReminders = false;
                        localStorage.setItem('enableReminders', 'false');
                        showToast('Notifications blocked. Enable in browser settings.');
                    }
                    syncTasksWithServiceWorker();
                    checkNotifications();
                });
            } else {
                console.log('Notification permission on load:', Notification.permission);
                syncTasksWithServiceWorker();
                checkNotifications();
            }
        }).catch(err => {
            console.error('Service Worker registration failed:', err);
            showToast('Service worker failed to register. Notifications may not work.');
        });
    });
}

    function triggerNotification(task) {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller && enableReminders && isTaskStartingSoon(task, new Date())) {
        console.log(`Triggering notification for task "${task.name}" at ${task.startTime}`);
        navigator.serviceWorker.controller.postMessage({
            type: 'TRIGGER_NOTIFICATION',
            task: { id: task.id, startTime: task.startTime, name: task.name, priority: task.priority },
            userName
        });
    } else {
        console.log(`Notification skipped for task "${task.name}": serviceWorker=${!!navigator.serviceWorker.controller}, enableReminders=${enableReminders}, startingSoon=${isTaskStartingSoon(task, new Date())}`);
    }
}

    function checkNotifications() {
        console.log('Checking notifications for tasks:', tasks.map(t => t.name));
        console.log('Notification permission:', Notification.permission);
        console.log('Enable reminders:', enableReminders);
        tasks.forEach(task => {
            if (!task.checked && !isTaskExpired(task, new Date())) {
                triggerNotification(task);
            }
        });
    }

    function renderTasks() {
        const now = new Date();
        const taskHash = JSON.stringify(tasks.map(t => ({
            id: t.id,
            startTime: t.startTime,
            endTime: t.endTime,
            name: t.name,
            category: t.category,
            priority: t.priority,
            checked: t.checked,
            isLate: t.isLate,
            expired: isTaskExpired(t, now)
        })));
        if (taskHash === lastRenderHash) {
            console.log('Skipping render: no changes');
            return;
        }
        lastRenderHash = taskHash;
        console.log('Rendering tasks:', tasks.map(t => t.name));

        scheduleContainer.innerHTML = '';
        tasks.forEach((task, index) => {
            const isExpired = isTaskExpired(task, now);
            const taskDiv = document.createElement('div');
            taskDiv.className = `task task-added ${isExpired ? 'task-expired' : ''}`;
            taskDiv.setAttribute('data-index', index);
            taskDiv.innerHTML = `
                <h2>${task.startTime} – ${task.endTime}</h2>
                <p><input type="checkbox" id="${task.id}" aria-label="${task.name} task" ${task.checked ? 'checked' : ''} ${isExpired && !task.checked && !task.isLate ? 'disabled title="Time passed"' : ''}><label for="${task.id}"><strong>${task.name}</strong></label></p>
                <p class="category">${task.category}</p>
                <p>Priority: ${task.priority}</p>
                <div class="task-actions">
                    <button class="edit-btn" data-index="${index}" aria-label="Edit ${task.name}">✏️ Edit</button>
                    <button class="delete-btn" data-index="${index}" aria-label="Delete ${task.name}">🗑️ Delete</button>
                    ${isExpired && !task.checked && !task.isLate ? `<button class="complete-late-btn" data-index="${index}" aria-label="Complete ${task.name} late">🔓 Complete Late</button>` : ''}
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

    function initializeCheckboxes() {
    const now = new Date();
    const checkboxes = document.querySelectorAll('input[type="checkbox"]:not(#enableReminders)');
    console.log(`Initializing ${checkboxes.length} checkboxes, expected ${tasks.length}`);
    checkboxes.forEach(checkbox => {
        const task = tasks.find(t => t.id === checkbox.id);
        if (task) {
            checkbox.checked = task.checked;
            console.log(`Initialized checkbox ${checkbox.id}: checked=${task.checked}`);
        } else {
            console.warn(`No task found for checkbox ${checkbox.id}`);
        }
        checkbox.removeEventListener('change', handleCheckboxChange);
        checkbox.addEventListener('change', handleCheckboxChange);
    });
}

    function handleCheckboxChange(event) {
    const task = tasks.find(t => t.id === event.target.id);
    const now = new Date();
    if (task && (!isTaskExpired(task, now) || task.isLate)) {
        try {
            task.checked = event.target.checked;
            task.isLate = task.isLate && task.checked;
            localStorage.setItem(task.id, task.checked);
            localStorage.setItem(`${task.id}_isLate`, task.isLate);
            console.log(`Checkbox ${task.id} changed: checked=${task.checked}, isLate=${task.isLate}`);
            saveTasks();
            updateProgress();
        } catch (error) {
            console.error('Error updating checkbox:', error.message, error.stack);
            event.target.checked = !event.target.checked;
            task.checked = event.target.checked;
            showToast('Failed to update task. Check console for details.');
        }
    } else if (task && !task.isLate) {
        event.target.checked = false;
        showToast('Cannot check expired task. Mark as late if needed.');
    }
}

    function saveDailyData() {
        today = new Date().toDateString();
        try {
            const dateKey = `tasks_${today}`;
            localStorage.setItem(dateKey, JSON.stringify(tasks));
            const completed = tasks.filter(task => task.checked).length;
            const total = tasks.length;
            const timelyCompleted = tasks.filter(task => task.checked && !task.isLate).length;
            const lateCompleted = tasks.filter(task => task.checked && task.isLate).length;
            const percentage = total ? Math.round((completed / total) * 100) : 0;
            localStorage.setItem(`completion_${today}`, percentage);
            localStorage.setItem(`timely_${today}`, timelyCompleted);
            localStorage.setItem(`late_${today}`, lateCompleted);
            console.log(`Saved daily data: completed=${completed}, total=${total}, percentage=${percentage}`);
            cleanOldData();
        } catch (error) {
            console.error('Error saving daily data:', error);
            showToast('Failed to save daily data. Clear some tasks or reset to default.');
        }
    }

    function clearWeeklyData() {
        const now = new Date();
        for (let i = 0; i < 7; i++) {
            const date = new Date(now);
            date.setDate(now.getDate() - i);
            const dateKey = `tasks_${date.toDateString()}`;
            const completionKey = `completion_${date.toDateString()}`;
            const timelyKey = `timely_${date.toDateString()}`;
            const lateKey = `late_${date.toDateString()}`;
            localStorage.removeItem(dateKey);
            localStorage.removeItem(completionKey);
            localStorage.removeItem(timelyKey);
            localStorage.removeItem(lateKey);
        }
    }

    function getWeeklyStats() {
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
        const todayTasks = localStorage.getItem(todayKey);
        const todayPercentage = parseInt(localStorage.getItem(todayCompletionKey) || '0');
        const todayTimely = parseInt(localStorage.getItem(todayTimelyKey) || '0');
        const todayLate = parseInt(localStorage.getItem(todayLateKey) || '0');
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
            completedTasks += dailyTasks.filter(task => task.checked).length;
            dailyTasks.forEach(task => {
                if (!task.checked && isTaskExpired(task, now)) {
                    addTaskToDay(missedTasksByDay, todayName, task.name);
                } else if (task.isLate) {
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
            const tasksData = localStorage.getItem(dateKey);
            const percentage = parseInt(localStorage.getItem(completionKey) || '0');
            const timely = parseInt(localStorage.getItem(timelyKey) || '0');
            const late = parseInt(localStorage.getItem(lateKey) || '0');
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
                completedTasks += dailyTasks.filter(task => task.checked).length;
                dailyTasks.forEach(task => {
                    if (!task.checked && isTaskExpired(task, new Date(date))) {
                        addTaskToDay(missedTasksByDay, dayName, task.name);
                    } else if (task.isLate) {
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

    function renderStats() {
    today = new Date().toDateString();
    const stats = getWeeklyStats();
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

        
                // ✅ Only take last 7 days of data
        const last7Days = stats.days.slice(-7);

        // ✅ Build combined totals + keep breakdown for tooltip
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
                backgroundColor: 'rgba(75,192,192,0.06)', // ✅ subtle fill under line
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
                        // ✅ faint gridlines normally, brighter when hovered
                        return context.tick && context.tick.label === hoveredLabel
                            ? 'rgba(75,192,192,0.25)' // ✅ soft cyan glow for hover column
                            : 'rgba(255,255,255,0.05)';
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
                displayColors: false, // 🚫 removes the tiny color box
                callbacks: {
                    // ✅ keep breakdown tooltip
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
                    hoveredLabel = chartElements[0].element.$context.rawLabel; // save hovered label
                    statsChart.update('none'); // redraw gridlines instantly (no full reanimate)
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

    function fireConfetti() {
        if (isCelebrating) {
            console.log('Confetti already running, skipping');
            return;
        }
        const total = tasks.length;
        const completed = tasks.filter(task => task.checked).length;
        const percentage = total ? Math.round((completed / total) * 100) : 0;
        console.log(`Checking confetti: completed=${completed}, total=${total}, percentage=${percentage}, tasks=[${tasks.map(t => t.name).join(', ')}]`);
        if (percentage !== 100 || total === 0) {
            console.log(`Cannot start confetti: percentage=${percentage}, total=${total}`);
            return;
        }
        console.log('Starting confetti animation');
        isCelebrating = true;
        const startTime = Date.now();
        const duration = 20000; // 20 seconds
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
            const currentCompleted = tasks.filter(task => task.checked).length;
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

    function stopEffects() {
        console.log('Stopping effects');
        cancelAnimationFrame(confettiAnimation);
        canvas.style.display = 'none';
        congratsText.style.display = 'none';
        isCelebrating = false;
    }

    function updateProgress() {
        const now = Date.now();
        if (now - lastProgressUpdate < 200) {
            console.log('Progress update debounced');
            return;
        }
        lastProgressUpdate = now;

        const total = tasks.length;
        const completed = tasks.filter(task => task.checked).length;
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
            saveDailyData();
            if (statsPanel.classList.contains('active')) renderStats();
        } catch (error) {
            console.error('Error updating progress:', error);
            showToast('Failed to update progress. Clear some tasks or reset to default.');
        }
    }

    function checkDateChange() {
    const currentDate = new Date().toDateString();
    if (lastCheckDate !== currentDate && !isCelebrating) {
        try {
            tasks.forEach(task => {
                if (!task.isLate) {
                    task.checked = false;
                    localStorage.setItem(task.id, 'false');
                    localStorage.setItem(`${task.id}_isLate`, 'false');
                }
            });
            lastCheckDate = currentDate;
            localStorage.setItem('lastCheckDate', currentDate);
            saveTasks();
            lastRenderHash = '';
            console.log('Date changed, resetting tasks:', tasks.map(t => t.name));
            renderTasks();
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

    showFormBtn.addEventListener('click', () => {
        taskForm.classList.add('active');
        document.getElementById('editTaskIndex').value = '';
        document.getElementById('addTaskBtn').textContent = '✅ Save Task';
        taskForm.querySelector('h3').textContent = 'Create New Task';
        clearForm(taskForm);
        taskForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    function clearForm(form) {
        form.querySelectorAll('input:not([type="hidden"])').forEach(input => input.value = '');
        form.querySelectorAll('select').forEach(select => select.value = '');
        const customCategory = form.querySelector('#custom-category, #edit-custom-category');
        customCategory.style.display = 'none';
        customCategory.classList.remove('visible');
    }

    clearFormBtn.addEventListener('click', () => {
        clearForm(taskForm);
    });

    cancelFormBtn.addEventListener('click', () => {
        taskForm.classList.remove('active');
        clearForm(taskForm);
        document.getElementById('editTaskIndex').value = '';
        document.getElementById('addTaskBtn').textContent = '✅ Save Task';
        taskForm.querySelector('h3').textContent = 'Create New Task';
    });

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

   addTaskBtn.addEventListener('click', () => {
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const taskName = document.getElementById('taskName').value.trim();
    let category = document.getElementById('category').value;
    const customCategory = document.getElementById('custom-category').value.trim();
    const priority = document.getElementById('priority').value;
    const editIndex = document.getElementById('editTaskIndex').value;

    // Stricter time format  validation
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
        startTime,
        endTime,
        name: taskName,
        category,
        priority,
        checked: false,
        isLate: false,
        id: editIndex !== '' ? tasks[parseInt(editIndex)].id : `customTask${taskCounter++}`
    };

    try {
        if (editIndex === '') {
            if (!hasCustomTasks) {
                tasks = [];
                hasCustomTasks = true;
                localStorage.setItem('hasCustomTasks', 'true');
            }
            tasks.push(task);
            console.log(`Added task "${task.name}", tasks now: [${tasks.map(t => t.name).join(', ')}]`);
            triggerNotification(task);
        } else {
            tasks[parseInt(editIndex)] = task;
            console.log(`Edited task "${task.name}", tasks now: [${tasks.map(t => t.name).join(', ')}]`);
            triggerNotification(task);
        }
        tasks = sortTasksByTime(tasks);
        saveTasks();
        renderTasks();
        taskForm.classList.remove('active');
        clearForm(taskForm);
    } catch (error) {
        console.error('Error saving task:', error.message, error.stack);
        showToast('Failed to save task. Check console for details.');
    }
});
    saveEditBtn.addEventListener('click', () => {
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

        if (category === 'Custom' && !customCategory) {
            showToast('Please enter a custom category.');
            return;
        }

        if (!isValidTimeRange(startTime, endTime)) {
            showToast('End time must be after start time.');
            return;
        }

        category = category === 'Custom' ? customCategory : category;

        try {
            const task = {
                startTime,
                endTime,
                name: taskName,
                category,
                priority,
                checked: tasks[parseInt(editIndex)].checked,
                isLate: tasks[parseInt(editIndex)].isLate,
                id: tasks[parseInt(editIndex)].id
            };
            tasks[parseInt(editIndex)] = task;
            console.log(`Saved edited task "${task.name}", tasks now: [${tasks.map(t => t.name).join(', ')}]`);
            tasks = sortTasksByTime(tasks);
            saveTasks();
            renderTasks();
            editTaskModal.classList.remove('active');
            clearForm(editTaskModal);
        } catch (error) {
            console.error('Error saving edited task:', error);
            showToast('Failed to save task. Please try again.');
        }
    });

    cancelEditBtn.addEventListener('click', () => {
        editTaskModal.classList.remove('active');
        clearForm(editTaskModal);
        document.getElementById('editTaskIndex').value = '';
    });

    resetDefaultBtn.addEventListener('click', () => {
        if (confirm('Reset to default schedule? All custom tasks will be cleared.')) {
            try {
                hasCustomTasks = false;
                localStorage.setItem('hasCustomTasks', 'false');
                localStorage.removeItem('customTasks');
                localStorage.removeItem('taskCounter');
                taskCounter = 0;
                document.querySelectorAll('input[type="checkbox"]:not(#enableReminders)').forEach(box => {
                    localStorage.removeItem(box.id);
                });
                clearWeeklyData();
                tasks = defaultTasks.map(task => ({ ...task, checked: false, isLate: false }));
                console.log('Reset to default tasks:', tasks.map(t => t.name));
                saveTasks();
                renderTasks();
            } catch (error) {
                console.error('Error resetting to default:', error);
                showToast('Failed to reset to default. Please try again.');
            }
        }
    });

    showReportBtn.addEventListener('click', () => {
        const isActive = statsPanel.classList.contains('active');
        statsPanel.classList.toggle('active', !isActive);
        renderStats();
        if (!isActive) {
            statsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    showSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('active');
        enableRemindersInput.checked = enableReminders;
        userNameInput.value = userName;
        permissionError.style.display = localStorage.getItem('notificationPermission') === 'denied' ? 'block' : 'none';
        settingsModal.scrollIntoView({ behavior: 'smooth', block: 'start' });
        console.log('Settings opened: enableReminders=', enableReminders);
    });

    saveSettingsBtn.addEventListener('click', () => {
        const wasEnabled = enableReminders;
        const newUserName = userNameInput.value.trim() || 'you';
        enableReminders = enableRemindersInput.checked;

        try {
            localStorage.setItem('userName', newUserName);
            localStorage.setItem('enableReminders', enableReminders);
            userName = newUserName;

            console.log('Saving settings: enableReminders=', enableReminders, 'userName=', newUserName);

            if (enableReminders && !wasEnabled) {
                Notification.requestPermission().then(permission => {
                    localStorage.setItem('notificationPermission', permission);
                    console.log('Notification permission:', permission);
                    if (permission === 'denied') {
                        permissionError.style.display = 'block';
                        enableRemindersInput.checked = false;
                        enableReminders = false;
                        localStorage.setItem('enableReminders', 'false');
                        showToast('Notifications blocked. Enable in browser settings.');
                    } else {
                        permissionError.style.display = 'none';
                        syncTasksWithServiceWorker();
                        checkNotifications();
                    }
                });
            } else if (!enableReminders && wasEnabled) {
                syncTasksWithServiceWorker();
            } else if (newUserName !== userName) {
                syncTasksWithServiceWorker();
            }

            settingsModal.classList.remove('active');
        } catch (error) {
            console.error('Error saving settings:', error);
            showToast('Failed to save settings. Please try again.');
        }
    });

    cancelSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('active');
        userNameInput.value = userName;
        enableRemindersInput.checked = enableReminders;
        permissionError.style.display = 'none';
    });

    lateReasonInput.addEventListener('input', () => {
        modalConfirmBtn.disabled = !lateReasonInput.value.trim();
        modalError.style.display = lateReasonInput.value.trim() ? 'none' : 'block';
    });

    modalConfirmBtn.addEventListener('click', () => {
        if (lateReasonInput.value.trim() && lateTaskIndex !== null && lateTaskIndex >= 0 && lateTaskIndex < tasks.length) {
            try {
                const task = tasks[lateTaskIndex];
                task.checked = true;
                task.isLate = true;
                localStorage.setItem(task.id, 'true');
                const checkbox = document.getElementById(task.id);
                if (checkbox) {
                    checkbox.checked = true;
                    checkbox.disabled = false;
                }
                console.log(`Marked task "${task.name}" as late`);
                saveTasks();
                lastRenderHash = '';
                renderTasks();
                lateTaskModal.classList.remove('active');
                lateReasonInput.value = '';
                modalError.style.display = 'none';
                lateTaskIndex = null;
            } catch (error) {
                console.error('Error marking task as late:', error);
                showToast('Failed to mark task as late. Please try again.');
            }
        } else {
            modalError.style.display = 'block';
        }
    });

    modalCancelBtn.addEventListener('click', () => {
        lateTaskModal.classList.remove('active');
        lateTaskIndex = null;
        lateReasonInput.value = '';
        modalError.style.display = 'none';
    });

    function attachTaskActions() {
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.getAttribute('data-index'));
                const task = tasks[index];
                document.getElementById('edit-startTime').value = task.startTime;
                document.getElementById('edit-endTime').value = task.endTime;
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
            btn.addEventListener('click', () => {
                const index = parseInt(btn.getAttribute('data-index'));
                const task = tasks[index];
                if (confirm(`Delete "${task.name}"?`)) {
                    try {
                        localStorage.removeItem(task.id);
                        tasks.splice(index, 1);
                        if (tasks.length === 0) {
                            hasCustomTasks = false;
                            localStorage.setItem('hasCustomTasks', 'false');
                            tasks = defaultTasks.map(task => ({ ...task, checked: false, isLate: false }));
                        }
                        console.log(`Deleted task "${task.name}", tasks now: [${tasks.map(t => t.name).join(', ')}]`);
                        saveTasks();
                        lastRenderHash = '';
                        renderTasks();
                    } catch (error) {
                        console.error('Error deleting task:', error);
                        showToast('Failed to delete task. Please try again.');
                    }
                }
            });
        });
    }

    // Emoji Picker Initialization   
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

    // PWA Install Prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (localStorage.getItem('installPromptDismissed') !== 'true') {
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

    dismissInstallBtn.addEventListener('click', () => {
        localStorage.setItem('installPromptDismissed', 'true');
        installPrompt.classList.remove('active');
    });

    closeInstallPrompt.addEventListener('click', () => {
        localStorage.setItem('installPromptDismissed', 'true');
        installPrompt.classList.remove('active');
    });

    // Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').then(reg => {
                console.log('Service Worker registered:', reg);
                if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
                    Notification.requestPermission().then(permission => {
                        localStorage.setItem('notificationPermission', permission);
                        console.log('Initial notification permission:', permission);
                        if (permission === 'denied') {
                            permissionError.style.display = 'block';
                            enableRemindersInput.checked = false;
                            enableReminders = false;
                            localStorage.setItem('enableReminders', 'false');
                            showToast('Notifications blocked. Enable in browser settings.');
                        }
                        syncTasksWithServiceWorker();
                        checkNotifications();
                    });
                } else {
                    console.log('Notification permission on load:', Notification.permission);
                    syncTasksWithServiceWorker();
                    checkNotifications();
                }
            }).catch(err => {
                console.error('Service Worker registration failed:', err);
                showToast('Service Worker failed to register. Notifications may not work.');
            });
        });
    }



    
        // Window Resize Handling
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

    // Mobile dropdown functionality - NEW CODE STARTS HERE
    const moreOptionsBtn = document.querySelector('.more-options-btn');
    const mobileDropdown = document.querySelector('.mobile-dropdown');

    // Only add these event listeners if the mobile dropdown exists (mobile view)
    if (moreOptionsBtn && mobileDropdown) {
        // Toggle dropdown
        moreOptionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            mobileDropdown.classList.toggle('active');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (mobileDropdown.classList.contains('active') && 
                !e.target.closest('.mobile-dropdown')) {
                mobileDropdown.classList.remove('active');
            }
        });

        // Connect mobile buttons to same functionality as desktop buttons
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
   

    // Initialize App
    loadTasks();
    setInterval(checkDateChange, 30000);
    setInterval(checkNotifications, 30000); // Check notifications every 30 seconds