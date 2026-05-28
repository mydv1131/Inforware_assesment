import { pool } from './db';
import { Document } from '../models/types';
import { extractText } from '../rag/extractor';
import { chunkText } from '../rag/chunker';
import { getEmbedding } from '../rag/embedder';
import { storeChunks } from '../rag/vectorStore';

/**
 * Orchestrates the full document upload & vector ingestion pipeline:
 * 1. Extract text
 * 2. Chunk text
 * 3. Generate embeddings
 * 4. Write document and chunks to postgres (with strict tenantId tagging)
 */
export async function uploadDocument(
  tenantId: string,
  filename: string,
  mimeType: string,
  buffer: Buffer
): Promise<Document> {
  // Configurable chunk parameters via environment
  const chunkSize = parseInt(process.env.CHUNK_SIZE || '500');
  const chunkOverlap = parseInt(process.env.CHUNK_OVERLAP || '100');

  // 1. Text extraction
  console.log(`Extracting text from document "${filename}" (${mimeType})...`);
  const rawText = await extractText(buffer, mimeType);
  if (!rawText || rawText.trim().length === 0) {
    throw new Error('Extracted document content is empty.');
  }

  // 2. Chunks generation
  console.log(`Splitting document text into chunks (size: ${chunkSize}, overlap: ${chunkOverlap})...`);
  const textChunks = chunkText(rawText, chunkSize, chunkOverlap);
  console.log(`Generated ${textChunks.length} chunks for document.`);

  // 3. Database operations start
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create document record
    const docQuery = `
      INSERT INTO documents (tenant_id, filename, mime_type)
      VALUES ($1, $2, $3)
      RETURNING id, tenant_id as "tenantId", filename, mime_type as "mimeType", created_at as "createdAt"
    `;
    const docRes = await client.query(docQuery, [tenantId, filename, mimeType]);
    const createdDoc: Document = docRes.rows[0];

    // 4. Generate embeddings and prepare chunks for vector insertion
    console.log(`Generating embeddings for ${textChunks.length} chunks...`);
    
    // We resolve embedding generation in parallel batches of 5 to avoid API rate limits
    const chunksWithEmbeddings = [];
    const batchSize = 5;
    
    for (let i = 0; i < textChunks.length; i += batchSize) {
      const batch = textChunks.slice(i, i + batchSize);
      const batchPromises = batch.map(async (text, index) => {
        const embedding = await getEmbedding(text);
        return {
          documentId: createdDoc.id,
          tenantId,
          content: text,
          embedding,
          metadata: {
            chunkIndex: i + index,
            charLength: text.length,
            filename,
          },
        };
      });

      const processedBatch = await Promise.all(batchPromises);
      chunksWithEmbeddings.push(...processedBatch);
    }

    // Write chunks to vector database
    // Re-use connection to run in transaction
    const insertChunkQuery = `
      INSERT INTO document_chunks (document_id, tenant_id, content, embedding, metadata)
      VALUES ($1, $2, $3, $4::vector, $5)
    `;

    for (const chunk of chunksWithEmbeddings) {
      const vectorStr = `[${chunk.embedding.join(',')}]`;
      await client.query(insertChunkQuery, [
        chunk.documentId,
        chunk.tenantId,
        chunk.content,
        vectorStr,
        JSON.stringify(chunk.metadata),
      ]);
    }

    await client.query('COMMIT');
    console.log(`Document "${filename}" and its vector chunks ingested successfully.`);
    return createdDoc;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`Ingestion pipeline failed for document "${filename}":`, error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Lists all documents belonging to a tenant.
 */
export async function listDocuments(tenantId: string): Promise<Document[]> {
  const query = `
    SELECT id, tenant_id as "tenantId", filename, mime_type as "mimeType", created_at as "createdAt"
    FROM documents
    WHERE tenant_id = $1
    ORDER BY created_at DESC
  `;

  try {
    const res = await pool.query(query, [tenantId]);
    return res.rows;
  } catch (error) {
    console.error(`Failed to list documents for tenant ${tenantId}:`, error);
    throw error;
  }
}

/**
 * Deletes a document and its cascading chunks under strict tenant scope.
 */
export async function deleteDocument(tenantId: string, documentId: string): Promise<boolean> {
  const query = `
    DELETE FROM documents
    WHERE id = $1 AND tenant_id = $2
    RETURNING id
  `;

  try {
    const res = await pool.query(query, [documentId, tenantId]);
    // Returns true if a row was deleted (proving the doc belonged to the tenant)
    return res.rows.length > 0;
  } catch (error) {
    console.error(`Failed to delete document ${documentId} for tenant ${tenantId}:`, error);
    throw error;
  }
}
