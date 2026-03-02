# System Workflow — How Everything Works At Runtime

> This document explains exactly what happens inside the system when it runs — not what it's supposed to do, but what it actually does, step by step. Written so fine such that both engineers and non-engineers can follow along what exactly my idea is about and how.

---

## The Big Picture — One Simple Analogy(Real world example)

Think of this system like a **smart post office**.

- Letters (notifications) arrive from different senders
- Every letter goes through the same 4 security checks
- The post office stamps each letter: **DELIVER NOW**, **DELIVER LATER**, or **THROW AWAY**
- Every decision is written in a logbook with the reason
- A background worker processes the "deliver later" pile every 5 minutes
- A live screen on the wall shows everything happening in real time

---

## Flow 1 — Happy Path (Everything Works Perfectly)

### What happens from the moment an operator clicks "Submit" to the dashboard updating
```
Operator fills form → clicks Submit
        │
        ▼
Frontend (Next.js) sends HTTP POST request to:
POST https://cyepro-mern-production.up.railway.app/api/notifications/submit
        │
        ▼
JWT Middleware checks the token
(Like a security guard checking your ID at the door)
        │
        ├── No token? → 401 Unauthorized → Stop
        └── Valid token? → Continue
        │
        ▼
notificationController.js receives the request
- Validates required fields (user_id, event_type, message, source)
- Saves notification to MongoDB with status: "processing"
- Responds IMMEDIATELY to operator: "Event accepted ✅"
(The operator sees a response in under 100ms — they never wait)
        │
        ▼
Pipeline runs in background (operator already got their response)
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                    DECISION PIPELINE                        │
│                                                             │
│  Stage 1 → Stage 2 → Stage 3 → Stage 4                      │
│  (each stage only runs if the previous one didn't decide)   │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
Stage 1: DEDUPLICATION CHECK
(Is this notification one we already saw recently?)
        │
        ├── Duplicate found → classification: NEVER
        │                   → reason logged → pipeline STOPS
        └── Not a duplicate → continue to Stage 2
        │
        ▼
Stage 2: ALERT FATIGUE CHECK
(Has this user received too many notifications already?)
        │
        ├── User overwhelmed → classification: LATER
        │                    → reason logged → pipeline STOPS
        └── User is fine → continue to Stage 3
        │
        ▼
Stage 3: RULE ENGINE CHECK
(Does any admin-configured rule match this notification?)
        │
        ├── Rule matched → classification: NOW / LATER / NEVER
        │               → reason logged → pipeline STOPS
        └── No rule matched → continue to Stage 4
        │
        ▼
Stage 4: CLAUDE AI
(Ask Claude to read the notification and decide)
        │
        ├── AI responds → classification: NOW / LATER / NEVER
        │              → confidence score stored
        │              → reasoning stored
        └── AI fails → fallback (keyword rules) → classification made
        │
        ▼
MongoDB updated with final classification
        │
        ▼
AuditLog entry created
(permanent record of who, what, why, when — never deleted)
        │
        ▼
Socket.IO emits event to all connected dashboards
(Like a push notification to every browser watching the dashboard)
        │
        ▼
Dashboard updates in real time — no refresh needed
```

### In simple words
The operator clicks submit. The system says "got it!" immediately. Then in the background it runs 4 checks and makes a decision. The dashboard updates automatically when the decision is made. The whole thing takes 1-3 seconds total.

---

## Flow 2 — Failure Path (AI Service Goes Down)

### What happens step by step when Claude AI is unavailable or shuts down or it dies
```
Stage 4 reached — sending notification to Claude AI
        │
        ▼
Attempt 1: Call Claude API
        │
        ├── Success → done (normal flow)
        └── Failure → log error → wait 1 second
        │
        ▼
Attempt 2: Call Claude API again
        │
        ├── Success → done
        └── Failure → log error → wait 2 seconds
        │
        ▼
Attempt 3: Call Claude API one more time
        │
        ├── Success → done
        └── Failure → all 3 attempts exhausted
        │
        ▼
circuitBreaker.recordFailure() called
failures count goes up by 1

If failures >= 5 (threshold):
        │
        ▼
CIRCUIT BREAKER → OPENS
(Like a real electrical circuit breaker tripping)
"Stop calling Claude for 60 seconds — it's clearly down"
        │
        ▼
FALLBACK CLASSIFICATION runs instead:
Uses keyword rules similar to Round 1:
- Contains "security" or "urgent" or priority="critical" → NOW
- Contains "marketing" or "promo" or "discount" → NEVER
- Everything else → LATER
Result stored with is_fallback: true
        │
        ▼
AuditLog records:
- classification made
- ai_used: false
- ai_is_fallback: true
- reason: "Fallback: keyword rules used — AI unavailable"
        │
        ▼
Health endpoint reports:
GET /health → { "ai_circuit_breaker": { "state": "OPEN", "failures": 5 } }
        │
        ▼
After 60 seconds → circuit breaker moves to HALF_OPEN
"Let me try one careful test call to Claude"
        │
        ├── Test succeeds → CLOSED (back to normal) ✅
        └── Test fails → back to OPEN → wait another 60 seconds
```

### In simple words:
Think of the circuit breaker like a doctor monitoring a sick person. First it tries 3 times (with increasing wait times). If all 3 fail, it stops trying for 60 seconds so it doesn't make things worse. During that time it uses backup keyword rules (like a human doing a quick manual check). After 60 seconds it carefully tries once more. If that works, everything goes back to normal.

---

## Flow 3 — LATER Queue Processing

### How deferred notifications get processed automatically
```
Every 5 minutes — node-cron wakes up the background job:
        │
        ▼
Query MongoDB for deferred notifications:
- status = "deferred"
- later_process_after <= now (due time has passed)
- later_attempts < 3 (hasn't failed too many times)
- Limit: 50 at a time (prevents overload)
        │
        ▼
For each deferred notification:
        │
        ▼
Send to Claude AI for reclassification
(Maybe NOW is the right time to deliver it)
        │
        ├── SUCCESS:
        │   - Update classification (could be NOW, LATER again, or NEVER)
        │   - Update status to "classified"
        │   - Write new AuditLog entry
        │   - later_attempts + 1
        │
        └── FAILURE:
            - later_attempts + 1
            │
            ├── attempts < 3:
            │   Retry in 30 min (attempt 1) or 60 min (attempt 2)
            │   (Exponential backoff — waits longer each time)
            │
            └── attempts >= 3:
                Move to Dead Letter Queue
                "We tried 3 times. Saving it for investigation."
                status = "failed"
                DeadLetter record created with full failure details
        │
        ▼
Job logs: "processed: 5, succeeded: 4, failed: 1"
Goes back to sleep for 5 minutes
```

### understand at ease
Imagine a "to-do later" pile on your desk. Every 5 minutes an assistant goes through that pile, picks up each item, tries to process it, and either completes it or puts it back with a note. If something fails 3 times in a row, it goes into a special "problem pile" for a manager to investigate. Nothing ever gets silently thrown away.

---

## Flow 4 — Rule Change Flow

### What happens when an admin creates or edits a rule
```
Admin opens Rules Manager page in browser
        │
        ▼
Frontend fetches existing rules:
GET /api/rules
Returns all active rules sorted by priority
        │
        ▼
Admin creates new rule:
Example: "IF source equals 'billing-service' → NOW"
Fills form → clicks Save
        │
        ▼
Frontend sends:
POST /api/rules
Body: { name, conditions, action, priority }
        │
        ▼
JWT Middleware: checks token + checks role = "admin"
(Operators cannot create rules — admins only)
        │
        ▼
rulesController.js saves rule to MongoDB
New Rule document created with isActive: true
        │
        ▼
API responds: "Rule created ✅"
Frontend shows new rule in the list immediately
        │
        ▼
Next notification that arrives:
ruleEngine.js fetches ALL active rules FRESH from MongoDB
(No caching — always reads latest rules)
New rule is included automatically
If it matches → new rule takes effect immediately
```

### In general:
Think of rules like a list of instructions pinned on a notice board. When an admin pins a new instruction, the next worker who walks past reads the board and follows the new instruction immediately. No system restart needed. No code changes. It just works — because we read the board fresh every time.

---

## Flow 5 — Deduplication Flow

### How the system catches duplicate and near-duplicate notifications
```
New notification arrives: 
"Login from new device detected"
user_id: "user-001"
event_type: "security.alert"
        │
        ▼
CHECK 1 — Exact dedupe_key match
(Fastest check — like checking a unique ticket number)
        │
        ├── Same dedupe_key seen in last 30 minutes?
        │   YES → DUPLICATE → NEVER → Stop
        └── NO → continue
        │
        ▼
CHECK 2 — Content hash match
(Like checking a fingerprint of the exact message)
Generate SHA256 hash of: user_id + event_type + source + message
        │
        ├── Same hash seen in last 30 minutes?
        │   YES → DUPLICATE → NEVER → Stop
        └── NO → continue
        │
        ▼
CHECK 3 — Near-duplicate detection
(Like checking if two sentences mean the same thing)

Recent notifications for same user + same event_type:
["Login from new device detected", "New device login alert"]

Compare new message against each recent message:
Using Dice Coefficient algorithm (string-similarity library)

"Login from new device detected"
vs
"New device login alert"
Similarity score: 0.71 (71%)

Threshold: 0.85 (85%)
71% < 85% → NOT a near-duplicate → continue

BUT:
"Login from new device detected"
vs  
"Login from new device detected 2"
Similarity score: 0.94 (94%)
94% >= 85% → NEAR-DUPLICATE → NEVER → Stop
        │
        ▼
All 3 checks passed → NOT a duplicate ✅
Save content hash for future checks
Continue to next pipeline stage
```

### Big idea - simple words:
We check for duplicates in 3 ways — from fastest to slowest:

1. **Ticket number check** — did we see this exact unique ID before? (instant)
2. **Fingerprint check** — is this the exact same message word for word? (very fast)
3. **Similarity check** — is this message 85% similar to something we just saw? (fast)

If any check says "we've seen this before" — the notification is dropped with NEVER and we explain why in the audit log.

---

## Real-Time Dashboard — How It Updates Without Refresh
```
Server (Express + Socket.IO)          Browser (Next.js + Socket.IO client)
        │                                         │
        │    WebSocket connection established     │
        │◄────────────────────────────────────────│
        │                                         │
Notification classified                           │
        │                                         │
emitUpdate() called:                              │
io.emit('notification_update', {                  │
  classification: 'NOW',                          │
  reason: 'Security rule matched'                 │
})                                               │
        │──── pushed instantly ──────────────────►│
        │                                         │
        │                               Dashboard re-renders
        │                               Stats update
        │                               New event appears
        │                               in Recent Events list
```

### In general think like:
The dashboard has a permanent open phone line to the server (WebSocket). When any notification gets classified, the server immediately calls through that phone line and says "hey, something just happened!" The dashboard updates instantly — no refresh button needed.

---

## Database Collections — What's Stored Where

| Collection | What it stores | Never deleted? |
|------------|---------------|----------------|
| users | Login accounts, roles, hashed passwords | Soft delete only |
| notifications | Every notification received + classification | Soft delete only |
| auditlogs | Every decision + reason + timing | **Append only — never modified** |
| rules | Admin-configured classification rules | Soft delete only |
| fatiguesettings | Max notifications per hour/day limits | Updated in place |
| deadletters | Failed notifications after 3 retries | Never deleted |

> **Soft delete** means we never actually remove data. We just mark it as `isDeleted: true`. This means data can always be recovered and the audit trail is never broken.