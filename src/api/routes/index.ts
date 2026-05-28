import { Router } from 'express';
import multer from 'multer';
import { pool } from '../../services/db';
import * as tenantController from '../controllers/tenantController';
import * as documentController from '../controllers/documentController';
import * as queryController from '../controllers/queryController';
import { authenticateTenant, authorizeTenantScope } from '../../middleware/auth';
import { validateTenantCreate, validateQuery, validateUUIDs } from '../../middleware/validator';

const router = Router();

// Configure multer for memory buffer file storage (handles PDF, TXT, MD uploads)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB maximum file limit
  },
});

/**
 * 1. Health Diagnostics API
 * GET /health
 */
router.get('/health', async (req, res) => {
  try {
    // Check DB status
    const dbCheck = await pool.query('SELECT 1 as connected;');
    const isDbConnected = dbCheck.rows.length > 0;
    
    res.status(200).json({
      status: 'UP',
      timestamp: new Date(),
      services: {
        database: isDbConnected ? 'CONNECTED' : 'DISCONNECTED',
        embeddingProvider: process.env.EMBEDDING_PROVIDER || 'local',
        llmProvider: process.env.LLM_PROVIDER || 'local',
      },
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'DOWN',
      timestamp: new Date(),
      error: error.message,
    });
  }
});

/**
 * 2. Tenant Management APIs
 */
// Create a new tenant: POST /tenant
router.post(
  '/tenant',
  validateTenantCreate,
  tenantController.createTenant
);

// Get tenant details: GET /tenant/:id
router.get(
  '/tenant/:id',
  validateUUIDs,
  tenantController.getTenantById
);

/**
 * 3. Document Management APIs (Tenant Protected)
 */
// Ingest text/PDF document: POST /tenant/:tenantId/documents
router.post(
  '/tenant/:tenantId/documents',
  validateUUIDs,
  authenticateTenant,
  authorizeTenantScope,
  upload.single('file'),
  documentController.uploadDocument
);

// List uploaded documents: GET /tenant/:tenantId/documents
router.get(
  '/tenant/:tenantId/documents',
  validateUUIDs,
  authenticateTenant,
  authorizeTenantScope,
  documentController.listDocuments
);

// Delete document: DELETE /tenant/:tenantId/documents/:documentId
router.delete(
  '/tenant/:tenantId/documents/:documentId',
  validateUUIDs,
  authenticateTenant,
  authorizeTenantScope,
  documentController.deleteDocument
);

/**
 * 4. Knowledge Retrieval/Query API (Tenant Protected)
 * POST /tenant/:tenantId/query
 */
router.post(
  '/tenant/:tenantId/query',
  validateUUIDs,
  validateQuery,
  authenticateTenant,
  authorizeTenantScope,
  queryController.queryKnowledgeBase
);

export default router;
