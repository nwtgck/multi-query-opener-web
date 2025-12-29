import { z, } from 'zod';

/**
 * Schema for a single group of parameter values.
 */
export const ParamGroupSchema = z.object({
  type: z.literal('group'),
  name: z.string(),
  values: z.array(z.string()),
  expanded: z.boolean().default(true),
});

/**
 * A parameter item can be either a simple string value (for backward compatibility)
 * or a group of values.
 */
export const ParamValueSchema = z.union([
  z.string(),
  ParamGroupSchema,
]);

/**
 * Schema for the application state used in storage and runtime.
 */
export const AppStateSchema = z.object({
  title: z.string(),
  baseUrl: z.string(),
  paramKey: z.string(),
  paramValues: z.array(ParamValueSchema),
});

/**
 * For storage, we use the same structure now.
 */
export const StorageStateSchema = AppStateSchema;
