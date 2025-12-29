import { z } from "zod";

/**
 * Optimized DTO for a single parameter value.
 */
export const ParamValueDtoSchema = z.object({
  id: z.number(),
  value: z.string(),
});

/**
 * Optimized DTO for a group of parameter values.
 * Only 'false' is stored for 'expanded' to save space. 'true' is implied by omission.
 */
export const ParamGroupDtoSchema = z.object({
  id: z.number(),
  name: z.string(),
  values: z.array(ParamValueDtoSchema),
  expanded: z.union([z.literal(false), z.undefined()]),
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
 * Final storage schema.
 */
export const StorageStateDtoSchema = AppStateDtoSchema;
