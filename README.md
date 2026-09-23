# Eventfy

**Every IT event worth showing up for.** Eventfy is a ticketing platform for tech conferences,
hands-on workshops, hackathons and dev meetups in Algeria. Attendees discover events and get a QR
ticket in seconds, organizers publish events and scan tickets at the door, and admins run the platform.

This repository is the upgraded version of [Nour-Seddiki/Eventfy](https://github.com/Nour-Seddiki/Eventfy):
a new frontend (Eventfy v4), Algerian card payments through Chargily Pay, an IT-only catalogue,
admin-approved organizers and a round of security fixes. See [What changed](#what-changed-in-this-upgrade).

## Features

**Attendees**
- Discover upcoming IT events: featured event with a live countdown, a three-week day picker,
  Free/Paid filter, sorting, grid or list view, and instant search (`/` or `Ctrl+K`)
- Free events: one click to a QR ticket
- Paid events: checkout with CIB or EDAHABIA cards through Chargily Pay
- Approval-only events: fill in the organizer's application form, pay once accepted
- My tickets: next event with its QR code, add to calendar (.ics), directions, cancel free tickets,
  rate events you attended
- Saved events, in-app notifications, profile with avatar, password change and account deletion
- Sign in with email or Google

**Organizers**
- Create and edit events (cover image, schedule, capacity, price, location pinned on a map)
- Build registration forms and approve or reject applications
- See attendees and revenue, and check people in by scanning their QR tickets

**Admins**
- Dashboard with platform analytics
- Manage users (restrict, ban, delete) and promote attendees who request organizer access
- Moderate events, payments and reviews

## How roles work

Every account starts as an **attendee**. An attendee who wants to publish events clicks
**Request organizer access** in their profile; every admin gets a notification, and an admin
promotes them from the admin panel (**Promote to Organizer**). The user is notified when their role
changes. Nobody can pick or change their own role.

## Tech stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy 2, Pydantic 2 (Python 3.11) |
| Database | PostgreSQL on Supabase; Supabase Storage for images |
| Auth | JWT (python-jose, bcrypt), Google Identity Services |
| Payments | [Chargily Pay](https://chargily.com) v2 (CIB, EDAHABIA, DZD) |
| Email | SMTP or Resend |
| Frontend | Eventfy v4: Preact + htm single-page app, no build step |
| Maps | Leaflet + OpenStreetMap (no API key) |
| Hosting | Render (API), Netlify (frontend) |

## Project structure

```
backend/
  app/
    routes/        API endpoints (auth, events, tickets, payments, registrations, admin, …)
    services/      business logic
    models/        SQLAlchemy models
    schemas/       Pydantic schemas
  tests/           pytest suite (in-memory SQLite)
  .env.example     every setting the API reads
frontend/
  index.html       Eventfy v4 attendee app
  app/             its modules: store.js (state + API calls), views/, styles.css
  org-dashboard/   organizer dashboard and QR scanner
  new Event/       create / edit event
  Admin/           admin panel
  console.js/.css  header shared by the organizer and admin pages
```

## Run it locally

**Backend** (needs a PostgreSQL database, e.g. a free Supabase project):

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # then fill in the values below
uvicorn app.main:app --reload --port 8000
```

Tables are created on startup. The API docs are at http://localhost:8000/docs.

**Frontend:**

```bash
python -m http.server 5500 --directory frontend
```

Open http://localhost:5500. On `localhost` the frontend talks to `http://localhost:8000`;
anywhere else it uses the production API set in `frontend/config.js`.

**Tests:**

```bash
cd backend
python -m pytest tests --ignore=tests/test_comprehensive.py
```

`test_comprehensive.py` needs a live PostgreSQL database; the rest run on in-memory SQLite.

## Configuration

All settings live in `backend/.env` (see [`backend/.env.example`](backend/.env.example)).

| Variable | Purpose |
|---|---|
| `SECRET_KEY` | Signs login tokens. Use a long random value in production. |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL connection |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Image uploads (event covers, avatars) |
| `SMTP_*` or `RESEND_API_KEY` | Ticket emails |
| `GOOGLE_CLIENT_ID` | Optional override of the Google OAuth client built into the app |
| `CHARGILY_SECRET` | Chargily secret key. Without it, paid checkout is disabled. |
| `CHARGILY_URL` | `https://pay.chargily.net/test/api/v2/` for test mode, `…/api/v2/` for live |
| `BACKEND_URL` | Public API URL; Chargily sends webhooks to `BACKEND_URL/payment/webhook` |
| `FRONTEND_URL` | Frontend origin(s), comma-separated; used for CORS and payment redirects |

## Payments

1. The attendee picks CIB or EDAHABIA and is sent to Chargily's hosted checkout. Eventfy never
   sees card numbers.
2. Chargily redirects back to `FRONTEND_URL/?payment_id=…`; the app asks the API to verify the
   payment with Chargily and shows the ticket.
3. Chargily's signed webhook (`/payment/webhook`) confirms the payment too, so tickets are issued
   even if the attendee closes the tab. Fulfilment is idempotent: a payment never creates two tickets.

Chargily only charges in DZD; events priced in USD, EUR or GBP are converted with fixed rates
(`RATES_TO_DZD` in `backend/app/services/payment_service.py`, mirrored in `frontend/app/util.js`).
Chargily has no refund API, so refunds are handled manually.

## Deployment

- **Render (API):** `backend/Procfile` runs uvicorn. Set the variables above, with `CHARGILY_URL`
  pointing at the live API when you go live.
- **Netlify (frontend):** publish the `frontend/` folder. `netlify.toml` redirects pages from the
  old UI to `/` and sets caching headers.
- **Google sign-in:** the OAuth client's *Authorized JavaScript origins* must include your
  frontend URL.
- **Chargily:** set the webhook URL in the Chargily dashboard, or set `BACKEND_URL`.

## What changed in this upgrade

**Security**
- Removed a hardcoded database password from the backend scripts (rotate it if you used the original repo)
- Only an event's organizer or an admin can check a ticket in
- Payment webhooks are rejected unless they are signed with the configured secret
- Users can no longer make themselves admins through `PUT /users/update_me`
- `POST /ticket/purchase_ticket` no longer hands out free tickets for paid or approval-only events
- Removed a diagnostic endpoint that exposed SMTP settings

**Product**
- Eventfy v4 frontend, built from the Claude Design prototype
- IT events only: event categories removed
- Stripe replaced with Chargily Pay
- Signup no longer asks for a role; admins approve organizers
- Google sign-in fixed (the API now always knows its OAuth client)
- Maps moved from CARTO (now requires a key) to OpenStreetMap

**Fixes**
- Recommendations endpoint crashed on a renamed column
- Event dates and the month filter read a field the API doesn't return
- Stale tests updated; about 110 files that were already in `.gitignore` are no longer tracked

## Known limitations

- **News & highlights** shows placeholder stories from the design (`frontend/app/news.js`);
  there is no news API yet.
- No self-service password reset yet.
- Refunds are manual (see [Payments](#payments)).

## Credits

Built by Nour Seddiki 
