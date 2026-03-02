# Cyepro Notification Prioritization Engine — MERN Stack

> A production-grade notification classification system that decides whether every incoming notification should be delivered **NOW**, deferred for **LATER**, or dropped as **NEVER** — using a 4-stage pipeline powered by Claude AI.

---

## Live URLs

| Service | URL |
|---------|-----|
| Frontend | https://cyepro-frontend.vercel.app |
| Backend | https://cyepro-mern-production.up.railway.app |
| Health Check | https://cyepro-mern-production.up.railway.app/health |

---

## Demo Credentials

These are shown directly on the login page — no README hunting needed.

| Role | Email | Password | What they can do |
|------|-------|----------|-----------------|
| Admin | admin@cyepro.com | Admin@123 | Everything — rules, settings, audit logs |
| Operator | operator@cyepro.com | Operator@123 | Submit events, view dashboard |

---

## What This System Does — In simple words

Imagine your company gets 500 notifications a day — security alerts, payment failures, meeting reminders, marketing emails. Most are noise. This system automatically reads each notification and decides:

- 🟢 **NOW** — Send immediately (e.g. "Someone hacked your account")
- 🟡 **LATER** — Send later in a batch (e.g. "Your weekly report is ready")
- 🔴 **NEVER** — Throw it away (e.g. spam, duplicates, promotions)

Every decision is logged with a reason. Admins can create rules from the UI. The AI handles anything the rules don't cover.

---

## Tech Stack i used sorted as which technology - its version - why i've choosen it

| Technology | Version | Why i chose it |
|------------|---------|-----------------|
| Node.js | 24.x | Non-blocking async I/O — perfect for high-throughput notification processing |
| Express | 4.x | Minimal, fast HTTP framework — no overhead |
| MongoDB | Atlas | Flexible schema for semi-structured notification data with different metadata per event type |
| Mongoose | 8.x | Schema validation + indexes + soft deletes out of the box |
| Next.js | 16.x | App Router, server components, built-in TypeScript — production-ready frontend |
| Tailwind CSS | 4.x | Utility-first, mobile-first styling without custom CSS |
| Claude AI | claude-3-5-haiku | Fast, cheap, excellent at classification tasks with structured JSON output |
| @anthropic-ai/sdk | Latest | Official SDK with proper error handling |
| Socket.IO | 4.x | Real-time bidirectional events — dashboard updates without polling |
| node-cron | 3.x | Lightweight cron scheduler for LATER queue background job |
| string-similarity | 4.x | Dice coefficient algorithm for near-duplicate detection |
| jsonwebtoken | 9.x | Stateless JWT authentication — scales horizontally |
| bcryptjs | 2.x | Secure password hashing |

---

## The Architecture Overview
```
┌─────────────────────────────────────────────────────┐
│                   Next.js Frontend                   │
│  Login │ Dashboard │ Simulator │ Audit │ Rules │ ...  │
└────────────────────┬────────────────────────────────┘
                     │ HTTP + Socket.IO
┌────────────────────▼────────────────────────────────┐
│                 Express Backend                      │
│                                                      │
│  Auth Routes → JWT Middleware → Protected Routes     │
│                                                      │
│  POST /api/notifications/submit                      │
│         │                                            │
│         ▼                                            │
│  ┌─────────────────────────────────────┐             │
│  │         Decision Pipeline           │             │
│  │                                     │             │
│  │  1. Deduplication Service           │             │
│  │  2. Alert Fatigue Service           │             │
│  │  3. Rule Engine                     │             │
│  │  4. Claude AI + Circuit Breaker     │             │
│  └─────────────────────────────────────┘             │
│         │                                            │
│         ▼                                            │
│  MongoDB (6 collections)                             │
│  Background Job (every 5 min)                        │
└─────────────────────────────────────────────────────┘
```

### Layers Explained in simple words(for non-developers too)

**Frontend (Next.js)** — The website users interact with. 7 pages. Talks to the backend over the internet.

**Express Backend** — The server that receives notifications and processes them. Like a post office that sorts mail.

**Decision Pipeline** — 4 checks run in order on every notification. Like a security checkpoint at an airport.

**MongoDB** — The database that stores everything permanently. 6 "filing cabinets" for different types of data.

**Background Job** — A worker that wakes up every 5 minutes to process deferred notifications. Runs automatically.

---

## AI Integration(The AI i used)

**Provider:** Anthropic  
**Model:** claude-3-5-haiku-20241022  
**Why this model:** Fast (low latency), cheap (important for high volume), excellent at returning structured JSON

### The Exact Prompt i Sent
```
You are a Notification Prioritization Engine.
Analyze this notification and classify it.

Notification Details:
- Event Type: {event_type}
- Message: {message}
- Source: {source}
- Priority Hint: {priority_hint}
- Channel: {channel}

Classification Rules:
- NOW: Urgent, needs immediate attention (security alerts, payment failures, critical errors)
- LATER: Important but not urgent (meeting reminders, project updates, weekly reports)
- NEVER: Spam, promotions, duplicates, irrelevant (marketing, discount offers)

Respond ONLY with valid JSON like this:
{
  "classification": "NOW",
  "confidence": 0.95,
  "reasoning": "Security alert requires immediate attention"
}
```

### What Claude Returns
```json
{
  "classification": "NOW",
  "confidence": 0.95,
  "reasoning": "Security alert requires immediate attention"
}
```

We parse the JSON, validate that classification is one of NOW/LATER/NEVER, and store the full result including model name, confidence score, and whether it was a fallback.

### When AI Is Unavailable — Step by Step(when it Fails or dies)

1. Claude API call fails
2. Wait 1 second → retry (attempt 2)
3. Wait 2 seconds → retry (attempt 3)
4. All 3 attempts failed → record failure in circuit breaker
5. After 5 total failures → circuit breaker OPENS (stops calling AI for 60 seconds)
6. Fallback kicks in — keyword-based classification (similar to Round 1 logic)
7. Result stored with `is_fallback: true` so we know it wasn't AI
8. Health endpoint reports `circuit_breaker: OPEN`
9. After 60 seconds → circuit breaker tries one test call (HALF_OPEN state)
10. If test succeeds → back to CLOSED (normal operation)

---

## Prerequisites

- Node.js v18 or higher
- npm v9 or higher
- MongoDB Atlas account (free tier works)
- Anthropic API key (free credits available at console.anthropic.com)

---

## Environment Variables

Create a `.env` file in the `cyepro-mern` folder:
```env
# MongoDB connection string from Atlas → Connect → Drivers
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/cyepro-mern

# Secret key for signing JWT tokens — make this long and random
JWT_SECRET=your_long_random_secret_at_least_32_characters

# How long tokens stay valid
JWT_EXPIRES_IN=7d

# From console.anthropic.com → API Keys
ANTHROPIC_API_KEY=sk-ant-api03-...

# How many AI failures before circuit breaker opens
CIRCUIT_BREAKER_THRESHOLD=5

# How long circuit breaker stays open (milliseconds) — 60000 = 1 minute
CIRCUIT_BREAKER_TIMEOUT=60000

# Your frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

---

## Running Locally

### Backend
```bash
# 1. Go into backend folder
cd cyepro-mern

# 2. Install packages
npm install

# 3. Create .env file and fill in values (see above)

# 4. Create admin/operator accounts and default rules
node scripts/seed.js

# 5. Start the server
node server.js

# You should see:
# MongoDB Connected
# Server running on port 5000
# LATER queue job scheduled — runs every 5 minutes
```

### Frontend
```bash
# 1. Go into frontend folder
cd cyepro-frontend

# 2. Install packages
npm install

# 3. Create .env.local file
echo NEXT_PUBLIC_API_URL=http://localhost:5000 > .env.local

# 4. Start the frontend
npm run dev

# Open http://localhost:3000
```

---

## Known Limitations — In best of my practice

### 1. Login Sessions Expire After 7 Days
Right now if you log in, your session lasts 7 days. After that you have to log in again. A proper production system would automatically renew your session in the background so you never get logged out unexpectedly.

### 2. Duplicate Detection Slows Down With Very Large Data
Our near-duplicate detection compares each new notification against recent ones using text similarity. This works great up to thousands of notifications but would slow down with millions. A real production system would use a faster mathematical technique called MinHash that can compare millions of notifications instantly.

### 3. AI Failure Memory Is Lost On Restart
Our circuit breaker (the system that stops calling AI when it keeps failing) keeps its count in memory. If the server restarts, it forgets how many failures happened. A production system would store this in a shared database like Redis so the failure count survives restarts.

### 4. No Limit On How Many Requests One User Can Send
Any logged-in user can send as many notifications as they want. A production system would limit this — for example max 100 requests per minute per user — to prevent abuse.
