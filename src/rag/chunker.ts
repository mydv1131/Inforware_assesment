/**
 * A recursive chunker that splits text based on natural separators:
 * Paragraphs (\n\n), Newlines (\n), Spaces ( ), and characters.
 */
export function chunkText(
  text: string,
  chunkSize: number = 500,
  chunkOverlap: number = 100
): string[] {
  if (chunkOverlap >= chunkSize) {
    throw new Error('chunkOverlap must be less than chunkSize');
  }

  const chunks: string[] = [];
  const separators = ['\n\n', '\n', ' ', ''];

  function split(txt: string, currentSeparatorIndex: number): string[] {
    if (txt.length <= chunkSize) {
      return [txt];
    }

    const separator = separators[currentSeparatorIndex];
    if (separator === undefined) {
      // Fallback: Hard slice
      const results: string[] = [];
      let start = 0;
      while (start < txt.length) {
        results.push(txt.slice(start, start + chunkSize));
        start += chunkSize - chunkOverlap;
      }
      return results;
    }

    const parts = txt.split(separator);
    const results: string[] = [];
    let currentChunk = '';

    for (const part of parts) {
      // If adding this part exceeds chunkSize, try to flush the current chunk
      if ((currentChunk + (currentChunk ? separator : '') + part).length > chunkSize) {
        if (currentChunk) {
          results.push(currentChunk);
        }

        // If the single part itself is larger than chunkSize, recurse with the next separator
        if (part.length > chunkSize) {
          const subChunks = split(part, currentSeparatorIndex + 1);
          // Add all sub-chunks, but wait: the last sub-chunk could be combined with future parts!
          // For simplicity, we add all sub-chunks except potentially the last one which becomes currentChunk
          for (let i = 0; i < subChunks.length - 1; i++) {
            results.push(subChunks[i]);
          }
          currentChunk = subChunks[subChunks.length - 1];
        } else {
          currentChunk = part;
        }
      } else {
        currentChunk = currentChunk ? currentChunk + separator + part : part;
      }
    }

    if (currentChunk) {
      results.push(currentChunk);
    }

    return results;
  }

  // Run the splitting recursive engine
  const initialChunks = split(text, 0);

  // Apply overlapping pass to rebuild smooth transitions between chunks
  // This merges adjacent small chunks or creates standard overlaps.
  // Standard overlap algorithm:
  const overlappingChunks: string[] = [];
  let index = 0;
  while (index < initialChunks.length) {
    const chunk = initialChunks[index];
    if (chunk.length <= chunkSize) {
      overlappingChunks.push(chunk);
      index++;
    } else {
      // Slice it if it somehow exceeded (should not happen due to split recursion)
      overlappingChunks.push(chunk.slice(0, chunkSize));
      index++;
    }
  }

  // To build high-fidelity overlap:
  // If we have separate chunks, we want adjacent chunks to share overlap characters.
  // A straightforward window-based text chunker:
  const finalChunks: string[] = [];
  let startOffset = 0;
  
  while (startOffset < text.length) {
    let endOffset = startOffset + chunkSize;
    if (endOffset > text.length) {
      endOffset = text.length;
    }

    // Attempt to find a natural boundary near endOffset to avoid cut-off words
    if (endOffset < text.length) {
      const searchWindow = text.slice(endOffset - 30, endOffset + 10);
      const spaceIdx = searchWindow.lastIndexOf(' ');
      if (spaceIdx !== -1 && spaceIdx < 30) {
        endOffset = endOffset - 30 + spaceIdx;
      }
    }

    const chunkContent = text.slice(startOffset, endOffset).trim();
    if (chunkContent.length > 10) {
      finalChunks.push(chunkContent);
    }
    
    startOffset = endOffset - chunkOverlap;
    if (startOffset >= text.length || endOffset === text.length) {
      break;
    }
  }

  return finalChunks.length > 0 ? finalChunks : initialChunks;
}
