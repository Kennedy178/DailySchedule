import * as idb from 'https://cdn.jsdelivr.net/npm/idb@7.0.2/+esm';
import { dbPromise, DB_NAME } from './db.js';

const AUTH_STORE = 'auth_store';

class AuthStateManager {
    constructor() {
        this.dbPromise = dbPromise; // Use existing database connection
    }

async saveAuthState(sessionData) {
    try {
        // sessionData should include both session and mode
        const db = await this.dbPromise;
        const tx = db.transaction('auth_store', 'readwrite');
        const store = tx.objectStore('auth_store');
        
        const dataToStore = {
            session: sessionData.session || sessionData, // Handle both new and old format
            selectedMode: sessionData.selectedMode || sessionData.mode,
            lastUsed: Date.now()
        };
        
        // Save to IndexedDB
        await store.put(dataToStore, 'currentSession');
        await tx.complete;
        console.log('✅ Auth state saved to IndexedDB with mode:', dataToStore.selectedMode);
        
        // Sync with Service Worker
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            try {
                navigator.serviceWorker.controller.postMessage({
                    type: 'SYNC_AUTH_STATE',
                    state: dataToStore
                });
                console.log('✅ Auth state synced with service worker');
            } catch (swError) {
                console.error('⚠️ Failed to sync auth state with service worker:', swError);
                // Non-critical error - app can continue working
            }
        } else {
            console.log('ℹ️ Service worker not available for sync');
        }
        
        return dataToStore;
        
    } catch (error) {
        console.error('❌ Failed to save auth state:', error);
        throw error; // Re-throw so caller can handle
    }
}

    async getAuthState() {
        const db = await this.dbPromise;
        const tx = db.transaction('auth_store', 'readonly');
        const store = tx.objectStore('auth_store');
        const state = await store.get('currentSession');
        await tx.complete;
        console.log('Retrieved auth state from IndexedDB:', 
                    state ? `mode: ${state.selectedMode}` : 'no state');
        return state;
    }

    async clearAuthState() {
        const db = await this.dbPromise;
        const tx = db.transaction('auth_store', 'readwrite');
        const store = tx.objectStore('auth_store');
        await store.delete('currentSession');
        await tx.complete;
        console.log('Auth state cleared from IndexedDB');
    }
}

export const authStateManager = new AuthStateManager();