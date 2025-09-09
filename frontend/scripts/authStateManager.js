import * as idb from 'https://cdn.jsdelivr.net/npm/idb@7.0.2/+esm';
import { dbPromise, DB_NAME } from './db.js';

const AUTH_STORE = 'auth_store';

// First, add the auth store to your existing db.js upgrade function
// Update DB_VERSION to 3 and add this to the upgrade function:
/*
if (!db.objectStoreNames.contains('auth_store')) {
    db.createObjectStore('auth_store');
}
*/

class AuthStateManager {
    constructor() {
        this.dbPromise = dbPromise; // Use existing database connection
    }

    async saveAuthState(session) {
        const db = await this.dbPromise;
        const tx = db.transaction('auth_store', 'readwrite');
        const store = tx.objectStore('auth_store');
        await store.put(session, 'currentSession');
        await tx.complete;
        console.log('Auth state saved to IndexedDB');
    }

    async getAuthState() {
        const db = await this.dbPromise;
        const tx = db.transaction('auth_store', 'readonly');
        const store = tx.objectStore('auth_store');
        const session = await store.get('currentSession');
        await tx.complete;
        return session;
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