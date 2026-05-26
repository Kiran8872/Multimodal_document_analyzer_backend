/**
 * Helper utility functions for the document analyzer
 */

// Allowed file MIME types and extensions
const ALLOWED_FILE_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'image/jpeg': 'jpg',
  'image/jpeg': 'jpeg',
  'image/png': 'png'
};

const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt', 'jpg', 'jpeg', 'png'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Validate file type based on extension
 */
function validateFileType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

/**
 * Validate file size
 */
function validateFileSize(size) {
  return size <= MAX_FILE_SIZE;
}

/**
 * Sanitize filename for safe storage
 */
function sanitizeFilename(filename) {
  // Remove path separators and potentially dangerous characters
  let sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Limit length
  if (sanitized.length > 100) {
    const ext = sanitized.split('.').pop();
    const name = sanitized.substring(0, 100 - ext.length - 1);
    sanitized = `${name}.${ext}`;
  }
  return sanitized;
}

/**
 * Get file extension
 */
function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

/**
 * Format file size to human readable string
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Extract text preview (first N characters)
 */
function getTextPreview(text, maxLength = 500) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

/**
 * Chunk text for AI processing (to handle large documents)
 */
function chunkText(text, maxChunkSize = 8000) {
  if (!text || text.length <= maxChunkSize) {
    return [text];
  }
  
  const chunks = [];
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    if ((currentChunk + paragraph).length > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      // If single paragraph exceeds chunk size, split by sentences
      if (paragraph.length > maxChunkSize) {
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        let sentenceChunk = '';
        for (const sentence of sentences) {
          if ((sentenceChunk + sentence).length > maxChunkSize) {
            if (sentenceChunk) {
              chunks.push(sentenceChunk);
            }
            sentenceChunk = sentence;
          } else {
            sentenceChunk += (sentenceChunk ? ' ' : '') + sentence;
          }
        }
        currentChunk = sentenceChunk;
      } else {
        currentChunk = paragraph;
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Safe JSON parse with fallback
 */
function safeJsonParse(jsonString, fallback = {}) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('JSON parse error:', error.message);
    return fallback;
  }
}

/**
 * Generate unique filename with timestamp
 */
function generateUniqueFilename(originalName) {
  const ext = originalName.split('.').pop();
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}.${ext}`;
}

/**
 * Determine if OCR is needed for PDF
 */
function needsOcr(extractedText) {
  // If extracted text is very short or mostly whitespace, likely needs OCR
  const textContent = extractedText.replace(/\s/g, '').length;
  return textContent < 100;
}

module.exports = {
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  validateFileType,
  validateFileSize,
  sanitizeFilename,
  getFileExtension,
  formatFileSize,
  getTextPreview,
  chunkText,
  safeJsonParse,
  generateUniqueFilename,
  needsOcr
};