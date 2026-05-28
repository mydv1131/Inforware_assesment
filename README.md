Multi-Tenant Retrieval-Augmented Generation (RAG) System


This is a production-grade Multi-Tenant RAG system built using **Node.js, TypeScript, Express, and PostgreSQL (`pgvector`)**. It allows multiple organizations (tenants) to upload documents (PDFs, plain text, Markdown), split them into chunks, generate vector embeddings, and semantic-query their private knowledge base under strict tenant isolation boundaries and safety guardrails.

The system follows a layered service architecture with strict separation of concerns. The API layer handles HTTP routing and request validation. The middleware layer enforces tenant isolation before any business logic executes. The RAG engine layer manages the full document pipeline — extraction, chunking, embedding, and vector storage. The services layer abstracts all PostgreSQL operations.

Multi-tenant isolation is enforced at three independent layers:
Routing middleware (API key + tenant ID match), SQL query scoping (WHERE tenant_id = $2 on every vector operation), and in-memory post-retrieval validation. This defense-in-depth approach ensures cross-tenant leakage is impossible even if one layer is bypassed

---

## 🏗️ Architecture Design & Notes

This system is engineered with a modular, service-based layered architecture following industry best practices:

```
src/
├── api/                  # API Layer (Express app, controllers, routers)
├── middleware/           # Interceptor Layer (Authentication, tenant authorization, validators, errors)
├── services/             # Core Services Layer (PostgreSQL database pooling, CRUD)
├── rag/                  # RAG Engine Layer (Text extractor, recursive chunker, embedder, vector store, generator)
├── models/               # Type Definition Layer (Static TypeScript interfaces)
└── tests/                # Automated Quality Assurance Layer (Jest API integration tests)
```

### 1. Technology Choices
- **Node.js & TypeScript**: Type-safe development with fast asynchronous concurrency.
- **Express**: Lightweight, robust routing framework with middleware customization.
- **PostgreSQL + `pgvector`**: Leverages enterprise-grade relational database consistency together with high-performance vector search operators (`<=>` for cosine distance).
- **Embeddings Pipeline**: Supports **Cloud-mode** (OpenAI `text-embedding-3-small` or Gemini `text-embedding-004`) and a **Zero-Config Offline-mode** using `@xenova/transformers` (running the `all-MiniLM-L6-v2` ONNX model completely in-process).
- **LLM Context Synthesis**: Dynamically routes prompts to OpenAI (`gpt-4o-mini`), Google Gemini (`gemini-1.5-flash`), or a smart **local factual synthesizer** (for zero-cost offline evaluations).

---

## 🔒 Multi-Tenant Isolation Strategy (Security Audit)

Cross-tenant data leakage is prevented through a multi-layered security defense model:

1. **Routing Authorization Middleware (`authorizeTenantScope`)**:
   Every tenant is assigned a secure random API key (`tkey_...`) at registration. All protected routes require this key in the `X-API-Key` header. The middleware verifies that the tenant matching the key strictly matches the `:tenantId` passed in the URL path. If they mismatch, a `403 Forbidden` error is returned.
2. **Technical SQL Scoping**:
   All database select, search, and delete operations on vectors explicitly inject the current verified tenant ID into the SQL `WHERE` clause.
   ```sql
   SELECT content, metadata FROM document_chunks 
   WHERE tenant_id = $2 AND 1 - (embedding <=> $1) >= $3
   ```
3. **In-Memory Verification Assertion (Double-Pass Validation)**:
   After vector retrieval and before processing or passing contexts to the LLM, the system runs an in-memory verification loop ensuring that every single chunk retrieved strictly matches the current target `tenantId`. If a mismatch is detected, a security exception is thrown immediately.
4. **Cascading Cascade Deletions**:
   Deleting a document automatically deletes all associated document chunks and vector indexes via database foreign key cascading references (`ON DELETE CASCADE`), ensuring no orphaned vectors remain.

---

## 🛡️ Guardrails Engine Mechanics

The system incorporates a robust multi-stage guardrails pipeline to ensure safety and factual correctness:

1. **Prompt Injection Protection**:
   Incoming query strings are analyzed against highly-optimized regex patterns representing known prompt override vectors (e.g., `"ignore previous instructions"`, `"system override"`, `"reveal your instructions"`). If triggered, the query is blocked, returning a safe, structured fallback response.
2. **Low-Confidence Retrieval Guardrail**:
   When the database returns no matching segments, or when the highest cosine similarity score is below the configured `SIMILARITY_THRESHOLD` (default `0.65`), the query is flagged as out-of-scope. Rather than letting the LLM hallucinate or return an error, the system returns a safe fallback response: *"I'm sorry, I could not find any relevant information in your organization's knowledge base to answer your question."*

---

## 🛠️ Environment Configuration

Create a `.env` file in the root folder. You can copy the template from `.env.example`:

```ini
PORT=3000
NODE_ENV=development

# Database URL pointing to local postgres or the docker-compose instance
DATABASE_URL=postgresql://mohit@localhost:5432/tenant_rag_db

# Active providers (local, openai, gemini)
EMBEDDING_PROVIDER=local
LLM_PROVIDER=local

# API Keys (required if using openai or gemini providers)
OPENAI_API_KEY=
GEMINI_API_KEY=

# RAG Hyperparameters
SIMILARITY_THRESHOLD=0.65
CHUNK_SIZE=500
CHUNK_OVERLAP=100
```

---

## 🚀 Step-by-Step Setup Guide

### Prerequisites
- Node.js (v18+)
- PostgreSQL with `pgvector` extension installed (or Docker to run the database)

### Installation
1. Install all project dependencies:
   ```bash
   npm install
   ```

2. **Database Setup (Option A: Running Docker)**:
   Spin up the dedicated PostgreSQL pgvector instance:
   ```bash
   docker-compose up -d
   ```
   *Note: Update `DATABASE_URL` in `.env` to `postgresql://postgres:postgres@localhost:5435/tenant_rag_db`.*

3. **Database Setup (Option B: Running local PostgreSQL)**:
   Ensure your local postgres instance is running and has the `vector` extension, then create the database:
   ```bash
   psql -d postgres -c "CREATE DATABASE tenant_rag_db;"
   ```
   *Note: Update `DATABASE_URL` in `.env` to point to your local credentials.*

---

## 🧪 Running Automated Tests

To execute the high-fidelity integration test suite (covering tenant isolation, PDF ingestion, guardrails, deletion cascades, and security violations):

```bash
npm test
```

---

## 📖 API Endpoint Documentation

### 1. Health Diagnostics
- **Endpoint**: `GET /health`
- **Description**: Returns server lifecycle, database status, and active embedding/LLM providers.
- **Response**:
  ```json
  {
    "status": "UP",
    "timestamp": "2026-05-28T16:40:00Z",
    "services": {
      "database": "CONNECTED",
      "embeddingProvider": "local",
      "llmProvider": "local"
    }
  }
  ```

### 2. Tenant Management
#### Onboard a Tenant
- **Endpoint**: `POST /tenant`
- **Request Body**:
  ```json
  {
    "name": "Acme Law Corp"
  }
  ```
- **Response**:
  ```json
  {
    "message": "Tenant created successfully.",
    "tenant": {
      "id": "e8a9394f-4d92-4c28-9844-0b1968ec3b22",
      "name": "Acme Law Corp",
      "apiKey": "tkey_d0505a415ff5e0f1712a420b98bcda4940f28bc3",
      "createdAt": "2026-05-28T16:40:15.000Z"
    }
  }
  ```

#### Fetch Tenant Info
- **Endpoint**: `GET /tenant/:id`
- **Description**: Fetches tenant metadata (requires no API key).
- **Response**:
  ```json
  {
    "tenant": {
      "id": "e8a9394f-4d92-4c28-9844-0b1968ec3b22",
      "name": "Acme Law Corp",
      "apiKey": "tkey_d0505a415ff5e0f1712a420b98bcda4940f28bc3",
      "createdAt": "2026-05-28T16:40:15.000Z"
    }
  }
  ```

---

### 3. Document Ingestion
#### Upload Document (Multipart File Form-Data)
- **Endpoint**: `POST /tenant/:tenantId/documents`
- **Headers**:
  - `X-API-Key`: `tkey_d0505a415ff5e0f1712a420b98bcda4940f28bc3`
- **Body**: `file` (Multipart file: PDF, TXT, MD)
- **Response**:
  ```json
  {
    "message": "Document uploaded and vectorized successfully.",
    "document": {
      "id": "761cbe04-f58c-4cfb-81ea-6ee76d8b9cd2",
      "tenantId": "e8a9394f-4d92-4c28-9844-0b1968ec3b22",
      "filename": "firm_policy.pdf",
      "mimeType": "application/pdf",
      "createdAt": "2026-05-28T16:41:00.000Z"
    }
  }
  ```

#### Upload Document (Raw JSON payload)
- **Endpoint**: `POST /tenant/:tenantId/documents`
- **Headers**:
  - `X-API-Key`: `tkey_d0505a415ff5e0f1712a420b98bcda4940f28bc3`
- **Body**:
  ```json
  {
    "filename": "faq.txt",
    "content": "The refund window is 30 days from purchase.",
    "mimeType": "text/plain"
  }
  ```

#### List Ingested Documents
- **Endpoint**: `GET /tenant/:tenantId/documents`
- **Headers**:
  - `X-API-Key`: `tkey_...`
- **Response**:
  ```json
  {
    "documents": [
      {
        "id": "761cbe04-f58c-4cfb-81ea-6ee76d8b9cd2",
        "tenantId": "e8a9394f-4d92-4c28-9844-0b1968ec3b22",
        "filename": "firm_policy.pdf",
        "mimeType": "application/pdf",
        "createdAt": "2026-05-28T16:41:00.000Z"
      }
    ]
  }
  ```

#### Delete a Document
- **Endpoint**: `DELETE /tenant/:tenantId/documents/:documentId`
- **Headers**:
  - `X-API-Key`: `tkey_...`
- **Response**:
  ```json
  {
    "message": "Document \"761cbe04-f58c-4cfb-81ea-6ee76d8b9cd2\" and its associated vectors were deleted successfully."
  }
  ```

---

### 4. RAG Query Execution
- **Endpoint**: `POST /tenant/:tenantId/query`
- **Headers**:
  - `X-API-Key`: `tkey_d0505a415ff5e0f1712a420b98bcda4940f28bc3`
- **Request Body**:
  ```json
  {
    "query": "What is the refund window?"
  }
  ```
- **Response (Success)**:
  ```json
  {
    "answer": "The refund window is 30 days from purchase.",
    "sources": [
      {
        "documentId": "761cbe04-f58c-4cfb-81ea-6ee76d8b9cd2",
        "filename": "faq.txt",
        "content": "The refund window is 30 days from purchase.",
        "similarity": 0.9542
      }
    ]
  }
  ```

- **Response (Blocked by Prompt Injection Guardrail)**:
  ```json
  {
    "answer": "I am sorry, but your query contains instructions that violate our security guardrails. Please rephrase your query.",
    "sources": [],
    "guardrailTriggered": true,
    "guardrailReason": "Prompt injection attempt detected."
  }
  ```

- **Response (Out-of-Scope / Low Confidence Guardrail)**:
  ```json
  {
    "answer": "I'm sorry, I could not find any relevant information in your organization's knowledge base to answer your question.",
    "sources": [],
    "guardrailTriggered": true,
    "guardrailReason": "No source documents returned."
  }
  ```
