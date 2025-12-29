import { z, } from 'zod';

/**
 * Optimized DTO for a single parameter value.
 */
export const ParamValueDtoSchema = z.object({
  id: z.number(),
  value: z.string(),
});

/**
 * Optimized DTO for a group of parameter values.
 */
export const ParamGroupDtoSchema = z.object({
  id: z.number(),
  type: z.literal('group'),
  name: z.string(),
  values: z.array(ParamValueDtoSchema),
  expanded: z.boolean(),
});

/**
 * Optimized DTO for any parameter item.
 */
export const ParamItemDtoSchema = z.union([
  ParamValueDtoSchema,
  ParamGroupDtoSchema,
]);

/**
 * Optimized DTO for the entire application state.
 */
export const AppStateDtoSchema = z.object({
  title: z.string(),
  baseUrl: z.string(),
  paramKey: z.string(),
  paramValues: z.array(ParamItemDtoSchema),
});

/**
 * Final storage schema (Breaking change: legacy support removed for extreme optimization).
 */
export const StorageStateDtoSchema = AppStateDtoSchema;
