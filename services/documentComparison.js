const { isAiAvailable, getModel, markAiUnavailable } = require('./aiAnalysis');
const { traceGeminiCall, traceOperation } = require('./langsmithTracing');

/**
 * Compare two documents using AI
 * @param {Object} doc1 - First document analysis
 * @param {Object} doc2 - Second document analysis
 * @returns {Promise<Object>}
 */
async function compareDocuments(doc1, doc2) {
  return traceOperation(
    'DocuMind Compare Documents',
    'chain',
    { doc1: summarizeDocumentForTrace(doc1), doc2: summarizeDocumentForTrace(doc2) },
    async () => compareDocumentsCore(doc1, doc2),
    {
      tags: ['compare'],
      metadata: { operation: 'document-comparison' }
    }
  );
}

function summarizeDocumentForTrace(doc) {
  const analysis = doc?.analysis || {};
  const text = String(doc?.extractedText || '');

  return {
    id: doc?._id ? String(doc._id) : undefined,
    name: doc?.originalName || analysis.title || 'Untitled document',
    fileType: doc?.fileType || analysis.documentType || 'unknown',
    textChars: text.length,
    summary: analysis.summary || '',
    keywords: (analysis.keywords || []).slice(0, 12)
  };
}

async function compareDocumentsCore(doc1, doc2) {
  const analysis1 = doc1?.analysis || doc1 || {};
  const analysis2 = doc2?.analysis || doc2 || {};

  if (!isAiAvailable()) {
    return getBasicComparison(doc1, doc2);
  }
  
  const model = getModel();
  
  const prompt = `Compare these two documents and provide a comparison analysis in JSON format.

Document 1:
Title: ${analysis1.title || doc1?.originalName || 'Unknown'}
Type: ${analysis1.documentType || doc1?.fileType || 'Unknown'}
Summary: ${analysis1.summary || 'N/A'}
Key Points: ${(analysis1.keyPoints || []).join(', ')}

Document 2:
Title: ${analysis2.title || doc2?.originalName || 'Unknown'}
Type: ${analysis2.documentType || doc2?.fileType || 'Unknown'}
Summary: ${analysis2.summary || 'N/A'}
Key Points: ${(analysis2.keyPoints || []).join(', ')}

Return ONLY valid JSON with this structure:
{
  "similarities": ["Similarity 1", "Similarity 2"],
  "differences": ["Difference 1", "Difference 2"],
  "recommendation": "Which document is better for what purpose",
  "comparisonSummary": "Brief overall comparison"
}`;
  
  try {
    const response = await traceGeminiCall(
      'Gemini Compare Documents',
      prompt,
      async (promptText) => {
        const result = await model.generateContent(promptText);
        return result.response.text();
      },
      {
        operation: 'document-comparison',
        model: 'gemini-2.0-flash'
      }
    );
    
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return getBasicComparison(doc1, doc2);
  } catch (error) {
    if (!markAiUnavailable(error)) {
      console.error('Comparison error:', error.message);
    }
    return getBasicComparison(doc1, doc2);
  }
}

/**
 * Basic comparison without AI
 */
function getBasicComparison(doc1, doc2) {
  const analysis1 = doc1?.analysis || doc1 || {};
  const analysis2 = doc2?.analysis || doc2 || {};
  const sims = [];
  const diffs = [];
  
  // Compare document types
  const type1 = analysis1.documentType || doc1?.fileType || 'unknown';
  const type2 = analysis2.documentType || doc2?.fileType || 'unknown';
  if (type1 === type2) {
    sims.push(`Both documents are ${type1} type`);
  } else {
    diffs.push(`Document types differ: ${type1} vs ${type2}`);
  }
  
  // Compare key points
  const points1 = new Set(analysis1.keyPoints || []);
  const points2 = new Set(analysis2.keyPoints || []);
  
  const commonPoints = [...points1].filter(p => points2.has(p));
  if (commonPoints.length > 0) {
    sims.push(`${commonPoints.length} common key points`);
  }
  
  // Compare word counts / text lengths
  const len1 = (doc1?.extractedText || analysis1.extractedText || analysis1.summary || '').length;
  const len2 = (doc2?.extractedText || analysis2.extractedText || analysis2.summary || '').length;
  if (Math.abs(len1 - len2) < 500) {
    sims.push('Similar document lengths');
  } else {
    diffs.push(len1 > len2 
      ? 'Document 1 is longer' 
      : 'Document 2 is longer');
  }
  
  return {
    similarities: sims,
    differences: diffs,
    recommendation: 'Compare manually for detailed analysis',
    comparisonSummary: `${sims.length} similarities found, ${diffs.length} differences found`
  };
}

/**
 * Compare by extracted text only (without AI analysis)
 * @param {string} text1 - First document text
 * @param {string} text2 - Second document text
 * @returns {Object}
 */
function compareByText(text1, text2) {
  // Simple text-based comparison
  const words1 = new Set(text1.split(/\s+/));
  const words2 = new Set(text2.split(/\s+/));
  
  const commonWords = [...words1].filter(w => words2.has(w) && w.length > 3);
  
  return {
    similarity: commonWords.length / Math.max(words1.size, words2.size),
    commonWords: commonWords.slice(0, 20),
    totalWords1: words1.size,
    totalWords2: words2.size
  };
}

module.exports = {
  compareDocuments,
  compareByText
};
