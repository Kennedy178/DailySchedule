
# logic.md

│

getitdone/
│
├── frontend/                          # Frontend (PWA)
│   ├── index.html                     # Phase 1 – Created when separating files (base UI structure)
│   ├── manifest.json                  # Phase 1 – Added when making app installable as a PWA
│   ├── sw.js                          # Phase 2 → Updated later in Phase 6 (local caching first, then push handling)
│   │
│   ├── styles/
│   │   └── main.css                   # Phase 1 – Separated from HTML (UI styling, responsive layout)
│   │
│   ├── scripts/
│   │   ├── app.js                     # Phase 1 – Initial task UI logic (will later integrate Supabase in Phase 5)
│   │   ├── db.js                      # Phase 2 – Replaces localStorage with IndexedDB + offline queue logic
│   │   └── notifications.js           # Phase 6 – Push/local notification handling (FCM + local)
│   │
│   └── icons/
│       ├── favicon-32x32.png          # Phase 1 – Added for branding & PWA
│       ├── icon-192x192.png           # Phase 1 – Required PWA icon size
│       └── icon-512x512.png           # Phase 1 – Required PWA icon size
│
├── backend/                           # FastAPI backend
│   ├── main.py                        # Phase 4 – FastAPI entry point (routing, middleware, app setup)
│   ├── requirements.txt               # Phase 4 – Python dependencies (FastAPI, Supabase client, APScheduler)
│   │
│   ├── routes/
│   │   └── tasks.py                   # Phase 4 – CRUD API for tasks + auth token verification
│   │
│   ├── utils/
│   │   ├── supabase_client.py         # Phase 4 – Connect FastAPI to Supabase DB
│   │   └── notifications.py           # Phase 6 – APScheduler + FCM push notification logic
│   │
│   └── .env                           # Phase 4 – Added for Supabase keys, later expanded in Phase 6 for FCM keys
│
└── README.md                          # Phase 1 – Project overview; updated at each major phase for documentation
