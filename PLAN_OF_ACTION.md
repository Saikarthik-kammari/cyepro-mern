# Plan of Action — Architecture Execution Plan

> This document shows exactly how I broke down the problem, why I built things in the order I did, and what I learned along the way. In short this is my thinking made visible.

---

## Before Writing Any Code — How I Read The Problem

Round 2 wasn't asking me to invent something new. It was asking me to **build what I already designed in Round 1** — the same Now/Later/Never classification logic, but as a proper web application instead of a terminal script.

My Round 1 Python project already:
- Read Gmail emails
- Applied keyword rules to classify them as Now/Later/Never
- Printed results to the terminal

Round 2 is the same brain — but now it needs a real database, a web UI, real AI, failure handling, and two stacks.

### How I Broke The Problem Into Parts

Before i started writing any single line of code i need to understand the whole clear picture so i decided to divide the entire system into 6 parts. Each part had to be fully working before I moved to the next one.Its just Like im building a house — i don't put the roof on before the walls exist.
```
So after spending 30mins finally i did it so:
Part 1 → Backend Setup
Part 2 → Authentication
Part 3 → Database Models
Part 4 → The Brain (Services)
Part 5 → API Routes
Part 6 → Frontend
```

---

## Part 1 — Backend Setup
### "A running backend, connecting to cloud database, ready to store data"

**What I built:**
- Express server running on port 5000
- Connected to MongoDB Atlas (cloud database — not local)
- One test route (`/`) to confirm server is alive
- dotenv for environment variables — credentials never hardcoded

**Why this first?**

Obviously,you can't store anything without a database connection.You can't build authentication without a server.This is the foundation everything else sits on. Like laying the concrete slab before building walls.

**Key decision:** I Used MongoDB Atlas (cloud) from day one — not a local database. This meant deployment would work without changing anything.

---

## Part 2 — Authentication Setup
### "The heart and foundation of my setup — role-based access, secure logins, protected routes"

**What I built:**
- User model with name, email, hashed password, role
- Register endpoint — creates user with bcrypt-hashed password
- Login endpoint — validates credentials, returns JWT token
- Two roles: `admin` (can create rules, change settings) and `operator` (can submit events, view dashboard)

**Why this second?**

Without authentication, anyone on the internet could access the system. Every other part of the system — notifications, rules, audit logs — needs to know WHO is making the request and WHETHER they have permission.

Think of it like this: you don't furnish a house before you've installed the locks on the doors.

**Key decision:** Role-based access from day one. Admins and operators have different permissions. This was needed because the problem statement said admins configure rules and operators submit events — two different jobs, two different access levels.

---

## Part 3 — Database Models
### "Telling MongoDB what shape our data has — 6 blueprints for 6 filing cabinets"

**What I built:**

| File | What it stores | What it does(in simple words)? |
|------|---------------|---------------------|
| `Notification.js` | Every notification received | The raw event — what arrived, from where, what we decided |
| `AuditLog.js`     | Every decision ever made    | The paper trail — who decided what, why, and when |
| `Rule.js`         | Admin-configured classification rules | Instructions stored in DB so admins can change them from UI |
| `FatigueSettings.js` | Max notification limits per user | Configurable thresholds — how many is "too many" |
| `DeadLetter.js`   |Failed notifications after 3 retries | The safety net — nothing ever silently disappears |

**Why database models before any logic?**

If you write the business logic before defining the data shape, you keep changing both. By designing all 6 models first, I had a clear contract: "this is exactly what gets stored, in this exact format."

**Key decisions made here:**

1. **Separated Notification from AuditLog** — A notification is what arrived. An audit log is the decision we made. Two different things. Keeping them separate means the audit trail is immutable — the decision record never changes even if the notification is updated.

2. **Soft deletes everywhere** (`isDeleted: false`) — We never actually delete data. We just mark it hidden. This means the audit trail is never broken. If a rule gets deleted, we can still see which rule triggered a decision from 3 weeks ago.

3. **Indexes on critical fields** — `user_id + createdAt` indexed because fatigue checking queries "how many notifications did user-001 get in the last hour?" Without an index, MongoDB reads every record. With an index, it jumps directly to the right ones. Like a book index vs reading every page.

---

## Part 4 — The Brain (Services)
### "Done i got the notification — now i need something to make a decision"

**What I built — 6 service files:**

| File | Job in one line |
|------|----------------|
| `circuitBreaker.js` | Stops calling AI when it keeps failing ; prevents hammering a dead service |
| `aiService.js`      | Talks to Claude AI with 3 retries, exponential backoff, and keyword fallback |
| `deduplicationService.js` | Checks if this notification is a duplicate using 3 methods |
| `fatigueService.js`       | Checks if this user has already received too many notifications |
| `ruleEngine.js`           | Checks admin-configured rules ; reads fresh from DB every time |
| `decisionPipeline.js`     | The master — runs all 4 checks in order, AI runs asynchronously |

**Why services in a separate folder?**

If I wrote deduplication logic inside the notification controller, I'd have to copy it again inside the background job. Two copies means two places to fix bugs.

A service is like a tool in a toolbox. Any part of the system can pick it up and use it. Written once, used everywhere.which doesnt care who used the tool.

**Why to build circuit breaker BEFORE the AI service?**

The AI service depends on the circuit breaker. Building the safety net before the thing it protects is the correct engineering order. I also wrote the keyword fallback before writing a single AI call — meaning the system worked even before I had an API key.

**The most important decision in this part — async AI:**

AI takes 2-3 seconds. Users shouldn't wait.
- Notification arrives → saved immediately → user gets "accepted ✅" in under 100ms
- AI thinks in the background
- Dashboard updates via Socket.IO when AI finishes

If AI were synchronous, every user would stare at a loading spinner for 3 seconds. Under high load the server would freeze waiting for AI responses.

---

## Part 5 — API Routes
### "They're like the doors — This URL + This method → Go to this controller function. That's literally it."

**Now What I built out of my rough idea amnd upon some research:**
```
POST /api/notifications/submit    → Submit a notification
GET  /api/notifications/dashboard → Dashboard stats
GET  /api/notifications/later-queue → Deferred items
GET  /api/rules                   → Get all rules
POST /api/rules                   → Create rule (admin only)
GET  /api/admin/audit             → Audit log history
GET  /health                      → System health + circuit breaker state
```

**The layered structure:**
```
Route (the door)
    → Middleware (security guard checking ID)
        → Controller (hands that handle the request)
            → Service (brain that does the actual work)
                → MongoDB (permanent storage)
```

**Why middleware before controllers?**

Every route needs authentication. Writing it once as middleware means it's impossible to accidentally leave a route unprotected. adminOnly middleware means I never have to remember to check the role inside each controller it's checked automatically at the door.

**At this point — the backend was complete.**

I could submit a notification, it went through the 4-stage pipeline, Claude AI classified it, the audit log was written, and the health endpoint showed the circuit breaker state. Everything worked.

---

## The Part I Built Out Of Order (And Why)

While building the frontend I realised two things were missing from the backend:

**1. LATER Queue Background Job (`jobs/laterQueueJob.js`)**

I had notifications being classified as LATER and stored as deferred.But, nothing was processing them. The background job runs every 5 minutes using node-cron, picks up due items, reclassifies with AI, and moves failures to the dead letter queue after 3 attempts.

**2. Updating `server.js` to wire everything together**

The original server.js only knew about auth routes. I had to update it to add Socket.IO, all new routes, the background job, and the health endpoint. `server.js` is the main switch that turns everything on.

**Lesson learned:** In future I'd plan the background job alongside the pipeline, not after the frontend. The pipeline and the job are two sides of the same coin.

---

## Part 6 —FINALLY The Frontend
### "7 pages, each talking to a backend endpoint that already existed and was tested"

**Rule I followed:** No frontend page until its backend endpoint existed and worked.

| Page | What it does |
|------|-------------|
| Login `/` | Secure login with demo credentials shown on screen — click to fill |
| Dashboard `/dashboard` | Live stats — Total, NOW, LATER, NEVER counts, recent events, auto-refreshes |
| Simulator `/simulator` | Submit a test notification with presets, see classification result instantly |
| Audit Log `/audit` | Searchable, filterable history of every decision ever made |
| LATER Queue `/later-queue` | View of all deferred notifications and their retry status |
| Rules Manager `/rules` | Admin creates, edits, deletes, toggles rules — no code needed |
| Metrics `/metrics` | Charts showing trends — classifications over time, AI vs fallback usage |

**Architecture choices:**

- One `lib/api.ts` file handles all backend calls — when the backend URL changes, one line changes, not 20
- `layout.tsx` wraps every page — sidebar written once, appears everywhere
- Demo credentials shown as clickable buttons on login — reviewer signs in instantly without reading README

---

## What I Would Do Differently

**1. Plan the background job with the pipeline**
The LATER queue job is part of the backend, not an afterthought. I'd build it in Part 4 alongside the pipeline services.

**2. Build both stacks in parallel from day one**
I built MERN fully first, then Spring Boot. Some MERN decisions didn't translate cleanly to Spring Boot's conventions. Parallel development would catch mismatches earlier.

**3. Write automated tests for the pipeline**
I validated the pipeline manually by submitting test notifications. Automated unit tests for each stage would catch bugs faster and give confidence when changing things.

**4. Redis for circuit breaker state from day one**
The circuit breaker stores failure count in memory. Server restart = count resets. Redis would make this persistent and work across multiple server instances.

**5.I would have Added the  `.env.` on day one**
I kept forgetting which environment variables existed. A documented example file from day one would save time every time I set up a new environment.

---

## My Core Engineering Principle Throughout
```
Database models first     → Can't store data without knowing its shape
Safety net before AI      → System must work even when AI is down  
Each part tested alone    → Know exactly where bugs are
Frontend after backend    → Don't build UI for endpoints that don't exist
Deploy backend first      → Frontend needs the live URL to be configured
```

**The theme: build the safety net before the thing it's supposed to catch.**