# Cyepro Notification Prioritization Engine — MERN Stack

## Live URLs
- **Frontend:** https://cyepro-frontend.vercel.app
- **Backend:** https://cyepro-mern-production.up.railway.app
- **Health Check:** https://cyepro-mern-production.up.railway.app/health

## Demo Credentials
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@cyepro.com | Admin@123 |
| Operator | operator@cyepro.com | Operator@123 |

## Tech Stack
- **Backend:** Node.js, Express, MongoDB, Mongoose
- **Frontend:** Next.js, Tailwind CSS
- **AI:** Claude (Anthropic) with circuit breaker + fallback
- **Real-time:** Socket.IO
- **Deploy:** Railway (backend), Vercel (frontend)

## How To Run Locally

### Backend
```bash
cd cyepro-mern
npm install
node scripts/seed.js
node server.js
```

### Frontend
```bash
cd cyepro-frontend
npm install
npm run dev
```

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login |
| POST | /api/notifications/submit | Submit notification |
| GET | /api/notifications/dashboard | Dashboard stats |
| GET | /api/notifications/later-queue | Deferred items |
| GET | /api/rules | Get all rules |
| POST | /api/rules | Create rule |
| GET | /api/admin/audit | Audit logs |
| GET | /health | System health |