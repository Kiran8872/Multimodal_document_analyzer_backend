require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./services/database');
const documentRoutes = require('./routes/documents');

const app = express();
const PORT = process.env.PORT || 5000;
let databaseReadyPromise = null;

function getAllowedOrigins() {
  return (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getAllowedVercelProjects() {
  return (process.env.CORS_VERCEL_PROJECTS || 'multimodal-document-analyzer-frontend,multimodal-document-analyzer-fronte')
    .split(',')
    .map((project) => project.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedOrigin(origin) {
  if (!origin) return true;

  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
    return true;
  }

  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'https:' || !hostname.endsWith('.vercel.app')) {
      return false;
    }

    return getAllowedVercelProjects().some((project) =>
      hostname === `${project}.vercel.app` || hostname.startsWith(`${project}-`)
    );
  } catch {
    return false;
  }
}

// Middleware
app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

async function ensureDatabaseConnection() {
  if (!databaseReadyPromise) {
    databaseReadyPromise = db.connectToDatabase().catch((error) => {
      databaseReadyPromise = null;
      throw error;
    });
  }

  return databaseReadyPromise;
}

function sendApiOverview(req, res) {
  res.json({
    status: 'ok',
    service: 'Multimodal Document Analyzer API',
    apiBase: '/api',
    endpoints: {
      health: '/api/health',
      status: '/api/status',
      documents: '/api/documents',
      upload: '/api/upload',
      compare: '/api/compare'
    }
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Multimodal Document Analyzer API is running',
    timestamp: new Date().toISOString()
  });
});

app.get(['/', '/api', '/api/', '/api/index', '/api/index.js'], sendApiOverview);

// Routes that need document storage
app.use('/api', async (req, res, next) => {
  try {
    await ensureDatabaseConnection();
    next();
  } catch (error) {
    console.error('Database initialization error:', error.message);
    res.status(503).json({
      error: 'Database unavailable',
      message: 'Set a valid MONGODB_URI for the deployed backend.'
    });
  }
}, documentRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum size is 10MB' });
  }
  
  if (err.code === 'UNSUPPORTED_FILE_TYPE') {
    return res.status(400).json({ error: err.message });
  }
  
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
async function startServer() {
  try {
    // Connect to database
    await ensureDatabaseConnection();
  } catch (error) {
    console.error('Failed to start server:', error.message);
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
