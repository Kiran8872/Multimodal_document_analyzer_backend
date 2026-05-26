const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, '..', 'data', 'inmemory_db.json');

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ documents: [] }, null, 2));
}

function loadData() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return { documents: [] };
  }
}

function saveData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

async function connectToDatabase() {
  // No-op for in-memory
  return true;
}

async function disconnectFromDatabase() {
  return true;
}

async function saveDocument(documentData) {
  const data = loadData();
  const doc = {
    _id: uuidv4(),
    uploadedAt: new Date().toISOString(),
    chatHistory: [],
    analysis: null,
    ...documentData
  };
  data.documents.push(doc);
  saveData(data);
  return doc;
}

async function getAllDocuments(limit = 50, skip = 0) {
  const data = loadData();
  return data.documents
    .slice()
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .slice(skip, skip + limit)
    .map(d => ({ ...d }));
}

async function getDocumentById(id) {
  const data = loadData();
  const doc = data.documents.find(d => d._id === id);
  if (!doc) throw new Error('Document not found');
  return { ...doc };
}

async function updateDocument(id, updateData) {
  const data = loadData();
  const idx = data.documents.findIndex(d => d._id === id);
  if (idx === -1) throw new Error('Document not found');
  data.documents[idx] = { ...data.documents[idx], ...updateData };
  saveData(data);
  return { ...data.documents[idx] };
}

async function deleteDocument(id) {
  const data = loadData();
  const idx = data.documents.findIndex(d => d._id === id);
  if (idx === -1) throw new Error('Document not found');
  data.documents.splice(idx, 1);
  saveData(data);
  return true;
}

async function addChatMessage(id, role, message) {
  const data = loadData();
  const idx = data.documents.findIndex(d => d._id === id);
  if (idx === -1) throw new Error('Document not found');
  data.documents[idx].chatHistory = data.documents[idx].chatHistory || [];
  data.documents[idx].chatHistory.push({ role, message, timestamp: new Date().toISOString() });
  saveData(data);
  return { ...data.documents[idx] };
}

async function getDocumentCount() {
  const data = loadData();
  return data.documents.length;
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
  getDocumentCount
};
