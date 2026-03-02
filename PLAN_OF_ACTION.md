# Plan of Action

## Overview
Build a Notification Prioritization Engine that classifies notifications as NOW, LATER, or NEVER using a 4-stage pipeline with Claude AI integration.

## Stack 1 — MERN (Completed ✅)

### Phase 1 — Foundation
- [x] Express server setup
- [x] MongoDB connection
- [x] JWT authentication (register/login)
- [x] Role-based access (admin/operator)

### Phase 2 — Database Models
- [x] User model
- [x] Notification model (with dedup fields, AI result, status tracking)
- [x] AuditLog model (full decision history)
- [x] Rule model (dynamic admin rules)
- [x] FatigueSettings model (configurable limits)
- [x] DeadLetter model (failure safety net)

### Phase 3 — Decision Pipeline
- [x] Circuit breaker (CLOSED/OPEN/HALF_OPEN states)
- [x] Claude AI service (3 retries + exponential backoff + fallback)
- [x] Deduplication service (exact key + hash + 85% similarity)
- [x] Alert fatigue service (hourly/daily/cooldown limits)
- [x] Rule engine (dynamic DB rules, priority sorted)
- [x] Decision pipeline (master orchestrator, async AI)

### Phase 4 — API Layer
- [x] Auth routes (login/register)
- [x] Notification routes (submit, list, dashboard, metrics, later-queue)
- [x] Rules routes (CRUD + toggle)
- [x] Admin routes (audit logs, fatigue settings)
- [x] JWT middleware (protect + adminOnly)
- [x] Health endpoint (circuit breaker state + DB status)
- [x] Background job (LATER queue, every 5 min, dead letter after 3 fails)

### Phase 5 — Frontend (Next.js)
- [x] Login page (demo credentials visible, click to fill)
- [x] Dashboard (live stats, Socket.IO, 10s refresh)
- [x] Event Simulator (presets, form, instant result)
- [x] Audit Log (searchable, filterable history)
- [x] LATER Queue (deferred items view)
- [x] Rules Manager (create/edit/delete/toggle rules)
- [x] Metrics (charts and trends)

### Phase 6 — Deployment
- [x] Backend deployed to Railway
- [x] Frontend deployed to Vercel
- [x] Environment variables configured
- [x] Live URLs verified

## Stack 2 — Spring Boot (In Progress)

### Planned
- [ ] Spring Boot project setup
- [ ] PostgreSQL models (JPA entities)
- [ ] Decision pipeline (same 4-stage logic)
- [ ] REST controllers
- [ ] WebSocket for real-time
- [ ] Deploy to Railway

## Live URLs

| Service | URL |
|---------|-----|
| MERN Frontend | https://cyepro-frontend.vercel.app |
| MERN Backend | https://cyepro-mern-production.up.railway.app |
| Health Check | https://cyepro-mern-production.up.railway.app/health |

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@cyepro.com | Admin@123 |
| Operator | operator@cyepro.com | Operator@123 |