const mongoose = require('mongoose');
let inMemory = false;
let inMemoryDb = null;
let connectionPromise = null;
try {
  inMemoryDb = require('./inMemoryDb');
} catch (e) {
  inMemoryDb = null;
}
const { Document } = require('../database/models');

/**
 * Connect to MongoDB; fall back to in-memory if connection fails
 */
async function connectToDatabase() {
  if (inMemory || mongoose.connection.readyState === 1) {
    return true;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = connectWithFallback().catch((error) => {
    connectionPromise = null;
    throw error;
  });

  return connectionPromise;
}

async function connectWithFallback() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/multimodal_analyzer';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    return true;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);

    const allowLocalFallback = process.env.ALLOW_LOCAL_DB_FALLBACK !== 'false'
      && process.env.VERCEL !== '1';

    if (allowLocalFallback && inMemoryDb) {
      inMemory = true;
      await inMemoryDb.connectToDatabase();
      console.warn('Using in-memory database fallback. Data will be persisted to backend/data/inmemory_db.json');
      return true;
    }

    throw error;
  }
}

/**
 * Disconnect
 */
async function disconnectFromDatabase() {
  try {
    if (inMemory) {
      if (inMemoryDb) await inMemoryDb.disconnectFromDatabase();
      console.log('In-memory DB disconnected');
    } else {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }
  } catch (error) {
    console.error('Disconnect error:', error.message);
  }
}

// Export functions either backed by mongoose models or by in-memory implementation
async function saveDocument(documentData) {
  if (inMemory) return inMemoryDb.saveDocument(documentData);
  const document = new Document(documentData);
  return await document.save();
}

async function getAllDocuments(limit = 50, skip = 0) {
  if (inMemory) return inMemoryDb.getAllDocuments(limit, skip);
  return await Document.find()
    .sort({ uploadedAt: -1 })
    .limit(limit)
    .skip(skip)
    .select('-extractedText -chatHistory');
}

async function getDocumentById(id) {
  if (inMemory) return inMemoryDb.getDocumentById(id);
  const document = await Document.findById(id);
  if (!document) throw new Error('Document not found');
  return document;
}

async function updateDocument(id, updateData) {
  if (inMemory) return inMemoryDb.updateDocument(id, updateData);
  const document = await Document.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
  if (!document) throw new Error('Document not found');
  return document;
}

async function deleteDocument(id) {
  if (inMemory) return inMemoryDb.deleteDocument(id);
  const document = await Document.findByIdAndDelete(id);
  if (!document) throw new Error('Document not found');
  return true;
}

async function addChatMessage(id, role, message) {
  if (inMemory) return inMemoryDb.addChatMessage(id, role, message);
  const document = await Document.findById(id);
  if (!document) throw new Error('Document not found');
  document.chatHistory.push({ role, message, timestamp: new Date() });
  return await document.save();
}

async function getDocumentCount() {
  if (inMemory) return inMemoryDb.getDocumentCount();
  return await Document.countDocuments();
}

function getDatabaseStatus() {
  return {
    connected: inMemory || mongoose.connection.readyState === 1,
    mode: inMemory ? 'local-json' : 'mongodb',
    readyState: mongoose.connection.readyState
  };
}

module.exports = {
  connectToDatabase,
  disconnectFromDatabase,
  saveDocument,
  getAllDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
  addChatMessage,
  getDocumentCount,
  getDatabaseStatus
};
