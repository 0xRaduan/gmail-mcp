/**
 * Thread commands
 */

import { Command } from 'commander';
import { ThreadService } from '../../services/thread-service.js';
import { AccountManager } from '../../account-manager.js';
import { getFormatterFromOptions, output, asyncHandler, type GlobalOptions } from '../utils.js';

export function createThreadCommands(accountManager: AccountManager): Command {
    const thread = new Command('thread')
        .description('Thread (conversation) operations');

    const threadService = new ThreadService(accountManager);

    // gmail thread read
    thread
        .command('read')
        .description('Read all messages in a thread')
        .requiredOption('--id <threadId>', 'Thread ID to read')
        .option('--max <number>', 'Maximum number of messages to return')
        .option('--offset <number>', 'Skip this many messages from the start', '0')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & {
            id: string;
            max?: string;
            offset: string;
        }) => {
            const offset = parseInt(options.offset, 10);
            const maxMessages = options.max ? parseInt(options.max, 10) : undefined;

            const threadData = await threadService.read(
                {
                    threadId: options.id,
                    maxMessages,
                    offset,
                },
                { account: options.account }
            );

            const formatter = getFormatterFromOptions(options);
            const showingRange = maxMessages || offset > 0
                ? {
                    start: offset + 1,
                    end: offset + threadData.messages.length,
                }
                : undefined;

            output(formatter.formatThread(threadData, showingRange), options);
        }));

    // gmail thread modify
    thread
        .command('modify')
        .description('Modify labels for an entire thread')
        .requiredOption('--id <threadId>', 'Thread ID to modify')
        .option('--add-labels <labels>', 'Label IDs to add (comma-separated)')
        .option('--remove-labels <labels>', 'Label IDs to remove (comma-separated)')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--dry-run', 'Preview without modifying')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & {
            id: string;
            addLabels?: string;
            removeLabels?: string;
        }) => {
            const result = await threadService.modify(
                options.id,
                {
                    addLabelIds: options.addLabels?.split(',').map(l => l.trim()),
                    removeLabelIds: options.removeLabels?.split(',').map(l => l.trim()),
                },
                { account: options.account, dryRun: options.dryRun }
            );

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatOperationResult(result), options);
        }));

    return thread;
}
