import { Request, Response, NextFunction } from 'express';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates request payload for tenant onboarding.
 */
export function validateTenantCreate(req: Request, res: Response, next: NextFunction): void {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'The parameter "name" is required and must be a non-empty string.',
    });
    return;
  }
  next();
}

/**
 * Validates query request structure.
 */
export function validateQuery(req: Request, res: Response, next: NextFunction): void {
  const { query } = req.body;
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'The parameter "query" is required and must be a non-empty string.',
    });
    return;
  }
  next();
}

/**
 * Validates that IDs passed in path parameters conform to the standard UUID format.
 */
export function validateUUIDs(req: Request, res: Response, next: NextFunction): void {
  const { tenantId, id, documentId } = req.params;

  if (tenantId && !UUID_REGEX.test(tenantId)) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'The path parameter "tenantId" must be a valid UUID v4.',
    });
    return;
  }

  if (id && !UUID_REGEX.test(id)) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'The path parameter "id" must be a valid UUID v4.',
    });
    return;
  }

  if (documentId && !UUID_REGEX.test(documentId)) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'The path parameter "documentId" must be a valid UUID v4.',
    });
    return;
  }

  next();
}
