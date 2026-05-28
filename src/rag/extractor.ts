import pdf from 'pdf-parse';

/**
 * Extracts text from a file buffer depending on its mime type.
 * Supports PDFs and plain text files.
 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  const normalizedMime = mimeType.toLowerCase();

  if (normalizedMime === 'application/pdf') {
    try {
      const data = await pdf(buffer);
      if (!data || !data.text) {
        throw new Error('PDF parsing returned empty content.');
      }
      return cleanExtractedText(data.text);
    } catch (error: any) {
      console.error('Error parsing PDF document:', error);
      throw new Error(`Failed to extract text from PDF: ${error.message}`);
    }
  }

  // Fallback/standard handling for text documents (plain text, markdown, CSV, JSON)
  if (
    normalizedMime.startsWith('text/') ||
    normalizedMime === 'application/json' ||
    normalizedMime === 'application/x-javascript' ||
    normalizedMime === 'application/javascript'
  ) {
    return cleanExtractedText(buffer.toString('utf-8'));
  }

  // Default fallback attempt to read as string
  try {
    const text = buffer.toString('utf-8');
    // Basic binary detection
    if (/[\x00-\x08\x0E-\x1F\x7F]/.test(text.slice(0, 100))) {
      throw new Error(`Unsupported binary format: ${mimeType}`);
    }
    return cleanExtractedText(text);
  } catch (error: any) {
    throw new Error(`Unsupported file type or encoding: ${mimeType}. Error: ${error.message}`);
  }
}

/**
 * Cleans white spaces and weird characters from extracted raw text.
 */
function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/ +/g, ' ') // Collapse multiple spaces
    .replace(/\n\s*\n+/g, '\n\n') // Collapse multiple newlines
    .trim();
}
