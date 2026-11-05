// Check IDs: P0-B09
import { localValue } from './local.js';
import { nestedValue } from './nested/value.js';

export const entryValue = localValue + nestedValue + 12;
