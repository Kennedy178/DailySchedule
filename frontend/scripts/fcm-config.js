// FCM Configuration for GetItDone App
// Firebase SDK v10+ with ES6 modules

// Import Firebase SDK modules from CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js';

// Firebase configuration object
const firebaseConfig = {
    apiKey: "AIzaSyBL7ZdipX5Z5z-UPmUoAwbqpjRGrauR_9Q",
    authDomain: "getitdone-app1.firebaseapp.com",
    projectId: "getitdone-app1",
    storageBucket: "getitdone-app1.firebasestorage.app",
    messagingSenderId: "1032846385304",
    appId: "1:1032846385304:web:453509185bcae58974f0ed"
};

// VAPID public key
const vapidKey = "BB3SzmzGaTIXMAQrL-de8FFixvIzyx99Hs0ItX814rdkSHErri81KYqkr1l6g4JcAEezdPo2Q-ZCYc3gga9yttM";

// Initialize Firebase app
let app;
let messaging;

try {
    // Initialize Firebase
    app = initializeApp(firebaseConfig);
    console.log('Firebase initialized successfully');
    
    // Initialize messaging service
    messaging = getMessaging(app);
    console.log('Firebase messaging initialized successfully');
} catch (error) {
    console.error('Firebase initialization failed:', error);
    // Graceful fallback - app will work without FCM
    messaging = null;
}




// CRITICAL: Handle foreground messages - Show toast instead of notification
if (messaging) {
    onMessage(messaging, (payload) => {
        console.log('FCM: Foreground message received:', payload);
        
        // Check if this is a queued/stale message by detecting app startup
        const timeSincePageLoad = Date.now() - performance.timeOrigin
;
        
        // If app was just opened (within 1 minute) and we're getting messages,
        // they're likely queued from when browser was closed
        if (timeSincePageLoad < 20000) {
            console.log('FCM: Skipping direct FCM notification - app just opened, likely stale message');
            return;
        }
        
        handleForegroundMessage(payload);
    });
}

// Listen for messages from service worker (for better focus detection)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        console.log('FCM: Message from service worker:', event.data);
        
        // Handle ping from service worker to verify app is responsive
        if (event.data === 'ping') {
            console.log('FCM: Responding to service worker ping');
            event.ports[0].postMessage('pong');
            return;
        }
        
        if (event.data.type === 'FCM_FOREGROUND_MESSAGE') {
            console.log('FCM: Service worker forwarded foreground message');
            handleForegroundMessage(event.data.payload);
        }
    });
}

// Unified function to handle foreground messages
function handleForegroundMessage(payload) {
    // Check if this is a queued/stale message by detecting app startup
    // If we just opened the app and immediately got messages, they're likely stale
    const timeSincePageLoad = Date.now() - performance.timeOrigin
;
    
    // If app was just opened (within 5 seconds) and we're getting messages,
    // they're likely queued from when browser was closed
    if (timeSincePageLoad < 20000) {
        console.log('FCM: Skipping notification - app just opened, likely stale message');
        return;
    }
    
    // Extract data from the payload (backend sends data-only)
    const title = payload.data?.title || 'Task Reminder';
    const body = payload.data?.body || 'You have a task reminder';
    const taskName = payload.data?.task_name || '';
    const priority = payload.data?.priority || '';
         
    console.log('FCM: Showing foreground toast:', title, body);
         
    // Show toast instead of notification when app is in focus
    showTaskReminderToast(title, body, taskName, priority);
}

// Toast notification function (keep your existing function unchanged)
function showTaskReminderToast(title, message, taskName, priority) {
    // Remove any existing toast
    const existingToast = document.getElementById('task-reminder-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.id = 'task-reminder-toast';
    toast.className = `task-reminder-toast priority-${priority?.toLowerCase() || 'medium'}`;
    
    // Priority colors and icons - FULLY OPAQUE BACKGROUNDS
    const priorityConfig = {
        high: { 
            color: '#FF4757',           
            icon: '🚨', 
            bgColor: '#1A0F0F',        // SOLID dark red - no transparency
            borderColor: '#FF4757'     
        },
        medium: { 
            color: '#FFA726',          
            icon: '⚡', 
            bgColor: '#1A1410',        // SOLID dark orange - no transparency
            borderColor: '#FFA726'     
        },
        low: { 
            color: '#26C281',          
            icon: '💡', 
            bgColor: '#0F1A12',        // SOLID dark green - no transparency
            borderColor: '#26C281'     
        }
    };
    
    const config = priorityConfig[priority?.toLowerCase()] || priorityConfig.medium;
    
    toast.innerHTML = `
        <div class="toast-content">
            <div class="toast-icon" style="color: ${config.color}">
                ${config.icon}
            </div>
            <div class="toast-text">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" onclick="this.parentElement.parentElement.remove()">
                ×
            </button>
        </div>
        <div class="toast-progress" style="background: linear-gradient(90deg, ${config.color} 0%, ${config.color}80 100%);"></div>
    `;
    
    // COMPLETELY OPAQUE STYLING - NO GLASSMORPHISM
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${config.bgColor};
        border: 2px solid ${config.borderColor};
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.8), 0 0 30px ${config.color}30;
        z-index: 10000;
        min-width: 320px;
        max-width: 400px;
        animation: slideInRight 0.3s ease-out;
    `;
    
    // Add animation styles to document if not exists
    if (!document.getElementById('toast-styles')) {
        const styles = document.createElement('style');
        styles.id = 'toast-styles';
        styles.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
            
            .toast-content {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                margin-bottom: 8px;
            }
            
            .toast-icon {
                font-size: 20px;
                flex-shrink: 0;
                margin-top: 2px;
            }
            
            .toast-text {
                flex: 1;
                min-width: 0;
            }
            
            .toast-title {
                font-weight: 600;
                font-size: 14px;
                color: #FFFFFF;
                margin-bottom: 4px;
            }
            
            .toast-message {
                font-size: 13px;
                color: #E0E0E0;
                line-height: 1.4;
                word-wrap: break-word;
            }
            
            .toast-close {
                background: none;
                border: none;
                font-size: 18px;
                color: #9ca3af;
                cursor: pointer;
                padding: 0;
                margin-left: 8px;
                flex-shrink: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: all 0.2s;
            }
            
            .toast-close:hover {
                background: rgba(255,255,255,0.15);
                color: #FFFFFF;
            }
            
            .toast-progress {
                height: 3px;
                border-radius: 0 0 12px 12px;
                margin: 0 -16px -16px -16px;
                animation: shrinkProgress 25s linear forwards;
            }
            
            @keyframes shrinkProgress {
                from { width: 100%; }
                to { width: 0%; }
            }
        `;
        document.head.appendChild(styles);
    }
    
    // Add to page
    document.body.appendChild(toast);
    
    // Auto-remove after 25 seconds with animation
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'slideOutRight 0.3s ease-in forwards';
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 300);
        }
    }, 25000);
    
    // Optional: Play a subtle sound
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DrwmwhBDOR2O/CdygEMrJEAAA=');
        audio.volume = 0.1;
        audio.play().catch(() => {});
    } catch (e) {}
}










// Custom function to get token using existing service worker
export async function getTokenWithCustomSW(vapidKey) {
    if (!messaging) {
        console.log('FCM: Messaging not available');
        return null;
    }
    
    try {
        // Get our existing service worker registration
        const registration = await navigator.serviceWorker.getRegistration();
        
        if (!registration) {
            throw new Error('No service worker registered');
        }
        
        console.log('FCM: Using existing service worker for token generation');
        
        // Get token using our existing service worker
        const token = await getToken(messaging, {
            vapidKey,
            serviceWorkerRegistration: registration
        });
        
        return token;
    } catch (error) {
        console.error('FCM: Token generation failed:', error);
        return null;
    }
}

// Helper function to check if FCM is available
export function isFCMAvailable() {
    return messaging !== null && 'serviceWorker' in navigator && 'Notification' in window;
}

// Helper function to get VAPID key
export function getVapidKey() {
    return vapidKey;
}

// Export configured instances
export {
    app as firebaseApp,
    messaging,
    firebaseConfig,
    vapidKey
};

// Export Firebase messaging functions for use in other modules
export {
    getToken,
    onMessage
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js';