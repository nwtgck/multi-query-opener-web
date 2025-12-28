import { z, } from 'zod';
import { AppStateSchema, CompressedStateSchema, } from './schemas';

export type AppState = Readonly<z.infer<typeof AppStateSchema>>;

export type CompressedState = Readonly<z.infer<typeof CompressedStateSchema>>;
