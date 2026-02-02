/**
 * CLI utility functions
 */

import { getFormatter } from '../formatters/index.js';
import type { OutputFormatter } from '../formatters/types.js';

/**
 * Read IDs from stdin (one per line)
 */
export async function readStdin(): Promise<string[]> {
    // Check if stdin is a TTY (interactive terminal)
    if (process.stdin.isTTY) {
        return [];
    }

    const chunks: Buffer[] = [];

    for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
    }

    const input = Buffer.concat(chunks).toString('utf-8');
    return input
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
}

/**
 * Parse IDs from command options (either --ids or --stdin)
 */
export async function parseIds(options: { ids?: string; stdin?: boolean }): Promise<string[]> {
    if (options.stdin) {
        const ids = await readStdin();
        if (ids.length === 0) {
            throw new Error('No IDs provided via stdin. Pipe IDs (one per line) to this command.');
        }
        return ids;
    }

    if (options.ids) {
        return options.ids.split(',').map(id => id.trim()).filter(id => id.length > 0);
    }

    throw new Error('Must provide either --ids or --stdin');
}

/**
 * Global CLI options
 */
export interface GlobalOptions {
    account?: string;
    format?: 'human' | 'json';
    dryRun?: boolean;
    quiet?: boolean;
}

/**
 * Get formatter based on options
 */
export function getFormatterFromOptions(options: GlobalOptions): OutputFormatter {
    return getFormatter(options.format || 'human');
}

/**
 * Output result to console
 */
export function output(text: string, options: GlobalOptions): void {
    if (!options.quiet) {
        console.log(text);
    }
}

/**
 * Output error and exit
 */
export function outputError(error: string | Error, options: GlobalOptions): never {
    const formatter = getFormatterFromOptions(options);
    console.error(formatter.formatError(error));
    process.exit(1);
}

/**
 * Wrap async command handler with error handling
 */
export function asyncHandler<T extends GlobalOptions>(
    fn: (options: T, ...args: any[]) => Promise<void>
): (options: T, ...args: any[]) => void {
    return (options: T, ...args: any[]) => {
        fn(options, ...args).catch((error: Error) => {
            outputError(error, options);
        });
    };
}
