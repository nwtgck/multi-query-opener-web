import { z, } from 'zod';
import { 
  ParamValueDtoSchema, 
  ParamGroupDtoSchema, 
  ParamItemDtoSchema, 
  AppStateDtoSchema,
  StorageStateDtoSchema,
} from './schemas';

// DTO Types (Persistence / Transfer) - Keep Readonly for immutability during transit
export type ParamValueDto = Readonly<z.infer<typeof ParamValueDtoSchema>>;
export type ParamGroupDto = Readonly<z.infer<typeof ParamGroupDtoSchema>>;
export type ParamItemDto = Readonly<z.infer<typeof ParamItemDtoSchema>>;
export type AppStateDto = Readonly<z.infer<typeof AppStateDtoSchema>>;
export type StorageStateDto = Readonly<z.infer<typeof StorageStateDtoSchema>>;

// Runtime State Types (Mutable for Vue Reactivity)
export type ParamValue = {
  id: string,
  value: string,
};

export type ParamGroup = {
  id: string,
  type: 'group',
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