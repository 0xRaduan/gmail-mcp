#!/usr/bin/env node

/**
 * Gmail MCP Server
 *
 * A thin wrapper that exposes the Gmail services via the Model Context Protocol.
 * All business logic is in src/services/ - this file only handles MCP protocol.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as schemas from "./schemas.js";
import fs from 'fs';
import path from 'path';
import http from 'http';
import open from 'open';
import os from 'os';

// Services
import { AccountManager } from "./account-manager.js";
import { EmailService } from "./services/email-service.js";
import { ThreadService } from "./services/thread-service.js";
import { BatchService } from "./services/batch-service.js";
import { GmailService } from "./services/gmail-service.js";

// Label and filter managers (already extracted)
import { createLabel, updateLabel, deleteLabel, listLabels, getOrCreateLabel, GmailLabel } from "./label-manager.js";
import { createFilter, listFilters, getFilter, deleteFilter, filterTemplates } from "./filter-manager.js";

// Configuration paths
const CONFIG_DIR = path.join(os.homedir(), '.gmail-mcp');
const OAUTH_PATH = process.env.GMAIL_OAUTH_PATH || path.join(CONFIG_DIR, 'gcp-oauth.keys.json');

// Services instances (initialized in main)
let accountManager: AccountManager;
let emailService: EmailService;
let threadService: ThreadService;
let batchService: BatchService;
let gmailService: GmailService;

// =============================================================================
// Zod Schemas for input validation
// =============================================================================

const AccountBaseSchema = z.object({
    account: z.string().optional().describe("Email address or alias of the account to use. If not specified, uses the active account."),
});

const SendEmailSchema = AccountBaseSchema.extend({
    to: z.array(z.string()).describe("List of recipient email addresses"),
    subject: z.string().describe("Email subject"),
    body: z.string().describe("Email body content"),
    htmlBody: z.string().optional().describe("HTML version of the email body"),
    mimeType: z.enum(['text/plain', 'text/html', 'multipart/alternative']).optional().default('text/plain'),
    from: z.string().optional().describe("Send from address (must be verified alias)"),
    cc: z.array(z.string()).optional(),
    bcc: z.array(z.string()).optional(),
    threadId: z.string().optional(),
    inReplyTo: z.string().optional(),
    attachments: z.array(z.string()).optional(),
});

const ReadEmailSchema = AccountBaseSchema.extend({
    messageId: z.string().describe("ID of the email message to retrieve"),
});

const SearchEmailsSchema = AccountBaseSchema.extend({
    query: z.string().describe("Gmail search query"),
    maxResults: z.number().optional(),
});

const ModifyEmailSchema = AccountBaseSchema.extend({
    messageId: z.string().describe("ID of the email message to modify"),
    labelIds: z.array(z.string()).optional(),
    addLabelIds: z.array(z.string()).optional(),
    removeLabelIds: z.array(z.string()).optional(),
});

const DeleteEmailSchema = AccountBaseSchema.extend({
    messageId: z.string().describe("ID of the email message to delete"),
});

const ListEmailLabelsSchema = AccountBaseSchema.extend({});

const CreateLabelSchema = AccountBaseSchema.extend({
    name: z.string(),
    messageListVisibility: z.enum(['show', 'hide']).optional(),
    labelListVisibility: z.enum(['labelShow', 'labelShowIfUnread', 'labelHide']).optional(),
});

const UpdateLabelSchema = AccountBaseSchema.extend({
    id: z.string(),
    name: z.string().optional(),
    messageListVisibility: z.enum(['show', 'hide']).optional(),
    labelListVisibility: z.enum(['labelShow', 'labelShowIfUnread', 'labelHide']).optional(),
});

const DeleteLabelSchema = AccountBaseSchema.extend({
    id: z.string(),
});

const GetOrCreateLabelSchema = AccountBaseSchema.extend({
    name: z.string(),
    messageListVisibility: z.enum(['show', 'hide']).optional(),
    labelListVisibility: z.enum(['labelShow', 'labelShowIfUnread', 'labelHide']).optional(),
});

const BatchModifyEmailsSchema = AccountBaseSchema.extend({
    messageIds: z.array(z.string()),
    addLabelIds: z.array(z.string()).optional(),
    removeLabelIds: z.array(z.string()).optional(),
    batchSize: z.number().optional().default(50),
});

const BatchDeleteEmailsSchema = AccountBaseSchema.extend({
    messageIds: z.array(z.string()),
    batchSize: z.number().optional().default(50),
});

const ReadThreadSchema = AccountBaseSchema.extend({
    threadId: z.string(),
    maxMessages: z.number().optional(),
    offset: z.number().optional(),
});

const ModifyThreadSchema = AccountBaseSchema.extend({
    threadId: z.string(),
    addLabelIds: z.array(z.string()).optional(),
    removeLabelIds: z.array(z.string()).optional(),
});

const BatchModifyThreadsSchema = AccountBaseSchema.extend({
    threadIds: z.array(z.string()),
    addLabelIds: z.array(z.string()).optional(),
    removeLabelIds: z.array(z.string()).optional(),
    batchSize: z.number().optional().default(50),
});

const CreateFilterSchema = AccountBaseSchema.extend({
    criteria: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        subject: z.string().optional(),
        query: z.string().optional(),
        negatedQuery: z.string().optional(),
        hasAttachment: z.boolean().optional(),
        excludeChats: z.boolean().optional(),
        size: z.number().optional(),
        sizeComparison: z.enum(['unspecified', 'smaller', 'larger']).optional(),
    }),
    action: z.object({
        addLabelIds: z.array(z.string()).optional(),
        removeLabelIds: z.array(z.string()).optional(),
        forward: z.string().optional(),
    }),
});

const ListFiltersSchema = AccountBaseSchema.extend({});

const GetFilterSchema = AccountBaseSchema.extend({
    filterId: z.string(),
});

const DeleteFilterSchema = AccountBaseSchema.extend({
    filterId: z.string(),
});

const CreateFilterFromTemplateSchema = AccountBaseSchema.extend({
    template: z.enum(['fromSender', 'withSubject', 'withAttachments', 'largeEmails', 'containingText', 'mailingList']),
    parameters: z.object({
        senderEmail: z.string().optional(),
        subjectText: z.string().optional(),
        searchText: z.string().optional(),
        listIdentifier: z.string().optional(),
        sizeInBytes: z.number().optional(),
        labelIds: z.array(z.string()).optional(),
        archive: z.boolean().optional(),
        markAsRead: z.boolean().optional(),
        markImportant: z.boolean().optional(),
    }),
});

const DownloadAttachmentSchema = AccountBaseSchema.extend({
    messageId: z.string(),
    attachmentId: z.string(),
    filename: z.string().optional(),
    savePath: z.string().optional(),
});

const ListAccountsSchema = z.object({});
const SwitchAccountSchema = z.object({ account: z.string() });
const GetActiveAccountSchema = z.object({});
const RemoveAccountSchema = z.object({ account: z.string() });
const SetAccountAliasSchema = z.object({ account: z.string(), alias: z.string() });

// =============================================================================
// MCP Response Helpers
// =============================================================================

function mcpText(text: string) {
    return { content: [{ type: "text" as const, text }] };
}

function mcpError(message: string) {
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

// =============================================================================
// Initialization
// =============================================================================

async function initializeAccountManager() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    const localOAuthPath = path.join(process.cwd(), 'gcp-oauth.keys.json');
    if (fs.existsSync(localOAuthPath)) {
        fs.copyFileSync(localOAuthPath, OAUTH_PATH);
        console.log('OAuth keys found in current directory, copied to global config.');
    }

    if (!fs.existsSync(OAUTH_PATH)) {
        console.error('Error: OAuth keys file not found. Please place gcp-oauth.keys.json in current directory or', CONFIG_DIR);
        process.exit(1);
    }

    accountManager = new AccountManager();
    await accountManager.initializeOAuth2Config(OAUTH_PATH);

    // Initialize services
    emailService = new EmailService(accountManager);
    threadService = new ThreadService(accountManager);
    batchService = new BatchService(accountManager);
    gmailService = new GmailService(accountManager);
}

async function authenticateAccount(alias?: string) {
    const server = http.createServer();
    server.listen(3000);

    return new Promise<string>((resolve, reject) => {
        const oauth2Client = accountManager.createAuthClient();
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: [
                'https://www.googleapis.com/auth/gmail.modify',
                'https://www.googleapis.com/auth/gmail.settings.basic'
            ],
        });

        console.log(`\nAuthenticating new account${alias ? ` (alias: ${alias})` : ''}...`);
        console.log('Please visit this URL to authenticate:', authUrl);
        open(authUrl);

        server.on('request', async (req, res) => {
            if (!req.url?.startsWith('/oauth2callback')) return;

            const url = new URL(req.url, 'http://localhost:3000');
            const code = url.searchParams.get('code');

            if (!code) {
                res.writeHead(400);
                res.end('No code provided');
                reject(new Error('No code provided'));
                return;
            }

            try {
                const { tokens } = await oauth2Client.getToken(code);
                const actualEmail = await accountManager.completeAuthentication(oauth2Client, tokens, alias);

                res.writeHead(200);
                res.end(`Authentication successful for ${actualEmail}! You can close this window.`);
                server.close();

                console.log(`\n✓ Account authenticated: ${actualEmail}${alias ? ` (alias: ${alias})` : ''}`);
                resolve(actualEmail);
            } catch (error) {
                res.writeHead(500);
                res.end('Authentication failed');
                reject(error);
            }
        });
    });
}

// =============================================================================
// Main
// =============================================================================

async function main() {
    await initializeAccountManager();

    // Handle CLI auth command
    if (process.argv[2] === 'auth') {
        const alias = process.argv[3] || undefined;
        await authenticateAccount(alias);

        const accounts = accountManager.listAccounts();
        console.log('\nAuthenticated accounts:');
        accounts.forEach((acc, idx) => {
            console.log(`  ${idx + 1}. ${acc.email}${acc.alias ? ` (${acc.alias})` : ''}`);
        });
        process.exit(0);
    }

    // MCP Server
    const server = new Server({
        name: "gmail",
        version: "1.0.0",
        capabilities: { tools: {} },
    });

    // Tool definitions
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
            { name: "send_email", description: "Sends a new email", inputSchema: schemas.SendEmailSchema },
            { name: "draft_email", description: "Creates a draft email", inputSchema: schemas.SendEmailSchema },
            { name: "read_email", description: "Retrieves the content of a specific email", inputSchema: schemas.ReadEmailSchema },
            { name: "search_emails", description: "Searches for emails using Gmail search syntax", inputSchema: schemas.SearchEmailsSchema },
            { name: "modify_email", description: "Modifies email labels", inputSchema: schemas.ModifyEmailSchema },
            { name: "delete_email", description: "Permanently deletes an email", inputSchema: schemas.DeleteEmailSchema },
            { name: "list_email_labels", description: "Retrieves all available Gmail labels", inputSchema: schemas.ListEmailLabelsSchema },
            { name: "batch_modify_emails", description: "Modifies labels for multiple emails in batches", inputSchema: schemas.BatchModifyEmailsSchema },
            { name: "batch_delete_emails", description: "Permanently deletes multiple emails in batches", inputSchema: schemas.BatchDeleteEmailsSchema },
            { name: "read_thread", description: "Retrieves all messages in an email thread", inputSchema: schemas.ReadThreadSchema },
            { name: "modify_thread", description: "Modifies labels for an entire email thread", inputSchema: schemas.ModifyThreadSchema },
            { name: "batch_modify_threads", description: "Modifies labels for multiple email threads in batches", inputSchema: schemas.BatchModifyThreadsSchema },
            { name: "create_label", description: "Creates a new Gmail label", inputSchema: schemas.CreateLabelSchema },
            { name: "update_label", description: "Updates an existing Gmail label", inputSchema: schemas.UpdateLabelSchema },
            { name: "delete_label", description: "Deletes a Gmail label", inputSchema: schemas.DeleteLabelSchema },
            { name: "get_or_create_label", description: "Gets an existing label by name or creates it", inputSchema: schemas.GetOrCreateLabelSchema },
            { name: "create_filter", description: "Creates a new Gmail filter", inputSchema: schemas.CreateFilterSchema },
            { name: "list_filters", description: "Retrieves all Gmail filters", inputSchema: schemas.ListFiltersSchema },
            { name: "get_filter", description: "Gets details of a specific Gmail filter", inputSchema: schemas.GetFilterSchema },
            { name: "delete_filter", description: "Deletes a Gmail filter", inputSchema: schemas.DeleteFilterSchema },
            { name: "create_filter_from_template", description: "Creates a filter using a pre-defined template", inputSchema: schemas.CreateFilterFromTemplateSchema },
            { name: "download_attachment", description: "Downloads an email attachment", inputSchema: schemas.DownloadAttachmentSchema },
            { name: "list_accounts", description: "Lists all authenticated Gmail accounts", inputSchema: schemas.ListAccountsSchema },
            { name: "switch_account", description: "Switches the active Gmail account", inputSchema: schemas.SwitchAccountSchema },
            { name: "get_active_account", description: "Gets the currently active Gmail account", inputSchema: schemas.GetActiveAccountSchema },
            { name: "remove_account", description: "Removes a Gmail account", inputSchema: schemas.RemoveAccountSchema },
            { name: "set_account_alias", description: "Sets an alias for a Gmail account", inputSchema: schemas.SetAccountAliasSchema },
        ],
    }));

    // Tool handlers
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            switch (name) {
                // =============================================================
                // Email Operations (via EmailService)
                // =============================================================
                case "send_email": {
                    const v = SendEmailSchema.parse(args);
                    const result = await emailService.send({
                        to: v.to,
                        subject: v.subject,
                        body: v.body,
                        htmlBody: v.htmlBody,
                        mimeType: v.mimeType,
                        from: v.from,
                        cc: v.cc,
                        bcc: v.bcc,
                        threadId: v.threadId,
                        inReplyTo: v.inReplyTo,
                        attachments: v.attachments,
                    }, { account: v.account });
                    return mcpText(`Email sent successfully with ID: ${result.id}`);
                }

                case "draft_email": {
                    const v = SendEmailSchema.parse(args);
                    const result = await emailService.draft({
                        to: v.to,
                        subject: v.subject,
                        body: v.body,
                        htmlBody: v.htmlBody,
                        mimeType: v.mimeType,
                        from: v.from,
                        cc: v.cc,
                        bcc: v.bcc,
                        threadId: v.threadId,
                        inReplyTo: v.inReplyTo,
                        attachments: v.attachments,
                    }, { account: v.account });
                    return mcpText(`Email draft created successfully with ID: ${result.id}`);
                }

                case "read_email": {
                    const v = ReadEmailSchema.parse(args);
                    const email = await emailService.read(v.messageId, { account: v.account });

                    const contentTypeNote = email.isHtmlOnly
                        ? '[Note: This email is HTML-formatted. Plain text version not available.]\n\n'
                        : '';

                    const attachmentInfo = email.attachments.length > 0
                        ? `\n\nAttachments (${email.attachments.length}):\n` +
                          email.attachments.map(a => `- ${a.filename} (${a.mimeType}, ${Math.round(a.size/1024)} KB, ID: ${a.id})`).join('\n')
                        : '';

                    return mcpText(
                        `Thread ID: ${email.threadId}\n` +
                        `Message-ID: ${email.messageId}\n` +
                        `Subject: ${email.subject}\n` +
                        `From: ${email.from}\n` +
                        `To: ${email.to}\n` +
                        `Date: ${email.date}\n\n` +
                        `${contentTypeNote}${email.body.text || email.body.html || ''}${attachmentInfo}`
                    );
                }

                case "search_emails": {
                    const v = SearchEmailsSchema.parse(args);
                    const results = await emailService.search(
                        { query: v.query, maxResults: v.maxResults },
                        { account: v.account }
                    );

                    return mcpText(
                        results.map(r =>
                            `ID: ${r.id}\nSubject: ${r.subject}\nFrom: ${r.from}\nDate: ${r.date}\n`
                        ).join('\n')
                    );
                }

                case "modify_email": {
                    const v = ModifyEmailSchema.parse(args);
                    await emailService.modify(v.messageId, {
                        addLabelIds: v.addLabelIds || v.labelIds,
                        removeLabelIds: v.removeLabelIds,
                    }, { account: v.account });
                    return mcpText(`Email ${v.messageId} labels updated successfully`);
                }

                case "delete_email": {
                    const v = DeleteEmailSchema.parse(args);
                    await emailService.delete(v.messageId, { account: v.account });
                    return mcpText(`Email ${v.messageId} deleted successfully`);
                }

                // =============================================================
                // Thread Operations (via ThreadService)
                // =============================================================
                case "read_thread": {
                    const v = ReadThreadSchema.parse(args);
                    const thread = await threadService.read({
                        threadId: v.threadId,
                        maxMessages: v.maxMessages,
                        offset: v.offset,
                    }, { account: v.account });

                    const offset = v.offset || 0;
                    const startIdx = offset + 1;
                    const endIdx = offset + thread.messages.length;
                    const showingInfo = thread.totalMessages > thread.messages.length
                        ? `Showing: ${startIdx}-${endIdx} of ${thread.totalMessages} (use offset/maxMessages to see more)`
                        : `Showing: all ${thread.totalMessages} messages`;

                    const formattedMessages = thread.messages.map((msg, idx) => {
                        const contentTypeNote = msg.isHtmlOnly ? '[Note: HTML-formatted email]\n\n' : '';
                        const attachmentInfo = msg.attachments.length > 0
                            ? `\n\nAttachments (${msg.attachments.length}):\n` +
                              msg.attachments.map(a => `- ${a.filename} (${a.mimeType}, ${Math.round(a.size/1024)} KB, ID: ${a.id})`).join('\n')
                            : '';

                        const messageNum = offset + idx + 1;
                        return `--- Message ${messageNum} of ${thread.totalMessages} ---\n` +
                            `Message ID: ${msg.id}\nFrom: ${msg.from}\nTo: ${msg.to}\nDate: ${msg.date}\n` +
                            `Message-ID: ${msg.messageId}\n\n${contentTypeNote}${msg.body.text || msg.body.html || ''}${attachmentInfo}`;
                    });

                    return mcpText(
                        `Thread ID: ${thread.id}\nSubject: ${thread.subject}\n` +
                        `Total Messages: ${thread.totalMessages}\n${showingInfo}\n\n${formattedMessages.join('\n\n')}`
                    );
                }

                case "modify_thread": {
                    const v = ModifyThreadSchema.parse(args);
                    const result = await threadService.modify(v.threadId, {
                        addLabelIds: v.addLabelIds,
                        removeLabelIds: v.removeLabelIds,
                    }, { account: v.account });
                    return mcpText(`Thread ${v.threadId} modified successfully (${result.messageCount || 0} messages in thread)`);
                }

                // =============================================================
                // Batch Operations (via BatchService)
                // =============================================================
                case "batch_modify_emails": {
                    const v = BatchModifyEmailsSchema.parse(args);
                    const result = await batchService.modifyEmails(v.messageIds, {
                        addLabelIds: v.addLabelIds,
                        removeLabelIds: v.removeLabelIds,
                    }, { account: v.account, batchSize: v.batchSize });

                    let text = `Batch label modification complete.\nSuccessfully processed: ${result.successCount} messages\n`;
                    if (result.failureCount > 0) {
                        text += `Failed to process: ${result.failureCount} messages\n\nFailed message IDs:\n`;
                        text += result.failures.map(f => `- ${f.item.substring(0, 16)}... (${f.error})`).join('\n');
                    }
                    return mcpText(text);
                }

                case "batch_delete_emails": {
                    const v = BatchDeleteEmailsSchema.parse(args);
                    const result = await batchService.deleteEmails(v.messageIds, {
                        account: v.account,
                        batchSize: v.batchSize,
                    });

                    let text = `Batch delete operation complete.\nSuccessfully deleted: ${result.successCount} messages\n`;
                    if (result.failureCount > 0) {
                        text += `Failed to delete: ${result.failureCount} messages\n\nFailed message IDs:\n`;
                        text += result.failures.map(f => `- ${f.item.substring(0, 16)}... (${f.error})`).join('\n');
                    }
                    return mcpText(text);
                }

                case "batch_modify_threads": {
                    const v = BatchModifyThreadsSchema.parse(args);
                    const result = await batchService.modifyThreads(v.threadIds, {
                        addLabelIds: v.addLabelIds,
                        removeLabelIds: v.removeLabelIds,
                    }, { account: v.account, batchSize: v.batchSize });

                    let text = `Batch thread modification complete.\nSuccessfully processed: ${result.successCount} threads (${result.totalMessages || 0} total messages)\n`;
                    if (result.failureCount > 0) {
                        text += `Failed to process: ${result.failureCount} threads\n\nFailed thread IDs:\n`;
                        text += result.failures.map(f => `- ${f.item.substring(0, 16)}... (${f.error})`).join('\n');
                    }
                    return mcpText(text);
                }

                // =============================================================
                // Label Management (via label-manager.ts)
                // =============================================================
                case "list_email_labels": {
                    const v = ListEmailLabelsSchema.parse(args);
                    const gmail = await gmailService.getGmail(v.account);
                    const labelResults = await listLabels(gmail);

                    return mcpText(
                        `Found ${labelResults.count.total} labels (${labelResults.count.system} system, ${labelResults.count.user} user):\n\n` +
                        "System Labels:\n" +
                        labelResults.system.map((l: GmailLabel) => `ID: ${l.id}\nName: ${l.name}\n`).join('\n') +
                        "\nUser Labels:\n" +
                        labelResults.user.map((l: GmailLabel) => `ID: ${l.id}\nName: ${l.name}\n`).join('\n')
                    );
                }

                case "create_label": {
                    const v = CreateLabelSchema.parse(args);
                    const gmail = await gmailService.getGmail(v.account);
                    const result = await createLabel(gmail, v.name, {
                        messageListVisibility: v.messageListVisibility,
                        labelListVisibility: v.labelListVisibility,
                    });
                    return mcpText(`Label created successfully:\nID: ${result.id}\nName: ${result.name}\nType: ${result.type}`);
                }

                case "update_label": {
                    const v = UpdateLabelSchema.parse(args);
                    const gmail = await gmailService.getGmail(v.account);
                    const updates: any = {};
                    if (v.name) updates.name = v.name;
                    if (v.messageListVisibility) updates.messageListVisibility = v.messageListVisibility;
                    if (v.labelListVisibility) updates.labelListVisibility = v.labelListVisibility;
                    const result = await updateLabel(gmail, v.id, updates);
                    return mcpText(`Label updated successfully:\nID: ${result.id}\nName: ${result.name}\nType: ${result.type}`);
                }

                case "delete_label": {
                    const v = DeleteLabelSchema.parse(args);
                    const gmail = await gmailService.getGmail(v.account);
                    const result = await deleteLabel(gmail, v.id);
                    return mcpText(result.message);
                }

                case "get_or_create_label": {
                    const v = GetOrCreateLabelSchema.parse(args);
                    const gmail = await gmailService.getGmail(v.account);
                    const result = await getOrCreateLabel(gmail, v.name, {
                        messageListVisibility: v.messageListVisibility,
                        labelListVisibility: v.labelListVisibility,
                    });
                    const action = result.type === 'user' && result.name === v.name ? 'found existing' : 'created new';
                    return mcpText(`Successfully ${action} label:\nID: ${result.id}\nName: ${result.name}\nType: ${result.type}`);
                }

                // =============================================================
                // Filter Management (via filter-manager.ts)
                // =============================================================
                case "create_filter": {
                    const v = CreateFilterSchema.parse(args);
                    const gmail = await gmailService.getGmail(v.account);
                    const result = await createFilter(gmail, v.criteria, v.action);

                    const criteriaText = Object.entries(v.criteria)
                        .filter(([_, val]) => val !== undefined)
                        .map(([key, val]) => `${key}: ${val}`)
                        .join(', ');
                    const actionText = Object.entries(v.action)
                        .filter(([_, val]) => val !== undefined && (Array.isArray(val) ? val.length > 0 : true))
                        .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(', ') : val}`)
                        .join(', ');

                    return mcpText(`Filter created successfully:\nID: ${result.id}\nCriteria: ${criteriaText}\nActions: ${actionText}`);
                }

                case "list_filters": {
                    const v = ListFiltersSchema.parse(args);
                    const gmail = await gmailService.getGmail(v.account);
                    const result = await listFilters(gmail);

                    if (result.filters.length === 0) {
                        return mcpText("No filters found.");
                    }

                    const filtersText = result.filters.map((filter: any) => {
                        const criteriaEntries = Object.entries(filter.criteria || {})
                            .filter(([_, val]) => val !== undefined)
                            .map(([key, val]) => `${key}: ${val}`)
                            .join(', ');
                        const actionEntries = Object.entries(filter.action || {})
                            .filter(([_, val]) => val !== undefined && (Array.isArray(val) ? val.length > 0 : true))
                            .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(', ') : val}`)
                            .join(', ');
                        return `ID: ${filter.id}\nCriteria: ${criteriaEntries}\nActions: ${actionEntries}\n`;
                    }).join('\n');

                    return mcpText(`Found ${result.count} filters:\n\n${filtersText}`);
                }

                case "get_filter": {
                    const v = GetFilterSchema.parse(args);
                    const gmail = await gmailService.getGmail(v.account);
                    const result = await getFilter(gmail, v.filterId);

                    const criteriaText = Object.entries(result.criteria || {})
                        .filter(([_, val]) => val !== undefined)
                        .map(([key, val]) => `${key}: ${val}`)
                        .join(', ');
                    const actionText = Object.entries(result.action || {})
                        .filter(([_, val]) => val !== undefined && (Array.isArray(val) ? val.length > 0 : true))
                        .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(', ') : val}`)
                        .join(', ');

                    return mcpText(`Filter details:\nID: ${result.id}\nCriteria: ${criteriaText}\nActions: ${actionText}`);
                }

                case "delete_filter": {
                    const v = DeleteFilterSchema.parse(args);
                    const gmail = await gmailService.getGmail(v.account);
                    const result = await deleteFilter(gmail, v.filterId);
                    return mcpText(result.message);
                }

                case "create_filter_from_template": {
                    const v = CreateFilterFromTemplateSchema.parse(args);
                    const gmail = await gmailService.getGmail(v.account);
                    const params = v.parameters;

                    let filterConfig;
                    switch (v.template) {
                        case 'fromSender':
                            if (!params.senderEmail) throw new Error("senderEmail is required for fromSender template");
                            filterConfig = filterTemplates.fromSender(params.senderEmail, params.labelIds, params.archive);
                            break;
                        case 'withSubject':
                            if (!params.subjectText) throw new Error("subjectText is required for withSubject template");
                            filterConfig = filterTemplates.withSubject(params.subjectText, params.labelIds, params.markAsRead);
                            break;
                        case 'withAttachments':
                            filterConfig = filterTemplates.withAttachments(params.labelIds);
                            break;
                        case 'largeEmails':
                            if (!params.sizeInBytes) throw new Error("sizeInBytes is required for largeEmails template");
                            filterConfig = filterTemplates.largeEmails(params.sizeInBytes, params.labelIds);
                            break;
                        case 'containingText':
                            if (!params.searchText) throw new Error("searchText is required for containingText template");
                            filterConfig = filterTemplates.containingText(params.searchText, params.labelIds, params.markImportant);
                            break;
                        case 'mailingList':
                            if (!params.listIdentifier) throw new Error("listIdentifier is required for mailingList template");
                            filterConfig = filterTemplates.mailingList(params.listIdentifier, params.labelIds, params.archive);
                            break;
                        default:
                            throw new Error(`Unknown template: ${v.template}`);
                    }

                    const result = await createFilter(gmail, filterConfig.criteria, filterConfig.action);
                    return mcpText(`Filter created from template '${v.template}':\nID: ${result.id}\nTemplate used: ${v.template}`);
                }

                // =============================================================
                // Attachment Operations (via EmailService)
                // =============================================================
                case "download_attachment": {
                    const v = DownloadAttachmentSchema.parse(args);
                    const result = await emailService.downloadAttachment(v.messageId, v.attachmentId, {
                        account: v.account,
                        filename: v.filename,
                        savePath: v.savePath,
                    });
                    return mcpText(`Attachment downloaded successfully:\nFile: ${result.filename}\nSize: ${result.size} bytes\nSaved to: ${result.path}`);
                }

                // =============================================================
                // Account Management (via AccountManager)
                // =============================================================
                case "list_accounts": {
                    const accounts = accountManager.listAccounts();
                    const activeAccount = await accountManager.getActiveAccount();

                    if (accounts.length === 0) {
                        return mcpText("No accounts authenticated. Use 'gmail account auth [alias]' to add an account.");
                    }

                    const accountsText = accounts.map((acc) => {
                        const isActive = acc.email === activeAccount ? ' [ACTIVE]' : '';
                        const alias = acc.alias ? ` (alias: ${acc.alias})` : '';
                        const lastUsed = acc.lastUsed.toLocaleString();
                        return `• ${acc.email}${alias}${isActive}\n  Last used: ${lastUsed}`;
                    }).join('\n\n');

                    return mcpText(`Authenticated accounts (${accounts.length}):\n\n${accountsText}`);
                }

                case "switch_account": {
                    const v = SwitchAccountSchema.parse(args);
                    await accountManager.setActiveAccount(v.account);
                    const accountInfo = accountManager.getAccountInfo(v.account);
                    return mcpText(`Switched to account: ${accountInfo?.email}${accountInfo?.alias ? ` (${accountInfo.alias})` : ''}`);
                }

                case "get_active_account": {
                    const activeAccount = await accountManager.getActiveAccount();
                    if (!activeAccount) {
                        const accounts = accountManager.listAccounts();
                        if (accounts.length === 0) {
                            return mcpText("No accounts authenticated. Use 'gmail account auth [alias]' to add an account.");
                        }
                        return mcpText(`No active account. Use switch_account to activate one of: ${accounts.map(a => a.alias || a.email).join(', ')}`);
                    }
                    const accountInfo = accountManager.getAccountInfo(activeAccount);
                    return mcpText(`Active account: ${accountInfo?.email}${accountInfo?.alias ? ` (${accountInfo.alias})` : ''}`);
                }

                case "remove_account": {
                    const v = RemoveAccountSchema.parse(args);
                    const accountInfo = accountManager.getAccountInfo(v.account);
                    if (!accountInfo) throw new Error(`Account not found: ${v.account}`);
                    await accountManager.removeAccount(v.account);
                    return mcpText(`Account removed: ${accountInfo.email}${accountInfo.alias ? ` (${accountInfo.alias})` : ''}`);
                }

                case "set_account_alias": {
                    const v = SetAccountAliasSchema.parse(args);
                    await accountManager.setAlias(v.account, v.alias);
                    const accountInfo = accountManager.getAccountInfo(v.alias);
                    return mcpText(`Alias set: ${accountInfo?.email} → ${v.alias}`);
                }

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        } catch (error: any) {
            return mcpError(error.message);
        }
    });

    const transport = new StdioServerTransport();
    server.connect(transport);
}

main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
