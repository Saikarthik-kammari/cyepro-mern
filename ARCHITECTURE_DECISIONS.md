# Architecture Decisions

## Why MongoDB?
Notifications are semi-structured data — different event types have different metadata. MongoDB's flexible schema handles this naturally without migrations. Indexes on user_id + createdAt make time-based queries fast even at scale.

## Why Mongoose Soft Deletes?
Every model has `isDeleted: false` instead of actual deletion. This means:
- Audit trail is never lost
- Deleted rules can be recovered
- All queries simply filter `isDeleted: false`

## Why A 4-Stage Pipeline?
Each stage is independent and fails fast:
- Deduplication catches obvious noise cheaply (no AI cost)
- Fatigue check protects users before expensive AI calls
- Rules handle known patterns instantly
- AI only runs when no cheaper method worked

This order minimizes cost and latency.

## Why Circuit Breaker For AI?
Claude AI is an external dependency. If it goes down:
- Without circuit breaker: every notification waits, times out, wastes resources
- With circuit breaker: after 5 failures, AI calls stop for 60 seconds
- System falls back to keyword-based rules (like Round 1 logic)
- System stays alive even when AI is down

## Why Async AI Processing?
AI takes 2-3 seconds. Users shouldn't wait.
- Notification saved immediately → user gets instant response
- AI runs in background
- Dashboard updates via Socket.IO when AI finishes
- Status field tracks: processing → classified

## Why Dead Letter Queue?
Nothing gets lost. If a notification fails after 3 retries:
- Saved to DeadLetter collection with failure reason
- Can be investigated and replayed later
- Prevents silent data loss

## Why Rules In Database?
Round 1 used a hardcoded rules.json file. Problems:
- Changing rules required code change + server restart
- Non-technical admins couldn't update rules

Solution: Rules stored in MongoDB. Admin changes rules from UI. Takes effect on next notification. Zero downtime.

## Why Socket.IO?
The dashboard needs to show live updates without the user refreshing. Socket.IO pushes updates from server to browser instantly when a classification is made.

## Why Separate Services Folder?
Business logic (deduplication, fatigue, rules, AI) is separated from HTTP handling (controllers). This means:
- Same logic reused by both API routes and background jobs
- Easier to test each service independently
- Bug fixed in one place, fixed everywhere