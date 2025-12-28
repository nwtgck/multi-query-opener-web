import { z, } from 'zod';

/**
 * Schema for the shortened property names used in storage to save space.
 */
export const CompressedStateSchema = z.object({
  b: z.string().optional(),
  k: z.string().optional(),
  v: z.array(z.string()).optional(),
});

/**
 * Schema for the full application state.
 */
export const AppStateSchema = z.object({
  baseUrl: z.string(),
  paramKey: z.string(),
  paramValues: z.array(z.string()),
});
