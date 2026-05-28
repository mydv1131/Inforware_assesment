import { Request, Response, NextFunction } from 'express';
import * as documentService from '../../services/document';

/**
 * Handles document ingestion: POST /tenant/:tenantId/documents
 * Supports:
 * 1. Multipart Form Data (file upload via multer e.g. PDFs, TXT, MD)
 * 2. Raw JSON uploads (e.g., { "filename": "faq.txt", "content": "...", "mimeType": "text/plain" })
 */
export async function uploadDocument(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenantId } = req.params;
    let filename: string;
    let mimeType: string;
    let buffer: Buffer;

    // 1. Process Multipart File Upload
    if (req.file) {
      filename = req.file.originalname;
      mimeType = req.file.mimetype;
      buffer = req.file.buffer;
    } 
    // 2. Process JSON-based direct text payload
    else if (req.body && req.body.content) {
      filename = req.body.filename || 'raw_text_upload.txt';
      mimeType = req.body.mimeType || 'text/plain';
      buffer = Buffer.from(req.body.content, 'utf-8');
    } 
    else {
      res.status(400).json({
        error: 'ValidationError',
        message: 'No file uploaded or raw text content provided in body.',
      });
      return;
    }

    const document = await documentService.uploadDocument(tenantId, filename, mimeType, buffer);

    res.status(201).json({
      message: 'Document uploaded and vectorized successfully.',
      document,
    });
  } catch (error: any) {
    next(error);
  }
}

/**
 * Lists all documents uploaded by a tenant: GET /tenant/:tenantId/documents
 */
export async function listDocuments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenantId } = req.params;
    const documents = await documentService.listDocuments(tenantId);
    
    res.status(200).json({ documents });
  } catch (error: any) {
    next(error);
  }
}

/**
 * Deletes an uploaded document and its vector chunks: DELETE /tenant/:tenantId/documents/:documentId
 */
export async function deleteDocument(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenantId, documentId } = req.params;
    const deleted = await documentService.deleteDocument(tenantId, documentId);

    if (!deleted) {
      res.status(404).json({
        error: 'NotFound',
        message: `Document with ID "${documentId}" was not found or does not belong to this tenant.`,
      });
      return;
    }

    res.status(200).json({
      message: `Document "${documentId}" and its associated vectors were deleted successfully.`,
    });
  } catch (error: any) {
    next(error);
  }
}
