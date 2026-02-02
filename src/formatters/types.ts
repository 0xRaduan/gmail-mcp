/**
 * Formatter types and interfaces
 */

import type {
    EmailData,
    SearchResult,
    ThreadData,
    BatchOperationResult,
    GmailLabel,
    GmailFilter,
    OperationResult,
} from '../services/types.js';

/**
 * Output formatter interface
 */
export interface OutputFormatter {
    // Email formatting
    formatEmail(email: EmailData): string;
    formatSearchResults(results: SearchResult[]): string;

    // Thread formatting
    formatThread(thread: ThreadData, showingRange?: { start: number; end: number }): string;

    // Batch operation formatting
    formatBatchResult(result: BatchOperationResult<string>, operation: string): string;

    // Label formatting
    formatLabels(labels: { system: GmailLabel[]; user: GmailLabel[]; count: { system: number; user: number; total: number } }): string;
    formatLabel(label: GmailLabel): string;

    // Filter formatting
    formatFilters(filters: GmailFilter[]): string;
    formatFilter(filter: GmailFilter): string;

    // Account formatting
    formatAccounts(accounts: Array<{ email: string; alias?: string; lastUsed: Date }>, activeAccount?: string): string;

    // Generic formatting
    formatSuccess(message: string): string;
    formatError(error: string | Error): string;
    formatOperationResult(result: OperationResult): string;

    // Dry-run formatting
    formatDryRun(message: string, affectedCount?: number): string;
}
