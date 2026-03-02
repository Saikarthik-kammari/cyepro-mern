require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const { setSocketIo } = require('./services/decisionPipeline');
const { startLaterQueueJob } = require('./jobs/laterQueueJob');
const circuitBreaker = require('./services/circuitBreaker');

const app = express();
const server = http.createServer(app);

// Socket.IO setup for real time dashboard
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST']
  }
});

// Give pipeline access to socket.io
setSocketIo(io);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/rules', require('./routes/rulesRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// Health endpoint - shows real system state
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    ai_circuit_breaker: circuitBreaker.getStatus(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    version: '1.0.0'
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Cyepro MERN Backend Running', 
    version: '1.0.0' 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.log('Unhandled error:', err.message);
  res.status(500).json({ message: 'Internal server error' });
});

// Socket.IO connection
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Connect to MongoDB then start server
mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 10000,
})
.then(() => {
  console.log('MongoDB Connected');
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Start background job after server is up
    startLaterQueueJob();
  });
})
.catch(err => {
  console.log('MongoDB connection error:', err.message);
  process.exit(1);
});
