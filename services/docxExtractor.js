const fs = require('fs');
const mammoth = require('mammoth');

/**
 * Extract text from DOCX file
 * @param {string} filePath - Path to DOCX file
 * @returns {Promise<{text: string, pageCount: number}>}
 */
async function extractFromDocx(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer: buffer });
    
    return {
      text: result.value,
      pageCount: 1 // Estimate based on text length
    };
  } catch (error) {
    console.error('DOCX extraction error:', error.message);
    throw new Error(`Failed to extract text from DOCX: ${error.message}`);
  }
}

/**
 * Extract text from DOCX buffer
 * @param {Buffer} buffer - DOCX buffer
 * @returns {Promise<{text: string, pageCount: number}>}
 */
async function extractFromDocxBuffer(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer: buffer });
    
    return {
      text: result.value,
      pageCount: 1
    };
  } catch (error) {
    console.error('DOCX extraction error:', error.message);
    throw new Error(`Failed to extract text from DOCX buffer: ${error.message}`);
  }
}

/**
 * Extract full HTML from DOCX (for more detailed formatting)
 * @param {string} filePath - Path to DOCX file
 * @returns {Promise<{html: string}>}
 */
async function extractHtmlFromDocx(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.convertToHtml({ buffer: buffer });
    
    return {
      html: result.value
    };
  } catch (error) {
    console.error('DOCX HTML extraction error:', error.message);
    throw new Error(`Failed to extract HTML from DOCX: ${error.message}`);
  }
}

module.exports = {
  extractFromDocx,
  extractFromDocxBuffer,
  extractHtmlFromDocx
};