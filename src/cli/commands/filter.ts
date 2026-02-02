/**
 * Filter commands
 */

import { Command } from 'commander';
import { GmailService } from '../../services/gmail-service.js';
import { AccountManager } from '../../account-manager.js';
import {
    createFilter,
    listFilters,
    getFilter,
    deleteFilter,
    filterTemplates,
} from '../../filter-manager.js';
import { getFormatterFromOptions, output, asyncHandler, type GlobalOptions } from '../utils.js';

export function createFilterCommands(accountManager: AccountManager): Command {
    const filter = new Command('filter')
        .description('Filter management');

    const gmailService = new GmailService(accountManager);

    // gmail filter list
    filter
        .command('list')
        .description('List all filters')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions) => {
            const gmail = await gmailService.getGmail(options.account);
            const result = await listFilters(gmail);

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatFilters(result.filters), options);
        }));

    // gmail filter get
    filter
        .command('get')
        .description('Get a specific filter')
        .requiredOption('--id <filterId>', 'Filter ID')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & { id: string }) => {
            const gmail = await gmailService.getGmail(options.account);
            const result = await getFilter(gmail, options.id);

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatFilter(result), options);
        }));

    // gmail filter create
    filter
        .command('create')
        .description('Create a new filter')
        .option('--from <email>', 'Match emails from this sender')
        .option('--to <email>', 'Match emails to this recipient')
        .option('--subject <text>', 'Match emails with this subject text')
        .option('--query <query>', 'Gmail search query')
        .option('--has-attachment', 'Match emails with attachments')
        .option('--add-labels <labels>', 'Label IDs to add (comma-separated)')
        .option('--remove-labels <labels>', 'Label IDs to remove (comma-separated)')
        .option('--forward <email>', 'Forward matching emails to this address')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & {
            from?: string;
            to?: string;
            subject?: string;
            query?: string;
            hasAttachment?: boolean;
            addLabels?: string;
            removeLabels?: string;
            forward?: string;
        }) => {
            const gmail = await gmailService.getGmail(options.account);

            const criteria: any = {};
            if (options.from) criteria.from = options.from;
            if (options.to) criteria.to = options.to;
            if (options.subject) criteria.subject = options.subject;
            if (options.query) criteria.query = options.query;
            if (options.hasAttachment) criteria.hasAttachment = true;

            const action: any = {};
            if (options.addLabels) action.addLabelIds = options.addLabels.split(',').map(l => l.trim());
            if (options.removeLabels) action.removeLabelIds = options.removeLabels.split(',').map(l => l.trim());
            if (options.forward) action.forward = options.forward;

            const result = await createFilter(gmail, criteria, action);

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatFilter(result), options);
        }));

    // gmail filter delete
    filter
        .command('delete')
        .description('Delete a filter')
        .requiredOption('--id <filterId>', 'Filter ID to delete')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & { id: string }) => {
            const gmail = await gmailService.getGmail(options.account);
            const result = await deleteFilter(gmail, options.id);

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatSuccess(result.message), options);
        }));

    // gmail filter template
    filter
        .command('template')
        .description('Create a filter from a template')
        .requiredOption('--type <template>', 'Template: fromSender, withSubject, withAttachments, largeEmails, containingText, mailingList')
        .option('--sender <email>', 'Sender email (for fromSender)')
        .option('--subject-text <text>', 'Subject text (for withSubject)')
        .option('--search-text <text>', 'Search text (for containingText)')
        .option('--list-id <id>', 'Mailing list identifier (for mailingList)')
        .option('--size <bytes>', 'Size threshold in bytes (for largeEmails)')
        .option('--labels <labels>', 'Label IDs to apply (comma-separated)')
        .option('--archive', 'Archive matching emails (skip inbox)')
        .option('--mark-read', 'Mark matching emails as read')
        .option('--mark-important', 'Mark matching emails as important')
        .option('-a, --account <account>', 'Account email or alias')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & {
            type: string;
            sender?: string;
            subjectText?: string;
            searchText?: string;
            listId?: string;
            size?: string;
            labels?: string;
            archive?: boolean;
            markRead?: boolean;
            markImportant?: boolean;
        }) => {
            const gmail = await gmailService.getGmail(options.account);
            const labelIds = options.labels?.split(',').map(l => l.trim());

            let filterConfig;

            switch (options.type) {
                case 'fromSender':
                    if (!options.sender) throw new Error('--sender required for fromSender template');
                    filterConfig = filterTemplates.fromSender(options.sender, labelIds, options.archive);
                    break;
                case 'withSubject':
                    if (!options.subjectText) throw new Error('--subject-text required for withSubject template');
                    filterConfig = filterTemplates.withSubject(options.subjectText, labelIds, options.markRead);
                    break;
                case 'withAttachments':
                    filterConfig = filterTemplates.withAttachments(labelIds);
                    break;
                case 'largeEmails':
                    if (!options.size) throw new Error('--size required for largeEmails template');
                    filterConfig = filterTemplates.largeEmails(parseInt(options.size, 10), labelIds);
                    break;
                case 'containingText':
                    if (!options.searchText) throw new Error('--search-text required for containingText template');
                    filterConfig = filterTemplates.containingText(options.searchText, labelIds, options.markImportant);
                    break;
                case 'mailingList':
                    if (!options.listId) throw new Error('--list-id required for mailingList template');
                    filterConfig = filterTemplates.mailingList(options.listId, labelIds, options.archive);
                    break;
                default:
                    throw new Error(`Unknown template: ${options.type}`);
            }

            const result = await createFilter(gmail, filterConfig.criteria, filterConfig.action);

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatFilter(result), options);
        }));

    return filter;
}
