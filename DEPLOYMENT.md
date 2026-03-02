# Deployment

## Live URLs

| Service | URL |
|---------|-----|
| MERN Frontend | https://cyepro-frontend.vercel.app |
| MERN Backend | https://cyepro-mern-production.up.railway.app |
| Health Check | https://cyepro-mern-production.up.railway.app/health |

## Where Everything Is Deployed

- **Backend** → Railway (Node.js server + MongoDB Atlas)
- **Frontend** → Vercel (Next.js)
- **Database** → MongoDB Atlas (cloud managed, not local)

## Environment Variables I Set In Production

**Railway (Backend):**
```
MONGO_URI=mongodb+srv://...
JWT_SECRET=...
JWT_EXPIRES_IN=7d
ANTHROPIC_API_KEY=...
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT=60000
FRONTEND_URL=https://cyepro-frontend.vercel.app
NODE_ENV=production
```

**Vercel (Frontend):**
```
NEXT_PUBLIC_API_URL=https://cyepro-mern-production.up.railway.app
```

## Local vs Production Differences

| | Local | Production |
|--|-------|-----------|
| Backend URL | http://localhost:5000 | https://cyepro-mern-production.up.railway.app |
| Frontend URL | http://localhost:3000 | https://cyepro-frontend.vercel.app |
| Database | MongoDB Atlas (same) | MongoDB Atlas (same) |
| Environment | .env file | Railway/Vercel dashboard |

## How To Trigger Redeployment

**Backend (Railway):**
```bash
git push origin main
```
Railway auto-deploys on every push to main.

**Frontend (Vercel):**
```bash
git push origin main
```
Vercel auto-deploys on every push to main.

## How To Run Locally
```bash
# Backend
cd cyepro-mern
npm install
node scripts/seed.js
node server.js

# Frontend (new terminal)
cd cyepro-frontend
npm install
npm run dev
```