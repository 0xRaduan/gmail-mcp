/**
 * Email commands
 */

import { Command } from 'commander';
import { EmailService } from '../../services/email-service.js';
import { AccountManager } from '../../account-manager.js';
import { getFormatterFromOptions, output, asyncHandler, type GlobalOptions } from '../utils.js';

export function createEmailCommands(accountManager: AccountManager): Command {
    const email = new Command('email')
        .description('Email operations');

    const emailService = new EmailService(accountManager);

    // gmail email search
    email
        .command('search')
        .description('Search for emails using Gmail query syntax')
        .requiredOption('-q, --query <query>', 'Gmail search query (e.g., "from:example@gmail.com")')
        .option('-n, --max <number>', 'Maximum number of results', '10')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & { query: string; max: string }) => {
            const results = await emailService.search(
                { query: options.query, maxResults: parseInt(options.max, 10) },
                { account: options.account }
            );

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatSearchResults(results), options);
        }));

    // gmail email read
    email
        .command('read')
        .description('Read a specific email')
        .requiredOption('--id <messageId>', 'Message ID to read')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & { id: string }) => {
            const email = await emailService.read(options.id, { account: options.account });

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatEmail(email), options);
        }));

    // gmail email send
    email
        .command('send')
        .description('Send an email')
        .requiredOption('--to <recipients>', 'Recipient email addresses (comma-separated)')
        .requiredOption('--subject <subject>', 'Email subject')
        .requiredOption('--body <body>', 'Email body')
        .option('--html <htmlBody>', 'HTML version of the email body')
        .option('--from <from>', 'Send from address (must be verified alias)')
        .option('--cc <cc>', 'CC recipients (comma-separated)')
        .option('--bcc <bcc>', 'BCC recipients (comma-separated)')
        .option('--thread-id <threadId>', 'Thread ID to reply to')
        .option('--in-reply-to <messageId>', 'Message ID being replied to')
        .option('--attachments <files>', 'File paths to attach (comma-separated)')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--dry-run', 'Preview without sending')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & {
            to: string;
            subject: string;
            body: string;
            html?: string;
            from?: string;
            cc?: string;
            bcc?: string;
            threadId?: string;
            inReplyTo?: string;
            attachments?: string;
        }) => {
            const result = await emailService.send({
                to: options.to.split(',').map(e => e.trim()),
                subject: options.subject,
                body: options.body,
                htmlBody: options.html,
                from: options.from,
                cc: options.cc?.split(',').map(e => e.trim()),
                bcc: options.bcc?.split(',').map(e => e.trim()),
                threadId: options.threadId,
                inReplyTo: options.inReplyTo,
                attachments: options.attachments?.split(',').map(f => f.trim()),
            }, { account: options.account, dryRun: options.dryRun });

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatOperationResult(result), options);
        }));

    // gmail email draft
    email
        .command('draft')
        .description('Create an email draft')
        .requiredOption('--to <recipients>', 'Recipient email addresses (comma-separated)')
        .requiredOption('--subject <subject>', 'Email subject')
        .requiredOption('--body <body>', 'Email body')
        .option('--html <htmlBody>', 'HTML version of the email body')
        .option('--from <from>', 'Send from address (must be verified alias)')
        .option('--cc <cc>', 'CC recipients (comma-separated)')
        .option('--bcc <bcc>', 'BCC recipients (comma-separated)')
        .option('--thread-id <threadId>', 'Thread ID to reply to')
        .option('--attachments <files>', 'File paths to attach (comma-separated)')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--dry-run', 'Preview without creating draft')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & {
            to: string;
            subject: string;
            body: string;
            html?: string;
            from?: string;
            cc?: string;
            bcc?: string;
            threadId?: string;
            attachments?: string;
        }) => {
            const result = await emailService.draft({
                to: options.to.split(',').map(e => e.trim()),
                subject: options.subject,
                body: options.body,
                htmlBody: options.html,
                from: options.from,
                cc: options.cc?.split(',').map(e => e.trim()),
                bcc: options.bcc?.split(',').map(e => e.trim()),
                threadId: options.threadId,
                attachments: options.attachments?.split(',').map(f => f.trim()),
            }, { account: options.account, dryRun: options.dryRun });

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatOperationResult(result), options);
        }));

    // gmail email modify
    email
        .command('modify')
        .description('Modify email labels')
        .requiredOption('--id <messageId>', 'Message ID to modify')
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
            const result = await emailService.modify(
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

    // gmail email delete
    email
        .command('delete')
        .description('Permanently delete an email')
        .requiredOption('--id <messageId>', 'Message ID to delete')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--dry-run', 'Preview without deleting')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & { id: string }) => {
            const result = await emailService.delete(options.id, {
                account: options.account,
                dryRun: options.dryRun,
            });

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatOperationResult(result), options);
        }));

    return email;
}
