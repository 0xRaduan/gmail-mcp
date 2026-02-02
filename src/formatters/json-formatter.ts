/**
 * JSON formatter for pipe-friendly output
 */

import type { OutputFormatter } from './types.js';
import type {
    EmailData,
    SearchResult,
    ThreadData,
    BatchOperationResult,
    GmailLabel,
    GmailFilter,
    OperationResult,
} from '../services/types.js';

export class JsonFormatter implements OutputFormatter {
    private stringify(data: any): string {
        return JSON.stringify(data, null, 2);
    }

    formatEmail(email: EmailData): string {
        return this.stringify(email);
    }

    formatSearchResults(results: SearchResult[]): string {
        return this.stringify({
            messages: results,
            count: results.length,
        });
    }

    formatThread(thread: ThreadData, showingRange?: { start: number; end: number }): string {
        return this.stringify({
            ...thread,
            showing: showingRange ? {
                start: showingRange.start,
                end: showingRange.end,
            } : undefined,
        });
    }

    formatBatchResult(result: BatchOperationResult<string>, operation: string): string {
        return this.stringify({
            operation,
            ...result,
        });
    }

    formatLabels(labels: { system: GmailLabel[]; user: GmailLabel[]; count: { system: number; user: number; total: number } }): string {
        return this.stringify(labels);
    }

    formatLabel(label: GmailLabel): string {
        return this.stringify(label);
    }

    formatFilters(filters: GmailFilter[]): string {
        return this.stringify({
            filters,
            count: filters.length,
        });
    }

    formatFilter(filter: GmailFilter): string {
        return this.stringify(filter);
    }

    formatAccounts(accounts: Array<{ email: string; alias?: string; lastUsed: Date }>, activeAccount?: string): string {
        return this.stringify({
            accounts: accounts.map(acc => ({
                ...acc,
                isActive: acc.email === activeAccount,
            })),
            count: accounts.length,
            activeAccount,
        });
    }

    formatSuccess(message: string): string {
        return this.stringify({
            success: true,
            message,
        });
    }

    formatError(error: string | Error): string {
        const message = error instanceof Error ? error.message : error;
        return this.stringify({
            success: false,
            error: message,
        });
    }

    formatOperationResult(result: OperationResult): string {
        return this.stringify(result);
    }

    formatDryRun(message: string, affectedCount?: number): string {
        return this.stringify({
            dryRun: true,
            message,
            affectedCount,
        });
    }
}
