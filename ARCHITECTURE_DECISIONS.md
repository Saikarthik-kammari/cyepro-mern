# Architecture Decisions

> These are the 6 decisions I made while building this system in my logical and my matching things with real world analogies.

---

## Decision 1 — Near-Duplicate Detection

**Which approach did I use?**

I used three checks, running in order from fastest to slowest:

**Check 1 — Exact dedupe_key match**
If the sender provides a `dedupe_key`, I look for the same key in the last 30 minutes for the same user. This is a single indexed MongoDB query — extremely fast.

In simple: like checking if you already have a ticket with the same serial number.

**Check 2 — SHA256 content hash**
I generate a fingerprint of the notification by hashing: `user_id + event_type + source + message` together using the SHA256 algorithm. If the same fingerprint exists in the last 30 minutes, it's an exact duplicate.

In my analogical way: like checking a fingerprint. Even if the message looks slightly different, the fingerprint doesn't lie.

**Check 3 — String similarity using Dice Coefficient**
I compare the new message against recent messages for the same user and event type using the `string-similarity` npm library. If similarity is 85% or above — I treat it as a near-duplicate.

In simple terms: like asking "do these two sentences basically say the same thing?" — even if the exact words are different.

Example of what I tested:
```
"Login from new device detected"     ← new notification
"New device login detected"          ← seen 5 minutes ago
Similarity: 87% → NEAR-DUPLICATE → NEVER
```

**Why did I choose this over other options?**

The main alternative I considered was an ML embedding model like sentence-transformers. That would be more semantically accurate — but it would require a separate ML service, add 200-500ms latency to every notification, cost money per call, and be complete overkill for short notification messages.

I chose Dice Coefficient because it's fast, free, runs inside my Node.js process with no extra service, and works well for notification text which tends to be structurally similar when it's a duplicate. It was the right tool for this scale.

**Where does my approach fail?**

- Two notifications that mean the same thing but use completely different words: "Your account was breached" vs "Security compromise detected" — similarity might be below 85% even though they're the same event. My system would not catch this as a duplicate.
- Very short messages like "Error" vs "Failure" — similarity is low but they might mean the same thing.

**At what scale does it break down?**

Check 3 is O(n) — it compares against every recent notification for that user. Up to ~1,000 recent notifications this runs in under 5ms. At 10,000+ recent notifications per user it becomes noticeably slow.

If I were building this for production scale, I'd replace Check 3 with MinHash or SimHash — mathematical techniques that reduce any message to a fixed-size fingerprint and compare fingerprints in O(1) time regardless of volume.

---

## Decision 2 — Asynchronous AI Processing

**Why did I make AI processing asynchronous?**

Claude AI takes 2-3 seconds to respond on average. Sometimes up to 8-10 seconds under load. I decided early on that making the user wait for AI before responding was unacceptable.

Here's exactly what happens in my async design:
```
1. Notification arrives at my API
2. I save it to MongoDB immediately with status: "processing"
3. I respond to the user instantly: "Accepted ✅" — under 100ms
4. User sees instant confirmation and moves on
5. Claude thinks in the background (2-3 seconds)
6. MongoDB gets updated with the final classification
7. Dashboard updates via Socket.IO — no refresh needed
```

Best example for this is like ordering food at a restaurant. The waiter doesn't stand at your table waiting for the kitchen to cook. He takes your order, says "coming right up!", and walks away. The food arrives later. You're not blocked.

**What would break if I made it synchronous?**

1. **User experience would degrade** — every submit would take 2-3 seconds minimum. Under Claude API load, 8-10 seconds. Users would think the system is broken.

2. **The server would freeze under load** — Node.js is single-threaded. If 20 users submit simultaneously and each request blocks waiting for AI, all 20 requests queue up. The 20th user waits over a minute.

3. **HTTP timeouts** — most HTTP clients timeout after 30 seconds. A slow AI response would cause the request to fail even if Claude eventually responded.

**What tradeoff did I introduce by going async?**

For 2-3 seconds after submission, the notification shows as "PROCESSING" in the dashboard before the final classification appears. There's a brief window where the classification isn't final yet.

**How I handle this tradeoff:**

- I set a preliminary classification of `LATER` immediately — conservative default. Better to defer than to miss something urgent.
- Socket.IO pushes the final classification to the dashboard the moment AI finishes — no manual refresh.
- I only write the audit log after the final classification — never on the preliminary one.
- I return the notification ID instantly so the user can track that specific notification.

---

## Decision 3 — Database Model Choices

**Where did MongoDB's document model help me?**

Notifications are semi-structured data. A security alert has different metadata than a payment failure. A calendar reminder has different fields than a marketing email.

In MongoDB, each notification document stores exactly the fields it needs — no empty columns, no schema migrations when a new event type is added.

Example — two notifications I store in MongoDB:
```json
// Security alert
{ "event_type": "security.alert", "ip_address": "192.168.1.1", "device": "iPhone" }

// Payment failure
{ "event_type": "payment.failed", "amount": 99, "currency": "USD", "card_last4": "4242" }
```

MongoDB also made the nested `ai_result` object completely natural to store:
```json
"ai_result": {
  "model": "claude-3-5-haiku",
  "confidence": 0.94,
  "reasoning": "Security alert requires immediate attention",
  "is_fallback": false
}
```

In SQL this would need a separate `ai_results` table with a foreign key — more joins, more complexity for something I just want to read together.

**Where did the relational model help me (Spring Boot stack)?**

Rules have a strict, consistent structure — every rule has conditions, operators, values, priority, action. This rigid structure is exactly what relational databases are built for.

Audit log reporting is also cleaner in SQL. A query like "show me all decisions triggered by rule X in the last 7 days grouped by classification" is 3 lines of SQL. The equivalent MongoDB aggregation pipeline is 15 lines.

PostgreSQL's ACID transactions also helped me with concurrent writes. If two notifications arrive simultaneously for the same user, PostgreSQL's row-level locking prevents a race condition where both pass the fatigue check before either is written.

**Where did each one make my life harder?**

MongoDB made complex reporting queries verbose. I had to learn the aggregation pipeline syntax which is powerful but much harder to read than SQL.

PostgreSQL required Flyway migrations for every schema change. Adding a new field to the notifications table meant writing a migration file, testing it locally, and running it on the server. In MongoDB I just added the field — no migration needed. During rapid development this slowed me down.

---

## Decision 4 — Failure Handling Thresholds

**What numbers did I choose and why?**

| Setting | Value I chose | My reasoning |
|---------|--------------|--------------|
| Retry attempts | 3 | Enough to handle temporary network blips, not so many that I waste time on a dead service |
| Retry delays | 1s → 2s → 4s | Exponential backoff — gives Claude time to recover between attempts without waiting too long |
| Circuit breaker opens after | 5 failures | Fair chance before shutting off — one bad minute won't trigger it |
| Circuit breaker stays open | 60 seconds | Enough time for Claude's infrastructure to recover from a brief outage |

**Why did I choose exponential backoff (1s, 2s, 4s) instead of fixed delays?**

If Claude is overloaded, calling it again immediately makes the overload worse. Waiting longer each time gives the service breathing room. This is standard practice across all distributed systems — AWS, Google, Netflix all use exponential backoff for the same reason.

**What happens if my threshold is too LOW — circuit breaker opens after 2 failures?**

One slow network request trips the circuit breaker. Claude goes "offline" in my system even though it's mostly fine. Users get fallback classifications unnecessarily. The circuit breaker becomes unreliable — like a car alarm that goes off every time someone walks past.

**What happens if my threshold is too HIGH — circuit breaker opens after 50 failures?**

50 notifications all go through 3 retry attempts each before the circuit breaker trips. That's 150 failed API calls, each waiting 1-4 seconds. Over 5 minutes of wasted time before my system protects itself. Like a smoke alarm that only goes off after the house has already burned down.

**What happens if my retry delay is too SHORT — retry immediately with no wait?**

Under high load, hundreds of notifications all retry immediately, creating a thundering herd that makes the outage worse. I'd be hammering a struggling service with even more requests.

**My numbers are a balanced middle ground for this scale.** Production systems at Netflix or Uber use dynamic thresholds based on error rate percentage over a rolling time window — not fixed counts. That would be my next iteration.

---

## Decision 5 — LATER Queue Design

**Why did I use a scheduled background job instead of event-driven?**

I considered an event-driven approach using a message broker like RabbitMQ or AWS SQS. When a notification is classified as LATER, a message goes on a queue. A consumer picks it up exactly when it's due.

That sounds better on paper. Here's why I didn't do it:

It would require me to run a separate message broker service, build a separate consumer service, handle distributed coordination so two consumers don't process the same item, and manage three deployed services instead of one.

A cron job every 5 minutes is 4 lines of code using `node-cron`. It runs inside my existing backend process. No extra services, no extra deployment, no extra cost.

For the scale this system operates at, the cron job is the right tool. I chose simplicity over theoretical perfection.

**What does my 5-minute interval trade off?**

A notification classified as LATER and due at 10:01am might not be processed until 10:05am. Maximum delay: 4 minutes and 59 seconds.

For LATER items I decided this is completely acceptable — by definition they weren't urgent. For NOW items this never applies — they're classified synchronously in the pipeline and processed immediately.

**Under what conditions would I switch to event-driven?**

1. **LATER queue volume exceeds ~10,000 items** — my cron job processes 50 items every 5 minutes. If the backlog grows faster than that, I'd need SQS + Lambda.

2. **SLA requires sub-minute processing of deferred events** — if "LATER" means "within 30 seconds" not "within 5 minutes", cron isn't precise enough.

3. **Multiple backend instances** — if I run 3 backend servers, all 3 cron jobs run simultaneously and try to process the same LATER items. With a message broker each item is consumed by exactly one instance. At that scale I'd switch to AWS SQS.

---

## Decision 6 — Two Stacks, One Architecture

**What did I keep consistent across both stacks?**

| What I kept the same | Why I kept it the same |
|---------------------|----------------------|
| 4-stage pipeline order: dedup → fatigue → rules → AI | This order IS the architecture — changing it would mean a different system |
| Classification values: NOW / LATER / NEVER | These are the product requirement — non-negotiable |
| API endpoint shapes | I used the same Next.js frontend for both — the contracts had to match |
| The frontend (Next.js) | I built one UI, only `NEXT_PUBLIC_API_URL` changes between stacks |
| AI prompt template | Same classification logic, same expected output format |
| Fallback keyword rules | Same business logic regardless of what language it's written in |
| Dead letter concept | Data safety is non-negotiable in both stacks |

**What diverged between the two stacks?**

| Aspect | MERN | Spring Boot |
|--------|------|-------------|
| Database | MongoDB | PostgreSQL |
| Schema changes | Just add fields, no migration needed | Flyway migration files required for every change |
| ORM | Mongoose | JPA + Hibernate |
| Background job | node-cron (3 lines) | @Scheduled annotation |
| Real-time | Socket.IO | Spring WebSocket with STOMP |
| Authentication | jsonwebtoken library — I had full control | Spring Security — opinionated, I had to adapt |

**Was any divergence forced by the framework or was it my choice?**

Some was forced. Spring Security has its own deeply opinionated way of handling JWT. In Node.js I wrote the JWT verification myself in 10 lines and had complete control. In Spring Boot, Spring Security takes over the entire authentication filter chain — I had to adapt my design to fit its conventions.

PostgreSQL requiring Flyway migrations was also forced — that's simply how relational databases work in production. Schema changes must be versioned and tracked.

Some was my choice. I decided to use the same Next.js frontend for both stacks rather than building a separate one for Spring Boot. This saved time and kept the UI consistent — only the environment variable pointing to the backend changes. That was a pragmatic decision given my time constraints, and I think it was the right one.