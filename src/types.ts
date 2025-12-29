import { z } from "zod";
import { 
  ParamValueDtoSchema, 
  ParamGroupDtoSchema, 
  ParamItemDtoSchema, 
  AppStateDtoSchema,
  StorageStateDtoSchema,
} from "./schemas";

// DTO Types (Persistence / Transfer) - Optimized for size
export type ParamValueDto = Readonly<z.infer<typeof ParamValueDtoSchema>>;
export type ParamGroupDto = Readonly<z.infer<typeof ParamGroupDtoSchema>>;
export type ParamItemDto = Readonly<z.infer<typeof ParamItemDtoSchema>>;
export type AppStateDto = Readonly<z.infer<typeof AppStateDtoSchema>>;
export type StorageStateDto = Readonly<z.infer<typeof StorageStateDtoSchema>>;

// Runtime State Types (Ideal form for UI/Reactivity)
export type ParamValue = {
  id: number,
  value: string,
};

export type ParamGroup = {
  id: number,
  readonly type: "group",
  name: string,
  values: ParamValue[],
  expanded: boolean,
};

export type ParamItem = ParamValue | ParamGroup;

export type AppState = {
  title: string,
  baseUrl: string,
  paramKey: string,
  paramValues: ParamItem[],
};