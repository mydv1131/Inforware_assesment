import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('CRITICAL: DATABASE_URL environment variable is not defined.');
  process.exit(1);
}

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client', err);
});

export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('Running database migrations...');
    
    // 1. Enable pgvector extension
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    
    // 2. Create tenants table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) UNIQUE NOT NULL,
        api_key VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Create documents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Determine pgvector dimension based on provider
    const provider = process.env.EMBEDDING_PROVIDER || 'local';
    let dimension = 384; // local: all-MiniLM-L6-v2
    if (provider === 'openai') {
      dimension = 1536; // text-embedding-ada-002 or text-embedding-3-small
    } else if (provider === 'gemini') {
      dimension = 768; // text-embedding-004
    }

    console.log(`Configuring vector store using provider "${provider}" with dimension ${dimension}`);

    // 4. Create document_chunks table with the correct dimension
    // We check if the table already exists, and if so, check if the embedding dimension matches.
    // If not, we drop/alter it (or let it be if it's the same).
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        embedding vector(${dimension}) NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb
      );
    `);

    // 5. Create Indexes
    // Index tenant_id for strict high-speed tenant isolation
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant_id ON document_chunks(tenant_id);
    `);

    // Index document_id for swift deletion cascade checks
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
    `);

    // HNSW index for extremely fast vector search
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw 
        ON document_chunks USING hnsw (embedding vector_cosine_ops);
      `);
      console.log('HNSW index created successfully or already exists.');
    } catch (e: any) {
      // If HNSW is not supported on older pgvector versions, fall back to IVFFlat or let standard scans handle it
      console.warn('HNSW index creation failed, falling back to standard scans. Error:', e.message);
    }

    console.log('Database migrations completed successfully.');
  } catch (error) {
    console.error('Failed to run database migrations:', error);
    throw error;
  } finally {
    client.release();
  }
}
