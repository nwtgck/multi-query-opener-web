import { z, } from 'zod';
import { AppStateSchema, StorageStateSchema, } from './schemas';

export type AppState = Readonly<z.infer<typeof AppStateSchema>>;

export type StorageState = Readonly<z.infer<typeof StorageStateSchema>>;