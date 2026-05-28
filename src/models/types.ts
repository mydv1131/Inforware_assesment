export interface Tenant {
  id: string;
  name: string;
  apiKey: string;
  createdAt: Date;
}

export interface Document {
  id: string;
  tenantId: string;
  filename: string;
  mimeType: string;
  createdAt: Date;
}

export interface Chunk {
  id: string;
  documentId: string;
  tenantId: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
}

export interface SearchResult {
  id: string;
  documentId: string;
  tenantId: string;
  content: string;
  filename: string;
  similarity: number;
  metadata: Record<string, any>;
}

export interface QueryResponse {
  answer: string;
  sources: {
    documentId: string;
    filename: string;
    content: string;
    similarity: number;
  }[];
}
