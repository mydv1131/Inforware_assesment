import { Request, Response, NextFunction } from 'express';
import { getTenantByKey, getTenantById } from '../services/tenant';

// Expand Express Request interface to include tenant details
declare global {
  namespace Express {
    interface Request {
      tenant?: {
        id: string;
        name: string;
        apiKey: string;
      };
    }
  }
}

/**
 * Authentication middleware enforcing valid API keys.
 * Validates 'x-api-key' or 'Authorization' bearer headers.
 */
export async function authenticateTenant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKeyHeader = req.headers['x-api-key'] || req.headers['X-API-Key'];
  
  let apiKey: string | undefined;

  if (typeof apiKeyHeader === 'string') {
    apiKey = apiKeyHeader;
  } else {
    // Fallback: Check standard Authorization Bearer header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      apiKey = authHeader.substring(7);
    }
  }

  if (!apiKey) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required. Please provide a valid tenant API key in the "X-API-Key" header.',
    });
    return;
  }

  try {
    const tenant = await getTenantByKey(apiKey);
    
    if (!tenant) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key. Please check your credentials.',
      });
      return;
    }

    // Attach tenant context to request
    req.tenant = {
      id: tenant.id,
      name: tenant.name,
      apiKey: tenant.apiKey,
    };

    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected database error occurred during authentication.',
    });
  }
}

/**
 * Authorization middleware ensuring strict tenant boundary isolation.
 * Asserts that the authenticated tenant is the same tenant requested in the URL path parameters.
 */
export function authorizeTenantScope(req: Request, res: Response, next: NextFunction): void {
  const { tenantId } = req.params;

  if (!req.tenant) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication context missing.',
    });
    return;
  }

  // Enforce isolation constraint
  if (tenantId && req.tenant.id !== tenantId) {
    console.warn(`SECURITY WARNING: Cross-tenant access attempt by tenant "${req.tenant.name}" (${req.tenant.id}) to target tenant id "${tenantId}"`);
    res.status(403).json({
      error: 'Forbidden',
      message: 'Access Denied: Tenant boundary isolation violation. You cannot access another organization\'s resources.',
    });
    return;
  }

  next();
}
