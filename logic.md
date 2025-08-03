# GetItDone File Structure

getitdone/
│
├── frontend/                          # Frontend (PWA)
│   ├── index.html                     # Main HTML file (app structure)
│   ├── manifest.json                  # PWA manifest (app metadata, icons)
│   ├── sw.js                          # Service worker (caching, push/local notifications)
│   ├── styles/                        # Styling
│   │   └── main.css                   # Main stylesheet (responsive UI)
│   ├── scripts/                       # JavaScript logic
│   │   ├── app.js                     # Core UI, task logic, Supabase client
│   │   ├── db.js                      # IndexedDB operations (offline storage, queue)
│   │   └── notifications.js           # Push/local notification handling
│   └── icons/                         # App icons (PWA + favicon)
│       ├── favicon-32x32.png          # Favicon
│       ├── icon-192x192.png           # PWA icon (192x192)
│       └── icon-512x512.png           # PWA icon (512x512)
│
├── backend/                           # FastAPI backend
│   ├── main.py                        # FastAPI entry point (app setup, routes)
│   ├── requirements.txt               # Python dependencies (FastAPI, Supabase, APScheduler, etc.)
│   ├── routes/                        # API endpoints
│   │   └── tasks.py                   # Task CRUD and auth verification
│   ├── utils/                         # Utility functions
│   │   ├── supabase_client.py         # Supabase connection
│   │   └── notifications.py           # APScheduler for FCM push notifications
│   └── .env                           # Environment variables (Supabase/FCM keys)
│
└── README.md                          # Project overview, setup, deployment instructions
