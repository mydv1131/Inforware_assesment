import crypto from 'crypto';
import { pool } from './db';
import { Tenant } from '../models/types';

/**
 * Creates a new tenant and generates a secure random API key.
 */
export async function createTenant(name: string): Promise<Tenant> {
  const apiKey = `tkey_${crypto.randomBytes(20).toString('hex')}`;
  
  const query = `
    INSERT INTO tenants (name, api_key)
    VALUES ($1, $2)
    RETURNING id, name, api_key as "apiKey", created_at as "createdAt"
  `;

  try {
    const res = await pool.query(query, [name, apiKey]);
    return res.rows[0];
  } catch (error: any) {
    if (error.code === '23505') {
      throw new Error(`Tenant with name "${name}" already exists.`);
    }
    console.error('Failed to create tenant:', error);
    throw error;
  }
}

/**
 * Retreives a tenant by its unique UUID ID.
 */
export async function getTenantById(id: string): Promise<Tenant | null> {
  const query = `
    SELECT id, name, api_key as "apiKey", created_at as "createdAt"
    FROM tenants
    WHERE id = $1
  `;

  try {
    const res = await pool.query(query, [id]);
    if (res.rows.length === 0) return null;
    return res.rows[0];
  } catch (error) {
    console.error(`Failed to get tenant by id ${id}:`, error);
    throw error;
  }
}

/**
 * Retreives a tenant by its API key (used for authentication checks).
 */
export async function getTenantByKey(apiKey: string): Promise<Tenant | null> {
  const query = `
    SELECT id, name, api_key as "apiKey", created_at as "createdAt"
    FROM tenants
    WHERE api_key = $1
  `;

  try {
    const res = await pool.query(query, [apiKey]);
    if (res.rows.length === 0) return null;
    return res.rows[0];
  } catch (error) {
    console.error('Failed to get tenant by key:', error);
    throw error;
  }
}
