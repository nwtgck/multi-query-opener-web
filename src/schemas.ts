import { z, } from 'zod';

/**
 * DTO for a single parameter value.
 */
export const ParamValueDtoSchema = z.object({
  id: z.string(),
  value: z.string(),
});

/**
 * DTO for a group of parameter values.
 */
export const ParamGroupDtoSchema = z.object({
  id: z.string(),
  type: z.literal('group'),
  name: z.string(),
  values: z.array(ParamValueDtoSchema),
  expanded: z.boolean(),
});

/**
 * DTO for any parameter item.
 */
export const ParamItemDtoSchema = z.union([
  ParamValueDtoSchema,
  ParamGroupDtoSchema,
]);

/**
 * DTO for the entire application state.
 */
export const AppStateDtoSchema = z.object({
  title: z.string(),
  baseUrl: z.string(),
  paramKey: z.string(),
  paramValues: z.array(ParamItemDtoSchema),
});

/**
 * Legacy schema for backward compatibility.
 */
export const LegacyStateSchema = z.object({
  title: z.string().optional(),
  baseUrl: z.string().optional(),
  paramKey: z.string().optional(),
  paramValues: z.array(z.union([
    z.string(),
    z.object({
      type: z.literal('group'),
      name: z.string(),
      values: z.array(z.string()),
      expanded: z.boolean().optional(),
    }),
  ])).optional(),
});

/**
 * Combined storage schema.
 */
export const StorageStateDtoSchema = z.union([AppStateDtoSchema, LegacyStateSchema]);
