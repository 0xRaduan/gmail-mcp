/**
 * Label commands
 */

import { Command } from 'commander';
import { GmailService } from '../../services/gmail-service.js';
import { AccountManager } from '../../account-manager.js';
import {
    createLabel,
    updateLabel,
    deleteLabel,
    listLabels,
    getOrCreateLabel,
} from '../../label-manager.js';
import { getFormatterFromOptions, output, asyncHandler, type GlobalOptions } from '../utils.js';

export function createLabelCommands(accountManager: AccountManager): Command {
    const label = new Command('label')
        .description('Label management');

    const gmailService = new GmailService(accountManager);

    // gmail label list
    label
        .command('list')
        .description('List all labels')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions) => {
            const gmail = await gmailService.getGmail(options.account);
            const labelResults = await listLabels(gmail);

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatLabels(labelResults), options);
        }));

    // gmail label create
    label
        .command('create')
        .description('Create a new label')
        .requiredOption('--name <name>', 'Name for the new label')
        .option('--message-visibility <visibility>', 'show or hide in message list')
        .option('--label-visibility <visibility>', 'labelShow, labelShowIfUnread, or labelHide')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & {
            name: string;
            messageVisibility?: string;
            labelVisibility?: string;
        }) => {
            const gmail = await gmailService.getGmail(options.account);
            const result = await createLabel(gmail, options.name, {
                messageListVisibility: options.messageVisibility as any,
                labelListVisibility: options.labelVisibility as any,
            });

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatLabel(result as any), options);
        }));

    // gmail label update
    label
        .command('update')
        .description('Update an existing label')
        .requiredOption('--id <id>', 'Label ID to update')
        .option('--name <name>', 'New name for the label')
        .option('--message-visibility <visibility>', 'show or hide in message list')
        .option('--label-visibility <visibility>', 'labelShow, labelShowIfUnread, or labelHide')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & {
            id: string;
            name?: string;
            messageVisibility?: string;
            labelVisibility?: string;
        }) => {
            const gmail = await gmailService.getGmail(options.account);

            const updates: any = {};
            if (options.name) updates.name = options.name;
            if (options.messageVisibility) updates.messageListVisibility = options.messageVisibility;
            if (options.labelVisibility) updates.labelListVisibility = options.labelVisibility;

            const result = await updateLabel(gmail, options.id, updates);

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatLabel(result as any), options);
        }));

    // gmail label delete
    label
        .command('delete')
        .description('Delete a label')
        .requiredOption('--id <id>', 'Label ID to delete')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & { id: string }) => {
            const gmail = await gmailService.getGmail(options.account);
            const result = await deleteLabel(gmail, options.id);

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatSuccess(result.message), options);
        }));

    // gmail label get-or-create
    label
        .command('get-or-create')
        .description('Get an existing label by name or create it')
        .requiredOption('--name <name>', 'Label name')
        .option('--message-visibility <visibility>', 'show or hide in message list')
        .option('--label-visibility <visibility>', 'labelShow, labelShowIfUnread, or labelHide')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & {
            name: string;
            messageVisibility?: string;
            labelVisibility?: string;
        }) => {
            const gmail = await gmailService.getGmail(options.account);
            const result = await getOrCreateLabel(gmail, options.name, {
                messageListVisibility: options.messageVisibility as any,
                labelListVisibility: options.labelVisibility as any,
            });

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatLabel(result as any), options);
        }));

    return label;
}
