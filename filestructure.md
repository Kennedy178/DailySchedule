# Project File Structure

getitdone/
│
├── frontend/
│   ├── index.html              # Main app page, footer with "Contact Developer" link
|   |──story-content.html
│   ├── help.html              # Help/FAQ page with contact form (add honeypot field)
|   ├── tos.html               # Terms of service
|   ├── privacy.html           # privacy policy
|   ├── reset-password.html
│   ├── manifest.json
│   ├── sw.js
│   ├── styles/
│   │   ├── main.css
│   │   └── help.css           # Styles for FAQ, contact form, honeypot (hidden)
│   ├── scripts/
│   │   ├── app.js
│   │   ├── db.js
│   │   ├── auth.js
│   │   ├── authHandler.js
│   │   ├── sync.js
│   │   ├── fcm-config.js
│   │   ├── fcm-manager.js
│   │   └── help.js            # FAQ and form logic (success/error messages)
│   ├── icons/
│   │   ├── favicon-32x32.png
│   │   ├── icon-192x192.png
│   │   └── icon-512x512.png
│   └── assets/
│       └── screenshots/       # FAQ screenshots
│           ├── signup.png
│           ├── confirmation.png
│           ├── settings.png
│           └── tasks.png
│
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── routes/
│   │   ├── tasks.py
│   │   ├── fcm.py
│   │   └── contact.py         # Handle form, check honeypot, trigger email
│   ├── utils/
│   │   ├── supabase_client.py
│   │   ├── auth_utils.py
│   │   ├── fcm_service.py
│   │   └── email_service.py   # Send emails via Gmail SMTP (From + Reply-To)
│   └── .env                   # GMAIL_ADDRESS, GMAIL_APP_PASSWORD
│
└── README.md                  # Document new features
