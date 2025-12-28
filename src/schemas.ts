import { z, } from 'zod';

/**
 * Schema for the application state used in storage and runtime.
 */
export const AppStateSchema = z.object({
  title: z.string(),
  baseUrl: z.string(),
  paramKey: z.string(),
  paramValues: z.array(z.string()),
});

/**
 * For storage, we use the same structure now.
 */
export const StorageStateSchema = AppStateSchema;
