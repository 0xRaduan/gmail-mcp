/**
 * Batch commands
 */

import { Command } from 'commander';
import { BatchService } from '../../services/batch-service.js';
import { AccountManager } from '../../account-manager.js';
import { getFormatterFromOptions, output, parseIds, asyncHandler, type GlobalOptions } from '../utils.js';

export function createBatchCommands(accountManager: AccountManager): Command {
    const batch = new Command('batch')
        .description('Batch operations on multiple emails/threads');

    const batchService = new BatchService(accountManager);

    // gmail batch modify-emails
    batch
        .command('modify-emails')
        .description('Modify labels for multiple emails')
        .option('--ids <ids>', 'Message IDs (comma-separated)')
        .option('--stdin', 'Read message IDs from stdin (one per line)')
        .option('--add-labels <labels>', 'Label IDs to add (comma-separated)')
        .option('--remove-labels <labels>', 'Label IDs to remove (comma-separated)')
        .option('--batch-size <size>', 'Batch size for processing', '50')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--dry-run', 'Preview without modifying')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & {
            ids?: string;
            stdin?: boolean;
            addLabels?: string;
            removeLabels?: string;
            batchSize: string;
        }) => {
            const messageIds = await parseIds(options);

            const result = await batchService.modifyEmails(
                messageIds,
                {
                    addLabelIds: options.addLabels?.split(',').map(l => l.trim()),
                    removeLabelIds: options.removeLabels?.split(',').map(l => l.trim()),
                },
                {
                    account: options.account,
                    dryRun: options.dryRun,
                    batchSize: parseInt(options.batchSize, 10),
                }
            );

            const formatter = getFormatterFromOptions(options);
            if (options.dryRun) {
                output(formatter.formatDryRun(
                    `Would modify ${messageIds.length} emails`,
                    messageIds.length
                ), options);
            } else {
                output(formatter.formatBatchResult(result, 'label modification'), options);
            }
        }));

    // gmail batch delete-emails
    batch
        .command('delete-emails')
        .description('Permanently delete multiple emails')
        .option('--ids <ids>', 'Message IDs (comma-separated)')
        .option('--stdin', 'Read message IDs from stdin (one per line)')
        .option('--batch-size <size>', 'Batch size for processing', '50')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--dry-run', 'Preview without deleting')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & {
            ids?: string;
            stdin?: boolean;
            batchSize: string;
        }) => {
            const messageIds = await parseIds(options);

            const result = await batchService.deleteEmails(messageIds, {
                account: options.account,
                dryRun: options.dryRun,
                batchSize: parseInt(options.batchSize, 10),
            });

            const formatter = getFormatterFromOptions(options);
            if (options.dryRun) {
                output(formatter.formatDryRun(
                    `Would delete ${messageIds.length} emails`,
                    messageIds.length
                ), options);
            } else {
                output(formatter.formatBatchResult(result, 'delete'), options);
            }
        }));

    // gmail batch modify-threads
    batch
        .command('modify-threads')
        .description('Modify labels for multiple threads')
        .option('--ids <ids>', 'Thread IDs (comma-separated)')
        .option('--stdin', 'Read thread IDs from stdin (one per line)')
        .option('--add-labels <labels>', 'Label IDs to add (comma-separated)')
        .option('--remove-labels <labels>', 'Label IDs to remove (comma-separated)')
        .option('--batch-size <size>', 'Batch size for processing', '50')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--dry-run', 'Preview without modifying')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & {
            ids?: string;
            stdin?: boolean;
            addLabels?: string;
            removeLabels?: string;
            batchSize: string;
        }) => {
            const threadIds = await parseIds(options);

            const result = await batchService.modifyThreads(
                threadIds,
                {
                    addLabelIds: options.addLabels?.split(',').map(l => l.trim()),
                    removeLabelIds: options.removeLabels?.split(',').map(l => l.trim()),
                },
                {
                    account: options.account,
                    dryRun: options.dryRun,
                    batchSize: parseInt(options.batchSize, 10),
                }
            );

            const formatter = getFormatterFromOptions(options);
            if (options.dryRun) {
                output(formatter.formatDryRun(
                    `Would modify ${threadIds.length} threads`,
                    threadIds.length
                ), options);
            } else {
                output(formatter.formatBatchResult(result, 'thread modification'), options);
            }
        }));

    // gmail batch archive
    batch
        .command('archive')
        .description('Archive emails (remove from INBOX)')
        .option('--ids <ids>', 'Message IDs (comma-separated)')
        .option('--stdin', 'Read message IDs from stdin (one per line)')
        .option('--batch-size <size>', 'Batch size for processing', '50')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--dry-run', 'Preview without archiving')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & {
            ids?: string;
            stdin?: boolean;
            batchSize: string;
        }) => {
            const messageIds = await parseIds(options);

            const result = await batchService.archiveEmails(messageIds, {
                account: options.account,
                dryRun: options.dryRun,
                batchSize: parseInt(options.batchSize, 10),
            });

            const formatter = getFormatterFromOptions(options);
            if (options.dryRun) {
                output(formatter.formatDryRun(
                    `Would archive ${messageIds.length} emails`,
                    messageIds.length
                ), options);
            } else {
                output(formatter.formatBatchResult(result, 'archive'), options);
            }
        }));

    // gmail batch trash
    batch
        .command('trash')
        .description('Move emails to trash')
        .option('--ids <ids>', 'Message IDs (comma-separated)')
        .option('--stdin', 'Read message IDs from stdin (one per line)')
        .option('--batch-size <size>', 'Batch size for processing', '50')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--dry-run', 'Preview without trashing')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & {
            ids?: string;
            stdin?: boolean;
            batchSize: string;
        }) => {
            const messageIds = await parseIds(options);

            const result = await batchService.trashEmails(messageIds, {
                account: options.account,
                dryRun: options.dryRun,
                batchSize: parseInt(options.batchSize, 10),
            });

            const formatter = getFormatterFromOptions(options);
            if (options.dryRun) {
                output(formatter.formatDryRun(
                    `Would move ${messageIds.length} emails to trash`,
                    messageIds.length
                ), options);
            } else {
                output(formatter.formatBatchResult(result, 'trash'), options);
            }
        }));

    // gmail batch mark-read
    batch
        .command('mark-read')
        .description('Mark emails as read')
        .option('--ids <ids>', 'Message IDs (comma-separated)')
        .option('--stdin', 'Read message IDs from stdin (one per line)')
        .option('--batch-size <size>', 'Batch size for processing', '50')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--dry-run', 'Preview without modifying')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & {
            ids?: string;
            stdin?: boolean;
            batchSize: string;
        }) => {
            const messageIds = await parseIds(options);

            const result = await batchService.markAsRead(messageIds, {
                account: options.account,
                dryRun: options.dryRun,
                batchSize: parseInt(options.batchSize, 10),
            });

            const formatter = getFormatterFromOptions(options);
            if (options.dryRun) {
                output(formatter.formatDryRun(
                    `Would mark ${messageIds.length} emails as read`,
                    messageIds.length
                ), options);
            } else {
                output(formatter.formatBatchResult(result, 'mark as read'), options);
            }
        }));

    // gmail batch star
    batch
        .command('star')
        .description('Star emails')
        .option('--ids <ids>', 'Message IDs (comma-separated)')
        .option('--stdin', 'Read message IDs from stdin (one per line)')
        .option('--batch-size <size>', 'Batch size for processing', '50')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--dry-run', 'Preview without starring')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & {
            ids?: string;
            stdin?: boolean;
            batchSize: string;
        }) => {
            const messageIds = await parseIds(options);

            const result = await batchService.starEmails(messageIds, {
                account: options.account,
                dryRun: options.dryRun,
                batchSize: parseInt(options.batchSize, 10),
            });

            const formatter = getFormatterFromOptions(options);
            if (options.dryRun) {
                output(formatter.formatDryRun(
                    `Would star ${messageIds.length} emails`,
                    messageIds.length
                ), options);
            } else {
                output(formatter.formatBatchResult(result, 'star'), options);
            }
        }));

    return batch;
}
