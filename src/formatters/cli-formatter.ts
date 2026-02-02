/**
 * Human-readable CLI formatter
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

export class CliFormatter implements OutputFormatter {
    formatEmail(email: EmailData): string {
        const lines: string[] = [
            `Thread ID: ${email.threadId}`,
            `Message-ID: ${email.messageId}`,
            `Subject: ${email.subject}`,
            `From: ${email.from}`,
            `To: ${email.to}`,
        ];

        if (email.cc) {
            lines.push(`CC: ${email.cc}`);
        }

        lines.push(`Date: ${email.date}`);
        lines.push('');

        if (email.isHtmlOnly) {
            lines.push('[Note: This email is HTML-formatted. Plain text version not available.]');
            lines.push('');
        }

        lines.push(email.body.text || email.body.html || '(no content)');

        if (email.attachments.length > 0) {
            lines.push('');
            lines.push(`Attachments (${email.attachments.length}):`);
            email.attachments.forEach(a => {
                lines.push(`  - ${a.filename} (${a.mimeType}, ${Math.round(a.size / 1024)} KB, ID: ${a.id})`);
            });
        }

        return lines.join('\n');
    }

    formatSearchResults(results: SearchResult[]): string {
        if (results.length === 0) {
            return 'No emails found.';
        }

        return results.map((r, i) => {
            const lines = [
                `[${i + 1}] ${r.subject || '(no subject)'}`,
                `    From: ${r.from}`,
                `    Date: ${r.date}`,
                `    ID: ${r.id}`,
            ];
            if (r.snippet) {
                lines.push(`    ${r.snippet.substring(0, 80)}${r.snippet.length > 80 ? '...' : ''}`);
            }
            return lines.join('\n');
        }).join('\n\n');
    }

    formatThread(thread: ThreadData, showingRange?: { start: number; end: number }): string {
        const lines: string[] = [
            `Thread ID: ${thread.id}`,
            `Subject: ${thread.subject}`,
            `Total Messages: ${thread.totalMessages}`,
        ];

        if (showingRange) {
            lines.push(`Showing: ${showingRange.start}-${showingRange.end} of ${thread.totalMessages}`);
        } else {
            lines.push(`Showing: all ${thread.totalMessages} messages`);
        }

        lines.push('');

        thread.messages.forEach((msg, idx) => {
            const msgNum = showingRange ? showingRange.start + idx : idx + 1;
            lines.push(`--- Message ${msgNum} of ${thread.totalMessages} ---`);
            lines.push(`Message ID: ${msg.id}`);
            lines.push(`From: ${msg.from}`);
            lines.push(`To: ${msg.to}`);
            lines.push(`Date: ${msg.date}`);
            lines.push(`Message-ID: ${msg.messageId}`);
            lines.push('');

            if (msg.isHtmlOnly) {
                lines.push('[Note: HTML-formatted email]');
                lines.push('');
            }

            lines.push(msg.body.text || msg.body.html || '(no content)');

            if (msg.attachments.length > 0) {
                lines.push('');
                lines.push(`Attachments (${msg.attachments.length}):`);
                msg.attachments.forEach(a => {
                    lines.push(`  - ${a.filename} (${a.mimeType}, ${Math.round(a.size / 1024)} KB, ID: ${a.id})`);
                });
            }

            lines.push('');
        });

        return lines.join('\n');
    }

    formatBatchResult(result: BatchOperationResult<string>, operation: string): string {
        const lines: string[] = [
            `Batch ${operation} complete.`,
            `Successfully processed: ${result.successCount} items`,
        ];

        if (result.failureCount > 0) {
            lines.push(`Failed to process: ${result.failureCount} items`);
            lines.push('');
            lines.push('Failed items:');
            result.failures.forEach(f => {
                const shortId = f.item.length > 16 ? `${f.item.substring(0, 16)}...` : f.item;
                lines.push(`  - ${shortId} (${f.error})`);
            });
        }

        return lines.join('\n');
    }

    formatLabels(labels: { system: GmailLabel[]; user: GmailLabel[]; count: { system: number; user: number; total: number } }): string {
        const lines: string[] = [
            `Found ${labels.count.total} labels (${labels.count.system} system, ${labels.count.user} user)`,
            '',
            'System Labels:',
        ];

        labels.system.forEach(l => {
            lines.push(`  ${l.name} (ID: ${l.id})`);
        });

        lines.push('');
        lines.push('User Labels:');

        if (labels.user.length === 0) {
            lines.push('  (none)');
        } else {
            labels.user.forEach(l => {
                lines.push(`  ${l.name} (ID: ${l.id})`);
            });
        }

        return lines.join('\n');
    }

    formatLabel(label: GmailLabel): string {
        return `ID: ${label.id}\nName: ${label.name}\nType: ${label.type}`;
    }

    formatFilters(filters: GmailFilter[]): string {
        if (filters.length === 0) {
            return 'No filters found.';
        }

        const lines: string[] = [`Found ${filters.length} filters:`, ''];

        filters.forEach((filter, i) => {
            lines.push(`[${i + 1}] ID: ${filter.id}`);
            lines.push(`    Criteria: ${this.formatFilterCriteria(filter.criteria)}`);
            lines.push(`    Actions: ${this.formatFilterActions(filter.action)}`);
            lines.push('');
        });

        return lines.join('\n');
    }

    formatFilter(filter: GmailFilter): string {
        return [
            `ID: ${filter.id}`,
            `Criteria: ${this.formatFilterCriteria(filter.criteria)}`,
            `Actions: ${this.formatFilterActions(filter.action)}`,
        ].join('\n');
    }

    private formatFilterCriteria(criteria: GmailFilter['criteria']): string {
        return Object.entries(criteria)
            .filter(([_, value]) => value !== undefined)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ') || '(none)';
    }

    private formatFilterActions(action: GmailFilter['action']): string {
        return Object.entries(action)
            .filter(([_, value]) => value !== undefined && (Array.isArray(value) ? value.length > 0 : true))
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
            .join(', ') || '(none)';
    }

    formatAccounts(accounts: Array<{ email: string; alias?: string; lastUsed: Date }>, activeAccount?: string): string {
        if (accounts.length === 0) {
            return 'No accounts authenticated. Use "gmail account auth [alias]" to add an account.';
        }

        const lines: string[] = [`Authenticated accounts (${accounts.length}):`, ''];

        accounts.forEach(acc => {
            const isActive = acc.email === activeAccount ? ' [ACTIVE]' : '';
            const alias = acc.alias ? ` (alias: ${acc.alias})` : '';
            const lastUsed = acc.lastUsed.toLocaleString();
            lines.push(`  • ${acc.email}${alias}${isActive}`);
            lines.push(`    Last used: ${lastUsed}`);
            lines.push('');
        });

        return lines.join('\n');
    }

    formatSuccess(message: string): string {
        return `✓ ${message}`;
    }

    formatError(error: string | Error): string {
        const message = error instanceof Error ? error.message : error;
        return `✗ Error: ${message}`;
    }

    formatOperationResult(result: OperationResult): string {
        if (result.success) {
            return this.formatSuccess(result.message || 'Operation completed successfully');
        } else {
            return this.formatError(result.error || 'Operation failed');
        }
    }

    formatDryRun(message: string, affectedCount?: number): string {
        const countInfo = affectedCount !== undefined ? ` (${affectedCount} items)` : '';
        return `[DRY RUN] ${message}${countInfo}\n\nRun without --dry-run to execute.`;
    }
}
