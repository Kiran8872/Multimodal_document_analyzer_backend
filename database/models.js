const mongoose = require('mongoose');

// Document Schema for storing uploaded document metadata and analysis
const documentSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    required: true,
    enum: ['pdf', 'docx', 'txt', 'jpg', 'jpeg', 'png']
  },
  fileSize: {
    type: Number,
    required: true
  },
  filePath: {
    type: String,
    required: true
  },
  pageCount: {
    type: Number,
    default: 1
  },
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  extractedText: {
    type: String,
    default: ''
  },
  analysis: {
    title: String,
    documentType: String,
    summary: String,
    detailedSummary: String,
    keyPoints: [String],
    importantTerms: [{
      term: String,
      definition: String
    }],
    actionItems: [String],
    dates: [String],
    people: [String],
    amounts: [String],
    keywords: [String],
    tablesDetected: [{
      rows: [[String]]
    }],
    studyNotes: String,
    flashcards: [{
      question: String,
      answer: String
    }],
    quizQuestions: [{
      question: String,
      options: [String],
      answer: String,
      explanation: String
    }],
    possibleQuestions: [String]
  },
  chatHistory: [{
    role: String,
    message: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
documentSchema.index({ uploadedAt: -1 });

const Document = mongoose.model('Document', documentSchema);

module.exports = { Document };