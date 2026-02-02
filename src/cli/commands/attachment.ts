/**
 * Attachment commands
 */

import { Command } from 'commander';
import { EmailService } from '../../services/email-service.js';
import { AccountManager } from '../../account-manager.js';
import { getFormatterFromOptions, output, asyncHandler, type GlobalOptions } from '../utils.js';

export function createAttachmentCommands(accountManager: AccountManager): Command {
    const attachment = new Command('attachment')
        .description('Attachment operations');

    const emailService = new EmailService(accountManager);

    // gmail attachment download
    attachment
        .command('download')
        .description('Download an email attachment')
        .requiredOption('--message-id <messageId>', 'Message ID containing the attachment')
        .requiredOption('--id <attachmentId>', 'Attachment ID')
        .option('--filename <filename>', 'Save as this filename (defaults to original)')
        .option('--path <path>', 'Directory to save to (defaults to current directory)')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & {
            messageId: string;
            id: string;
            filename?: string;
            path?: string;
        }) => {
            const result = await emailService.downloadAttachment(
                options.messageId,
                options.id,
                {
                    account: options.account,
                    filename: options.filename,
                    savePath: options.path,
                }
            );

            const formatter = getFormatterFromOptions(options);

            if (options.format === 'json') {
                output(JSON.stringify(result, null, 2), options);
            } else {
                output(formatter.formatSuccess(
                    `Attachment downloaded:\n  File: ${result.filename}\n  Size: ${result.size} bytes\n  Saved to: ${result.path}`
                ), options);
            }
        }));

    return attachment;
}
