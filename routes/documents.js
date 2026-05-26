const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const { upload, uploadMemory } = require('../services/fileUpload');
const { extractFromPdf } = require('../services/pdfExtractor');
const { extractFromDocx } = require('../services/docxExtractor');
const { extractFromTxt } = require('../services/txtExtractor');
const { extractFromImage } = require('../services/ocrExtractor');
const { analyzeDocument, askQuestion, generateStudyPlan, getAiStatus } = require('../services/aiAnalysis');
const { getLangSmithStatus } = require('../services/langsmithTracing');
const db = require('../services/database');
const { getFileExtension, formatFileSize, generateUniqueFilename } = require('../utils/helpers');

/**
 * GET /api/status
 * Runtime status for frontend diagnostics
 */
router.get('/status', async (req, res) => {
  try {
    const documentCount = await db.getDocumentCount();

    res.json({
      status: 'ok',
      documents: documentCount,
      storage: db.getDatabaseStatus(),
      ai: getAiStatus(),
      observability: getLangSmithStatus()
    });
  } catch (error) {
    console.error('Status error:', error.message);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

/**
 * POST /api/upload
 * Upload and analyze a document
 */
router.post('/upload', uploadMemory.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;
    const fileExt = getFileExtension(file.originalname);
    const uploadsDir = path.join(__dirname, '../uploads');
    const fileName = file.filename || generateUniqueFilename(file.originalname);
    const filePath = file.path || path.join(uploadsDir, fileName);

    // Persist memory uploads to disk so the existing extractors can read them.
    if (!file.path && file.buffer) {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      fs.writeFileSync(filePath, file.buffer);
    }

    // Extract text based on file type
    let extractedText = '';
    let pageCount = 1;

    switch (fileExt) {
      case 'pdf':
        const pdfResult = await extractFromPdf(filePath);
        extractedText = pdfResult.text;
        pageCount = pdfResult.pageCount;
        break;
      
      case 'docx':
        const docxResult = await extractFromDocx(filePath);
        extractedText = docxResult.text;
        pageCount = docxResult.pageCount;
        break;
      
      case 'txt':
        const txtResult = await extractFromTxt(filePath);
        extractedText = txtResult.text;
        pageCount = txtResult.pageCount;
        break;
      
      case 'jpg':
      case 'jpeg':
      case 'png':
        const ocrResult = await extractFromImage(filePath);
        extractedText = ocrResult.text;
        break;
      
      default:
        return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Save initial document with extracted text
    const documentData = {
      fileName: fileName,
      originalName: file.originalname,
      fileType: fileExt,
      fileSize: file.size,
      filePath: filePath,
      pageCount: pageCount,
      processingStatus: 'processing',
      extractedText: extractedText
    };

    const savedDoc = await db.saveDocument(documentData);

    try {
      // Analyze document with AI
      const analysis = await analyzeDocument(extractedText);
      
      // Update document with analysis
      const updatedDoc = await db.updateDocument(savedDoc._id, {
        processingStatus: 'completed',
        analysis: analysis
      });

      res.json({
        message: 'Document uploaded and analyzed successfully',
        document: formatDocumentResponse(updatedDoc)
      });
    } catch (aiError) {
      // If AI fails, still return the extracted text
      console.error('AI analysis error:', aiError.message);
      
      const updatedDoc = await db.updateDocument(savedDoc._id, {
        processingStatus: 'completed'
      });

      res.json({
        message: 'Document uploaded. AI analysis failed, but text was extracted.',
        document: formatDocumentResponse(updatedDoc),
        warning: 'AI analysis could not be completed'
      });
    }
  } catch (error) {
    console.error('Upload error:', error.message);
    res.status(500).json({ error: 'Failed to upload document: ' + error.message });
  }
});

/**
 * GET /api/documents
 * Get all uploaded documents
 */
router.get('/documents', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    
    const documents = await db.getAllDocuments(limit, skip);
    
    res.json({
      documents: documents.map(formatDocumentListItem)
    });
  } catch (error) {
    console.error('Get documents error:', error.message);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

/**
 * GET /api/documents/:id
 * Get single document with analysis
 */
router.get('/documents/:id', async (req, res) => {
  try {
    const document = await db.getDocumentById(req.params.id);
    
    res.json({
      document: formatDocumentResponse(document)
    });
  } catch (error) {
    console.error('Get document error:', error.message);
    if (error.message === 'Document not found') {
      res.status(404).json({ error: 'Document not found' });
    } else {
      res.status(500).json({ error: 'Failed to fetch document' });
    }
  }
});

/**
 * POST /api/documents/:id/chat
 * Ask a question about a document
 */
router.post('/documents/:id/chat', async (req, res) => {
  try {
    const { question } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const document = await db.getDocumentById(req.params.id);
    
    // Get the extracted text
    const extractedText = document.extractedText;
    
    if (!extractedText) {
      return res.status(400).json({ error: 'No text extracted from this document' });
    }

    // Get AI answer
    const answer = await askQuestion(extractedText, question);
    
    // Save chat history
    await db.addChatMessage(req.params.id, 'user', question);
    await db.addChatMessage(req.params.id, 'assistant', answer);
    
    res.json({
      question: question,
      answer: answer
    });
  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ error: 'Failed to get answer' });
  }
});

/**
 * DELETE /api/documents/:id
 * Delete a document
 */
router.delete('/documents/:id', async (req, res) => {
  try {
    const document = await db.getDocumentById(req.params.id);
    
    // Delete the file from filesystem
    if (document.filePath && fs.existsSync(document.filePath)) {
      fs.unlinkSync(document.filePath);
    }
    
    // Delete from database
    await db.deleteDocument(req.params.id);
    
    res.json({
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('Delete error:', error.message);
    if (error.message === 'Document not found') {
      res.status(404).json({ error: 'Document not found' });
    } else {
      res.status(500).json({ error: 'Failed to delete document' });
    }
  }
});

/**
 * POST /api/compare
 * Compare two documents
 */
router.post('/compare', async (req, res) => {
  try {
    const { docId1, docId2 } = req.body;
    
    if (!docId1 || !docId2) {
      return res.status(400).json({ error: 'Two document IDs required' });
    }

    const doc1 = await db.getDocumentById(docId1);
    const doc2 = await db.getDocumentById(docId2);

    const { compareDocuments } = require('../services/documentComparison');
    const comparison = await compareDocuments(doc1, doc2);

    res.json({
      document1: formatDocumentListItem(doc1),
      document2: formatDocumentListItem(doc2),
      comparison: comparison
    });
  } catch (error) {
    console.error('Compare error:', error.message);
    res.status(500).json({ error: 'Failed to compare documents' });
  }
});

/**
 * POST /api/documents/:id/study-plan
 * Generate study plan
 */
router.post('/documents/:id/study-plan', async (req, res) => {
  try {
    const document = await db.getDocumentById(req.params.id);
    
    const studyPlan = await generateStudyPlan(document.extractedText);
    
    res.json({
      studyPlan: studyPlan
    });
  } catch (error) {
    console.error('Study plan error:', error.message);
    res.status(500).json({ error: 'Failed to generate study plan' });
  }
});

// Helper function to format document response
function formatDocumentResponse(doc) {
  return {
    _id: doc._id,
    fileName: doc.fileName,
    originalName: doc.originalName,
    fileType: doc.fileType,
    fileSize: formatFileSize(doc.fileSize),
    fileSizeBytes: doc.fileSize,
    pageCount: doc.pageCount,
    processingStatus: doc.processingStatus,
    uploadedAt: doc.uploadedAt,
    extractedText: doc.extractedText,
    analysis: doc.analysis,
    chatHistory: doc.chatHistory
  };
}

// Helper function to format document list item (smaller)
function formatDocumentListItem(doc) {
  return {
    _id: doc._id,
    originalName: doc.originalName,
    fileType: doc.fileType,
    fileSize: formatFileSize(doc.fileSize),
    processingStatus: doc.processingStatus,
    uploadedAt: doc.uploadedAt,
    title: doc.analysis?.title || doc.originalName,
    documentType: doc.analysis?.documentType || 'unknown'
  };
}

module.exports = router;
