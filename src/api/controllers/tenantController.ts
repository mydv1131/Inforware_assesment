import { Request, Response, NextFunction } from 'express';
import * as tenantService from '../../services/tenant';

/**
 * Handles tenant registration: POST /tenant
 */
export async function createTenant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { name } = req.body;
    const tenant = await tenantService.createTenant(name);
    
    res.status(201).json({
      message: 'Tenant created successfully.',
      tenant,
    });
  } catch (error: any) {
    next(error);
  }
}

/**
 * Retrieves tenant info by ID: GET /tenant/:id
 */
export async function getTenantById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const tenant = await tenantService.getTenantById(id);

    if (!tenant) {
      res.status(404).json({
        error: 'NotFound',
        message: `Tenant with ID "${id}" was not found.`,
      });
      return;
    }

    res.status(200).json({ tenant });
  } catch (error: any) {
    next(error);
  }
}
