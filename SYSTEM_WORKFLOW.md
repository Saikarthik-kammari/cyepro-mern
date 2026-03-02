# System Workflow — Notification Prioritization Engine

## How A Notification Gets Classified

Every notification submitted goes through 4 stages in order:
```
Notification Arrives
        │
        ▼
┌─────────────────┐
│ Stage 1         │
│ DEDUPLICATION   │ ──→ Duplicate found? → NEVER → Stop
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ Stage 2         │
│ ALERT FATIGUE   │ ──→ User overwhelmed? → LATER → Stop
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ Stage 3         │
│ RULE ENGINE     │ ──→ Rule matched? → NOW/LATER/NEVER → Stop
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ Stage 4         │
│ CLAUDE AI       │ ──→ AI classifies → NOW/LATER/NEVER
└─────────────────┘
```

## Stage 1 — Deduplication
- Checks exact dedupe_key match within 30 minutes
- Checks content hash match (SHA256)
- Checks string similarity — 85%+ similar = duplicate
- Result: NEVER

## Stage 2 — Alert Fatigue
- Max 10 notifications per hour per user
- Max 50 notifications per day per user
- Max 3 of same type per hour
- 5 minute cooldown for same type + source
- Result: LATER (deferred 1 hour)

## Stage 3 — Rule Engine
- Fetches all active rules from DB (sorted by priority)
- Evaluates conditions (equals, contains, starts_with, in, not_in)
- First matching rule wins
- Result: NOW / LATER / NEVER

## Stage 4 — Claude AI
- Sends notification details to Claude
- 3 retry attempts with exponential backoff (1s, 2s, 4s)
- Circuit breaker: opens after 5 failures, retries after 60s
- Fallback: keyword-based classification if AI unavailable
- Result: NOW / LATER / NEVER

## LATER Queue Background Job
- Runs every 5 minutes via node-cron
- Picks up deferred notifications that are due
- Reclassifies using AI
- Max 3 attempts per notification
- Failed after 3 attempts → Dead Letter Queue

## Real-Time Updates
- Socket.IO emits events to dashboard on every classification
- Dashboard auto-refreshes every 10 seconds as backup