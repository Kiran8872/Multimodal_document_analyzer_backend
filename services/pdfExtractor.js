const fs = require('fs');
const pdf = require('pdf-parse');

/**
 * Extract text from PDF file
 * @param {string} filePath - Path to PDF file
 * @returns {Promise<{text: string, pageCount: number}>}
 */
async function extractFromPdf(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const data = await pdf(buffer);
    
    return {
      text: data.text,
      pageCount: data.numpages
    };
  } catch (error) {
    console.error('PDF extraction error:', error.message);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

/**
 * Extract text from PDF buffer (for memory-stored files)
 * @param {Buffer} buffer - PDF buffer
 * @returns {Promise<{text: string, pageCount: number}>}
 */
async function extractFromPdfBuffer(buffer) {
  try {
    const data = await pdf(buffer);
    
    return {
      text: data.text,
      pageCount: data.numpages
    };
  } catch (error) {
    console.error('PDF extraction error:', error.message);
    throw new Error(`Failed to extract text from PDF buffer: ${error.message}`);
  }
}

/**
 * Check if PDF has selectable text (vs scanned/image-based)
 * @param {string} text - Extracted text
 * @returns {boolean}
 */
function hasSelectableText(text) {
  // If text is mostly spaces or very short, likely a scanned PDF
  const textContent = text.replace(/\s/g, '');
  return textContent.length > 100;
}

module.exports = {
  extractFromPdf,
  extractFromPdfBuffer,
  hasSelectableText
};