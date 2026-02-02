/**
 * Formatters index
 */

export { CliFormatter } from './cli-formatter.js';
export { JsonFormatter } from './json-formatter.js';
export type { OutputFormatter } from './types.js';

import { CliFormatter } from './cli-formatter.js';
import { JsonFormatter } from './json-formatter.js';
import type { OutputFormatter } from './types.js';

/**
 * Get formatter based on format name
 */
export function getFormatter(format: 'human' | 'json' = 'human'): OutputFormatter {
    switch (format) {
        case 'json':
            return new JsonFormatter();
        case 'human':
        default:
            return new CliFormatter();
    }
}
