import { pool } from '../services/db';
import { Chunk, SearchResult } from '../models/types';

/**
 * Stores document chunks with their embeddings in the database.
 */
export async function storeChunks(
  chunks: { documentId: string; tenantId: string; content: string; embedding: number[]; metadata: any }[]
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const queryText = `
      INSERT INTO document_chunks (document_id, tenant_id, content, embedding, metadata)
      VALUES ($1, $2, $3, $4, $5)
    `;

    for (const chunk of chunks) {
      // Serialize metadata to JSON and format vector embedding as [x1, x2, ...] string or numeric array for pg
      // pg parses numeric arrays [x1, x2, ...] directly to pgvector format if supplied as a string representation like `[0.1, 0.2, ...]`
      const vectorStr = `[${chunk.embedding.join(',')}]`;
      await client.query(queryText, [
        chunk.documentId,
        chunk.tenantId,
        chunk.content,
        vectorStr,
        JSON.stringify(chunk.metadata || {}),
      ]);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to store document chunks in database:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Query the vector store for similar document chunks while strictly isolating by tenant ID.
 */
export async function querySimilarChunks(
  tenantId: string,
  queryEmbedding: number[],
  limit: number = 5,
  similarityThreshold: number = 0.65
): Promise<SearchResult[]> {
  const vectorStr = `[${queryEmbedding.join(',')}]`;

  // Cosine distance in pgvector is <=>
  // Cosine similarity is 1 - (embedding <=> queryEmbedding)
  const queryText = `
    SELECT 
      dc.id, 
      dc.document_id as "documentId", 
      dc.tenant_id as "tenantId", 
      dc.content, 
      dc.metadata,
      d.filename,
      1 - (dc.embedding <=> $1::vector) as similarity
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE dc.tenant_id = $2
      AND 1 - (dc.embedding <=> $1::vector) >= $3
    ORDER BY dc.embedding <=> $1::vector ASC
    LIMIT $4;
  `;

  try {
    const res = await pool.query(queryText, [
      vectorStr,
      tenantId,
      similarityThreshold,
      limit,
    ]);

    const results: SearchResult[] = res.rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      tenantId: row.tenantId,
      content: row.content,
      filename: row.filename,
      similarity: parseFloat(row.similarity),
      metadata: row.metadata,
    }));

    // CRITICAL SECURITY AUDIT PASS (Strict Multi-Tenant Leak Protection)
    // In-memory verification assertion that absolutely every single returned row belongs to the queried tenant.
    for (const chunk of results) {
      if (chunk.tenantId !== tenantId) {
        console.error(`SECURITY VIOLATION DETECTED: Tenant data leak from ${chunk.tenantId} into query for tenant ${tenantId}!`);
        throw new Error('Security isolation violation: Access denied to cross-tenant resources.');
      }
    }

    return results;
  } catch (error) {
    console.error('Vector similarity query failed:', error);
    throw error;
  }
}
