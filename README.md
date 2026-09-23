# Eventfy

**Every IT event worth showing up for.** Eventfy is a ticketing platform for tech conferences,
hands-on workshops, hackathons and dev meetups in Algeria. Attendees discover events and get a QR
ticket in seconds, organizers publish events and scan tickets at the door, and admins run the platform.

This repository is the upgraded version of [Nour-Seddiki/Eventfy](https://github.com/Nour-Seddiki/Eventfy):
a new frontend (Eventfy v4), Algerian card payments through Chargily Pay, an IT-only catalogue,
admin-approved organizers and a round of security fixes. See [What changed](#what-changed-in-this-upgrade).

**Live:** https://eventfy-upgraded.netlify.app · API: https://eventfy-upgraded-api.onrender.com ([docs](https://eventfy-upgraded-api.onrender.com/docs))

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
- Sign in with email or Google; signup only accepts real email addresses (see [Real accounts](#real-accounts))

**Organizers**
- Create and edit events (cover image, schedule, capacity, price, location pinned on a map)
- Build registration forms and approve or reject applications
- See attendees and revenue, and check people in by scanning their QR tickets

**Admins**
- Dashboard with platform analytics
- Manage users (restrict, ban, delete) and promote attendees who request organizer access
- **Clean up accounts**: flag fake or deactivated accounts and remove them for good
- Moderate events, payments and reviews (admins don't create events; organizers do)

**Messaging** (`/chat` API)
- Support chat with the admin team: *Become an organizer*, *Report a problem* or anything else.
  Admins answer from one inbox and can promote the user from the conversation.
- Attendee ↔ organizer chat for each event, and organizer announcements to every ticket holder

## How roles work

Every account starts as an **attendee**. An attendee who wants to publish events clicks
**Request organizer access** in their profile; every admin gets a notification, and an admin
promotes them from the admin panel (**Promote to Organizer**). The user is notified when their role
changes. Nobody can pick or change their own role.

## Real accounts

Eventfy sends no email, so it checks addresses instead:

- **At signup** (and when an email is changed) the API rejects addresses that can't be real:
  placeholder domains (`example.com`, `test.com`, `demo.com`, …), throwaway inboxes (`yopmail.com`,
  `mailinator.com`, …), typos of the big providers (`gmial.com` → *Did you mean …@gmail.com?*) and
  domains with no mail server (a DNS lookup). The rules are in `backend/app/utils/email_rules.py`.
- Emails are stored lowercase and are unique whatever the capitalization, so `Nour@Gmail.com` and
  `nour@gmail.com` are the same account for signup and sign-in.
- **Existing accounts:** in the admin panel, **Users → Clean up accounts** lists every account whose
  email fails those checks, and every deactivated account, already ticked. Tick **Show all accounts**
  to pick others too, e.g. test accounts that used a real-looking address. Removing an account deletes
  it with its tickets (seats go back to the event), events, registrations, messages and
  notifications. Admins, your own account and accounts with paid payments are never removed.

Only Google sign-in proves that an address belongs to the person using it.

## Tech stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy 2, Pydantic 2 (Python 3.11) |
| Database | PostgreSQL on Supabase; Supabase Storage for images |
| Auth | JWT (python-jose, bcrypt), Google Identity Services |
| Payments | [Chargily Pay](https://chargily.com) v2 (CIB, EDAHABIA, DZD) |
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
| `GOOGLE_CLIENT_ID` | Optional override of the Google OAuth client built into the app |
| `CHARGILY_SECRET` | Chargily secret key. Without it, paid checkout is disabled. |
| `CHARGILY_URL` | `https://pay.chargily.net/test/api/v2/` for test mode, `…/api/v2/` for live |
| `BACKEND_URL` | Public API URL; Chargily sends webhooks to `BACKEND_URL/payment/webhook` |
| `FRONTEND_URL` | Frontend origin(s), comma-separated; used for CORS and payment redirects |
| `ADMIN_EMAILS` | Emails that become admins when they sign up or sign in (how a new deployment gets its first admin) |
| `EMAIL_DOMAIN_CHECKS` | `true` (default) rejects placeholder, throwaway, mistyped and mail-less domains at signup; `false` checks syntax only |

## Payments

1. The attendee picks CIB or EDAHABIA and is sent to Chargily's hosted checkout. Eventfy never
   sees card numbers.
2. Chargily redirects back to `FRONTEND_URL/?payment_id=…`; the app asks the API to verify the
   payment with Chargily and shows the ticket.
3. Chargily's signed webhook (`/payment/webhook`) confirms the payment too, so tickets are issued
   even if the attendee closes the tab. Fulfilment is idempotent: a payment never creates two tickets.

Chargily only charges in DZD; events priced in USD, EUR or GBP are converted with fixed rates
(`RATES_TO_DZD` in `backend/app/utils/currency.py`, mirrored in `frontend/app/util.js`).
Chargily has no refund API, so refunds are handled manually.

## Deployment

The live deployment runs on free tiers:

| Part | Where | URL |
|---|---|---|
| Frontend | Netlify site `eventfy-upgraded` (publishes `frontend/`) | https://eventfy-upgraded.netlify.app |
| API | Render web service `eventfy-upgraded-api` (root `backend/`, Python 3.11, Frankfurt) | https://eventfy-upgraded-api.onrender.com |
| Database | Render PostgreSQL 16 `eventfy-upgraded-db` (free, Frankfurt) | internal |

**API on Render:** web service from this repo, root directory `backend`, build
`pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
Auto-deploy is on for `main`, but Render only hears about pushes when its GitHub app can see this
repo. Until it is installed on `Eventfy_upgraded` (Render dashboard → Account settings → GitHub),
deploy each push with **Manual Deploy → Deploy latest commit**. Environment: the `DB_*` values of the
Render database (internal hostname, port 5432), a generated `SECRET_KEY`, `PYTHON_VERSION=3.11.9`,
`FRONTEND_URL=https://eventfy-upgraded.netlify.app`, `BACKEND_URL` (its own URL) and `ADMIN_EMAILS`.
Tables are created on first start.

**Frontend on Netlify:** deploy the `frontend/` folder (no build step). `frontend/config.js` points
production traffic at the Render API, so a new API URL means updating that file.

**First admin:** sign up (or sign in with Google) with an email listed in `ADMIN_EMAILS`; that account
becomes admin and can then promote organizers.

**Good to know**
- Render's free web service sleeps after 15 minutes without traffic; the first request then takes
  about a minute. The free database expires after 30 days (2026-10-23 for the current one) unless
  it is upgraded.
- Uploaded images are stored on the API's disk, which Render wipes on each deploy. Set
  `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` to keep them in Supabase Storage.
- Payments stay disabled until `CHARGILY_SECRET` is set (test key first). Set Chargily's webhook to
  `https://eventfy-upgraded-api.onrender.com/payment/webhook`, or rely on `BACKEND_URL`.
- Eventfy sends no email: tickets, registration decisions and role changes arrive as in-app
  notifications, and the QR ticket is always in *My tickets*.
- Google sign-in: add the Netlify URL to the OAuth client's *Authorized JavaScript origins*.

## What changed in this upgrade

**Security**
- Removed a hardcoded database password from the backend scripts (rotate it if you used the original repo)
- Only an event's organizer or an admin can check a ticket in
- Payment webhooks are rejected unless they are signed with the configured secret
- Users can no longer make themselves admins through `PUT /users/update_me`
- `POST /ticket/purchase_ticket` no longer hands out free tickets for paid or approval-only events
- Removed a diagnostic endpoint that exposed SMTP settings
- The admin user list no longer sends every account's password hash to the browser

**Product**
- Eventfy v4 frontend, built from the Claude Design prototype
- IT events only: event categories removed
- Stripe replaced with Chargily Pay
- Signup no longer asks for a role; admins approve organizers
- Google sign-in fixed (the API now always knows its OAuth client)
- Maps moved from CARTO (now requires a key) to OpenStreetMap
- Signup rejects fake, throwaway and mistyped emails; emails are case-insensitive
- Admin **Clean up accounts** tool to remove fake accounts and everything attached to them
- Email sending removed (it never worked on Render's free tier, which blocks SMTP); everything it
  announced is an in-app notification

**Fixes**
- Recommendations endpoint crashed on a renamed column
- Event dates and the month filter read a field the API doesn't return
- Stale tests updated; about 110 files that were already in `.gitignore` are no longer tracked

## Known limitations

- **News & highlights** shows placeholder stories from the design (`frontend/app/news.js`);
  there is no news API yet.
- No self-service password reset yet (it would need email).
- Signup can't prove an email belongs to whoever typed it; only Google sign-in does.
- Refunds are manual (see [Payments](#payments)).

## Credits

Built by Nour Seddiki 
