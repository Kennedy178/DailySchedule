# steps.md

|||| **Phase I – Separate Frontend Files**
|--- Split single-page HTML/CSS/JS into:
|    |--- `index.html` (structure)
|    |--- `styles.css` (styling)
|    |--- `app.js` (logic)
|--- Update `index.html` to link `styles.css` + `app.js`
|--- Verify all UI components (task list, progress bar, settings) still work

|||| **Phase II – Set Up Supabase Backend**
|--- Create Supabase project (free tier)
|--- Enable Google OAuth for authentication
|--- Create `tasks` table with:
|    |--- `id` (uuid)
|    |--- `user_id` (uuid)
|    |--- `name` (text)
|    |--- `start_time` (timestamp)
|    |--- `end_time` (timestamp)
|    |--- `category` (text)
|    |--- `priority` (int)
|    |--- `completed` (boolean)
|    |--- `created_at` (timestamp)
|--- Enable real-time subscriptions for cross-device syncing

|||| **Phase III – Build FastAPI Backend**
|--- Initialize FastAPI project (`main.py`, `routes/`)
|--- Create CRUD endpoints:
|    |--- `POST /tasks` → Create
|    |--- `GET /tasks` → Read
|    |--- `PUT /tasks/:id` → Update
|    |--- `DELETE /tasks/:id` → Delete
|--- Integrate Supabase Python client
|--- Add middleware to verify Google OAuth tokens

|||| **Phase IV – Switch to IndexedDB for Local Storage**
|--- Replace `localStorage` with IndexedDB in `app.js`
|--- Mirror Supabase schema in IndexedDB
|--- Implement “pending sync” flags for offline changes

|||| **Phase V – Integrate Google OAuth in Frontend**
|--- Add Supabase JS client (in `app.js` or `auth.js`)
|--- Add “Login with Google” button in settings menu
|--- On login success: retrieve user ID + token
|--- Store login state in IndexedDB for persistence

|||| **Phase VI – Implement Task Syncing Logic**
|--- For logged-in users:
|    |--- Fetch tasks from FastAPI/Supabase → cache in IndexedDB
|    |--- Subscribe to Supabase real-time for cross-device updates
|    |--- Sync “pending” offline changes when back online
|--- For guests:
|    |--- Store tasks locally in IndexedDB only
|    |--- On first login: offer one-time task sync to Supabase

|||| **Phase VII – Update Service Worker (Offline + Push)**
|--- Modify `sw.js` to:
|    |--- Cache static assets (`index.html`, `styles.css`, `app.js`, `/assets`, Chart.js)
|    |--- Cache API responses for offline access
|    |--- Handle FCM push notifications for logged-in users
|--- Keep `checkTaskReminders` for local notifications (guests)

|||| **Phase VIII – Set Up Backend Push Notifications**
|--- Add APScheduler to FastAPI (runs every minute)
|--- Scan `tasks` table → tasks starting in 10 min → trigger FCM push
|--- Push includes task name, priority, user name
|--- Include “Open App” action in notifications

|||| **Phase IX – Add Login Prompt for Guests**
|--- Add toast/banner after:
|    |--- 5 tasks created OR every 3 days
|--- Suggest login for syncing + push notifications
|--- Link to Google OAuth in settings menu

|||| **Phase X – Enhance UI for New Features**
|--- Update `styles.css`, `app.js` (or `auth.js`, `offline-queue.js`) to add:
|    |--- Login/logout button
|    |--- Sync status indicator (e.g., “Syncing”, “Offline”)
|    |--- Toasts for login prompts & sync errors
|--- Ensure responsiveness + accessibility (ARIA labels)

|||| **Phase XI – Deploy the App**
|--- Deploy FastAPI backend on Render (HTTPS enabled)
|--- Host Supabase DB + auth
|--- Serve frontend (`index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.json`) on Render or Netlify
|--- Verify HTTPS for:
|    |--- PWA installability
|    |--- Push notifications (FCM)

|||| **Phase XII – Test & Refine**
|--- Test Google OAuth login/logout flows
|--- Verify syncing across devices
|--- Confirm offline task management (create, complete)
|--- Test push notifications (FCM + local)
|--- Ensure PWA installation works
|--- Fix bugs (sync conflicts, notification timing, etc.)
