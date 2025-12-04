#!/usr/bin/env node

/**
 * iCloud Mail MCP Server
 * Provides email operations via IMAP/SMTP for iCloud Mail
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import os from 'os';
// @ts-ignore - nodemailer types are heavy, using any
import nodemailer from 'nodemailer';
import readline from 'readline';
import { AccountManager } from './account-manager.js';
import { ImapClient } from './imap-client.js';
import { ICLOUD_CONFIG, AccountCredentials } from './types.js';

// Configuration paths
const CONFIG_DIR = path.join(os.homedir(), '.icloud-mcp');

// Account manager instance
let accountManager: AccountManager;

// IMAP client cache per account
const imapClients: Map<string, ImapClient> = new Map();

/**
 * Get or create IMAP client for an account
 */
async function getImapClient(account?: string): Promise<ImapClient> {
  const credentials = await accountManager.getCredentials(account);
  const email = credentials.email;

  if (!imapClients.has(email)) {
    const client = new ImapClient(credentials);
    await client.connect();
    imapClients.set(email, client);
  }

  return imapClients.get(email)!;
}

/**
 * Get SMTP transporter for an account
 */
async function getSmtpTransporter(account?: string): Promise<any> {
  const credentials = await accountManager.getCredentials(account);

  return nodemailer.createTransport({
    host: ICLOUD_CONFIG.smtp.host,
    port: ICLOUD_CONFIG.smtp.port,
    secure: ICLOUD_CONFIG.smtp.secure,
    requireTLS: ICLOUD_CONFIG.smtp.requireTLS,
    auth: {
      user: credentials.email,
      pass: credentials.appPassword,
    },
  });
}

/**
 * Initialize account manager
 */
async function initializeAccountManager(): Promise<void> {
  // Create config directory if it doesn't exist
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  accountManager = new AccountManager();
}

/**
 * Interactive authentication flow
 */
async function authenticateAccount(alias?: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  };

  console.log('\n=== iCloud Mail MCP Authentication ===\n');
  console.log('Prerequisites:');
  console.log('1. Two-factor authentication must be enabled on your Apple ID');
  console.log('2. Generate an app-specific password at https://appleid.apple.com');
  console.log('   (Security > App-Specific Passwords > Generate)\n');

  const email = await question('Enter your iCloud email (e.g., user@icloud.com): ');

  // Validate email domain
  const validDomains = ICLOUD_CONFIG.supportedDomains;
  const isValidDomain = validDomains.some((domain) => email.toLowerCase().endsWith(domain));
  if (!isValidDomain) {
    console.error(
      `\nError: Email must end with one of: ${validDomains.join(', ')}`
    );
    rl.close();
    process.exit(1);
  }

  const appPassword = await question('Enter your app-specific password (format: xxxx-xxxx-xxxx-xxxx): ');

  rl.close();

  console.log('\nValidating credentials...');

  const credentials: AccountCredentials = {
    email: email.toLowerCase(),
    appPassword,
  };

  // Validate by attempting IMAP connection
  const isValid = await accountManager.validateCredentials(credentials);

  if (!isValid) {
    console.error('\nError: Authentication failed. Please check your credentials.');
    console.error('Make sure you are using an app-specific password, not your Apple ID password.');
    process.exit(1);
  }

  // Save credentials
  await accountManager.addAccount(credentials, alias);

  console.log(`\n✓ Account authenticated: ${credentials.email}${alias ? ` (alias: ${alias})` : ''}`);

  return credentials.email;
}

// =============================================================================
// Schema Definitions
// =============================================================================

// Base schema with optional account parameter
const AccountBaseSchema = z.object({
  account: z
    .string()
    .optional()
    .describe(
      'Email address or alias of the iCloud account to use. If not specified, uses the active account.'
    ),
});

// Email Operations
const SendEmailSchema = AccountBaseSchema.extend({
  to: z.array(z.string()).describe('List of recipient email addresses'),
  subject: z.string().describe('Email subject'),
  body: z.string().describe('Email body content (plain text)'),
  htmlBody: z.string().optional().describe('HTML version of the email body'),
  cc: z.array(z.string()).optional().describe('List of CC recipients'),
  bcc: z.array(z.string()).optional().describe('List of BCC recipients'),
  attachments: z.array(z.string()).optional().describe('List of file paths to attach'),
  inReplyTo: z.string().optional().describe('Message-ID of the email being replied to'),
});

const DraftEmailSchema = AccountBaseSchema.extend({
  to: z.array(z.string()).describe('List of recipient email addresses'),
  subject: z.string().describe('Email subject'),
  body: z.string().describe('Email body content (plain text)'),
  htmlBody: z.string().optional().describe('HTML version of the email body'),
  cc: z.array(z.string()).optional().describe('List of CC recipients'),
  bcc: z.array(z.string()).optional().describe('List of BCC recipients'),
});

const ReadEmailSchema = AccountBaseSchema.extend({
  uid: z.string().describe('UID of the email message to retrieve'),
  folder: z.string().optional().default('INBOX').describe('Folder containing the email'),
});

const SearchEmailsSchema = AccountBaseSchema.extend({
  folder: z.string().optional().default('INBOX').describe('Folder to search in'),
  from: z.string().optional().describe('Filter by sender email or name'),
  to: z.string().optional().describe('Filter by recipient'),
  subject: z.string().optional().describe('Filter by subject text'),
  since: z.string().optional().describe('Emails since date (YYYY-MM-DD)'),
  before: z.string().optional().describe('Emails before date (YYYY-MM-DD)'),
  seen: z.boolean().optional().describe('Filter by read/unread status'),
  flagged: z.boolean().optional().describe('Filter by flagged/starred status'),
  text: z.string().optional().describe('Search in email body'),
  maxResults: z.number().optional().default(50).describe('Maximum results to return'),
});

const MoveEmailSchema = AccountBaseSchema.extend({
  uid: z.string().describe('UID of the email to move'),
  sourceFolder: z.string().describe('Current folder of the email'),
  destinationFolder: z.string().describe('Destination folder'),
});

const MoveEmailsSchema = AccountBaseSchema.extend({
  uids: z.array(z.string()).min(1).describe('List of email UIDs to move'),
  sourceFolder: z.string().describe('Current folder of the emails'),
  destinationFolder: z.string().describe('Destination folder'),
});

const DeleteEmailSchema = AccountBaseSchema.extend({
  uid: z.string().describe('UID of the email to delete'),
  folder: z.string().optional().default('INBOX').describe('Folder containing the email'),
  permanent: z
    .boolean()
    .optional()
    .default(false)
    .describe('If true, permanently delete. If false, move to Trash.'),
});

const DownloadAttachmentSchema = AccountBaseSchema.extend({
  uid: z.string().describe('UID of the email containing the attachment'),
  folder: z.string().optional().default('INBOX').describe('Folder containing the email'),
  partId: z.string().describe('Part ID or filename of the attachment'),
  savePath: z.string().optional().describe('Directory to save the attachment'),
  filename: z.string().optional().describe('Filename to save as'),
});

const MarkEmailsReadSchema = AccountBaseSchema.extend({
  uids: z.array(z.string()).min(1).describe('List of message UIDs to mark as read'),
  folder: z.string().optional().default('INBOX').describe('Folder containing the messages'),
});

// Folder Operations
const ListFoldersSchema = AccountBaseSchema.extend({});

const CreateFolderSchema = AccountBaseSchema.extend({
  path: z.string().describe('Path of the folder to create (e.g., "Projects/Work")'),
});

// Account Operations
const ListAccountsSchema = z.object({});

const SwitchAccountSchema = z.object({
  account: z.string().describe('Email address or alias of the account to switch to'),
});

const GetActiveAccountSchema = z.object({});

// =============================================================================
// JSON Schemas (plain objects to avoid zodToJsonSchema OOM)
// =============================================================================

const accountProperty = {
  account: {
    type: 'string',
    description: 'Email address or alias of the iCloud account to use. If not specified, uses the active account.',
  },
};

const SendEmailJsonSchema = {
  type: 'object',
  properties: {
    ...accountProperty,
    to: { type: 'array', items: { type: 'string' }, description: 'List of recipient email addresses' },
    subject: { type: 'string', description: 'Email subject' },
    body: { type: 'string', description: 'Email body content (plain text)' },
    htmlBody: { type: 'string', description: 'HTML version of the email body' },
    cc: { type: 'array', items: { type: 'string' }, description: 'List of CC recipients' },
    bcc: { type: 'array', items: { type: 'string' }, description: 'List of BCC recipients' },
    attachments: { type: 'array', items: { type: 'string' }, description: 'List of file paths to attach' },
    inReplyTo: { type: 'string', description: 'Message-ID of the email being replied to' },
  },
  required: ['to', 'subject', 'body'],
};

const DraftEmailJsonSchema = {
  type: 'object',
  properties: {
    ...accountProperty,
    to: { type: 'array', items: { type: 'string' }, description: 'List of recipient email addresses' },
    subject: { type: 'string', description: 'Email subject' },
    body: { type: 'string', description: 'Email body content (plain text)' },
    htmlBody: { type: 'string', description: 'HTML version of the email body' },
    cc: { type: 'array', items: { type: 'string' }, description: 'List of CC recipients' },
    bcc: { type: 'array', items: { type: 'string' }, description: 'List of BCC recipients' },
  },
  required: ['to', 'subject', 'body'],
};

const ReadEmailJsonSchema = {
  type: 'object',
  properties: {
    ...accountProperty,
    uid: { type: 'string', description: 'UID of the email message to retrieve' },
    folder: { type: 'string', default: 'INBOX', description: 'Folder containing the email' },
  },
  required: ['uid'],
};

const SearchEmailsJsonSchema = {
  type: 'object',
  properties: {
    ...accountProperty,
    folder: { type: 'string', default: 'INBOX', description: 'Folder to search in' },
    from: { type: 'string', description: 'Filter by sender email or name' },
    to: { type: 'string', description: 'Filter by recipient' },
    subject: { type: 'string', description: 'Filter by subject text' },
    since: { type: 'string', description: 'Emails since date (YYYY-MM-DD)' },
    before: { type: 'string', description: 'Emails before date (YYYY-MM-DD)' },
    seen: { type: 'boolean', description: 'Filter by read/unread status' },
    flagged: { type: 'boolean', description: 'Filter by flagged/starred status' },
    text: { type: 'string', description: 'Search in email body' },
    maxResults: { type: 'number', default: 50, description: 'Maximum results to return' },
  },
};

const MoveEmailJsonSchema = {
  type: 'object',
  properties: {
    ...accountProperty,
    uid: { type: 'string', description: 'UID of the email to move' },
    sourceFolder: { type: 'string', description: 'Current folder of the email' },
    destinationFolder: { type: 'string', description: 'Destination folder' },
  },
  required: ['uid', 'sourceFolder', 'destinationFolder'],
};

const MoveEmailsJsonSchema = {
  type: 'object',
  properties: {
    ...accountProperty,
    uids: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of email UIDs to move',
    },
    sourceFolder: { type: 'string', description: 'Current folder of the emails' },
    destinationFolder: { type: 'string', description: 'Destination folder' },
  },
  required: ['uids', 'sourceFolder', 'destinationFolder'],
};

const DeleteEmailJsonSchema = {
  type: 'object',
  properties: {
    ...accountProperty,
    uid: { type: 'string', description: 'UID of the email to delete' },
    folder: { type: 'string', default: 'INBOX', description: 'Folder containing the email' },
    permanent: { type: 'boolean', default: false, description: 'If true, permanently delete. If false, move to Trash.' },
  },
  required: ['uid'],
};

const DownloadAttachmentJsonSchema = {
  type: 'object',
  properties: {
    ...accountProperty,
    uid: { type: 'string', description: 'UID of the email containing the attachment' },
    folder: { type: 'string', default: 'INBOX', description: 'Folder containing the email' },
    partId: { type: 'string', description: 'Part ID or filename of the attachment' },
    savePath: { type: 'string', description: 'Directory to save the attachment' },
    filename: { type: 'string', description: 'Filename to save as' },
  },
  required: ['uid', 'partId'],
};

const MarkEmailsReadJsonSchema = {
  type: 'object',
  properties: {
    ...accountProperty,
    uids: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of message UIDs to mark as read',
    },
    folder: {
      type: 'string',
      description: 'Folder containing the messages',
      default: 'INBOX',
    },
  },
  required: ['uids'],
};

const ListFoldersJsonSchema = {
  type: 'object',
  properties: { ...accountProperty },
};

const CreateFolderJsonSchema = {
  type: 'object',
  properties: {
    ...accountProperty,
    path: { type: 'string', description: 'Path of the folder to create (e.g., "Projects/Work")' },
  },
  required: ['path'],
};

const ListAccountsJsonSchema = {
  type: 'object',
  properties: {},
};

const SwitchAccountJsonSchema = {
  type: 'object',
  properties: {
    account: { type: 'string', description: 'Email address or alias of the account to switch to' },
  },
  required: ['account'],
};

const GetActiveAccountJsonSchema = {
  type: 'object',
  properties: {},
};

// =============================================================================
// Main Server
// =============================================================================

async function main() {
  await initializeAccountManager();

  // Handle CLI auth command
  if (process.argv[2] === 'auth') {
    const alias = process.argv[3] || undefined;
    await authenticateAccount(alias);

    // List all accounts
    const accounts = accountManager.listAccounts();
    console.log('\nAuthenticated accounts:');
    accounts.forEach((acc, idx) => {
      console.log(`  ${idx + 1}. ${acc.email}${acc.alias ? ` (${acc.alias})` : ''}`);
    });

    process.exit(0);
  }

  // Create MCP server
  const server = new Server({
    name: 'icloud-mail',
    version: '1.0.0',
    capabilities: {
      tools: {},
    },
  });

  // Register tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      // Email Operations
      {
        name: 'send_email',
        description: 'Sends a new email via iCloud Mail',
        inputSchema: SendEmailJsonSchema,
      },
      {
        name: 'draft_email',
        description: 'Saves an email draft to the Drafts folder',
        inputSchema: DraftEmailJsonSchema,
      },
      {
        name: 'read_email',
        description: 'Retrieves the full content of a specific email by UID',
        inputSchema: ReadEmailJsonSchema,
      },
      {
        name: 'search_emails',
        description: 'Searches for emails in a folder with various filters',
        inputSchema: SearchEmailsJsonSchema,
      },
      {
        name: 'move_email',
        description: 'Moves an email to a different folder',
        inputSchema: MoveEmailJsonSchema,
      },
      {
        name: 'move_emails',
        description: 'Moves multiple emails to a different folder',
        inputSchema: MoveEmailsJsonSchema,
      },
      {
        name: 'delete_email',
        description: 'Deletes an email (moves to Trash or permanently deletes)',
        inputSchema: DeleteEmailJsonSchema,
      },
      {
        name: 'download_attachment',
        description: 'Downloads an email attachment to a specified location',
        inputSchema: DownloadAttachmentJsonSchema,
      },
      {
        name: 'mark_emails_read',
        description: 'Marks one or more emails as read (adds \\Seen flag)',
        inputSchema: MarkEmailsReadJsonSchema,
      },
      // Folder Operations
      {
        name: 'list_folders',
        description: 'Lists all available mailbox folders',
        inputSchema: ListFoldersJsonSchema,
      },
      {
        name: 'create_folder',
        description: 'Creates a new mailbox folder',
        inputSchema: CreateFolderJsonSchema,
      },
      // Account Operations
      {
        name: 'list_accounts',
        description: 'Lists all authenticated iCloud Mail accounts',
        inputSchema: ListAccountsJsonSchema,
      },
      {
        name: 'switch_account',
        description: 'Switches the active iCloud Mail account',
        inputSchema: SwitchAccountJsonSchema,
      },
      {
        name: 'get_active_account',
        description: 'Gets the currently active iCloud Mail account',
        inputSchema: GetActiveAccountJsonSchema,
      },
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        // =================================================================
        // Email Operations
        // =================================================================

        case 'send_email': {
          const validated = SendEmailSchema.parse(args);
          const transporter = await getSmtpTransporter(validated.account);
          const credentials = await accountManager.getCredentials(validated.account);

          // Build attachments array
          const attachments = validated.attachments?.map((filePath) => {
            if (!fs.existsSync(filePath)) {
              throw new Error(`Attachment file not found: ${filePath}`);
            }
            return {
              filename: path.basename(filePath),
              path: filePath,
            };
          });

          const result = await transporter.sendMail({
            from: credentials.email,
            to: validated.to.join(', '),
            cc: validated.cc?.join(', '),
            bcc: validated.bcc?.join(', '),
            subject: validated.subject,
            text: validated.body,
            html: validated.htmlBody,
            attachments,
            inReplyTo: validated.inReplyTo,
            references: validated.inReplyTo ? [validated.inReplyTo] : undefined,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    messageId: result.messageId,
                    from: credentials.email,
                    to: validated.to,
                    subject: validated.subject,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'draft_email': {
          const validated = DraftEmailSchema.parse(args);
          const credentials = await accountManager.getCredentials(validated.account);
          const client = await getImapClient(validated.account);

          // Build draft message using nodemailer
          const transporter = nodemailer.createTransport({
            streamTransport: true,
            newline: 'unix',
            buffer: true,
          });

          const info = await transporter.sendMail({
            from: credentials.email,
            to: validated.to.join(', '),
            cc: validated.cc?.join(', '),
            bcc: validated.bcc?.join(', '),
            subject: validated.subject,
            text: validated.body,
            html: validated.htmlBody,
          });

          // Append to Drafts folder
          const uid = await client.appendMessage('Drafts', info.message as Buffer, ['\\Draft']);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    uid,
                    folder: 'Drafts',
                    subject: validated.subject,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'read_email': {
          const validated = ReadEmailSchema.parse(args);
          const client = await getImapClient(validated.account);

          const email = await client.readEmail(validated.uid, validated.folder);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(email, null, 2),
              },
            ],
          };
        }

        case 'search_emails': {
          const validated = SearchEmailsSchema.parse(args);
          const client = await getImapClient(validated.account);

          const results = await client.searchEmails({
            folder: validated.folder,
            from: validated.from,
            to: validated.to,
            subject: validated.subject,
            since: validated.since ? new Date(validated.since) : undefined,
            before: validated.before ? new Date(validated.before) : undefined,
            seen: validated.seen,
            flagged: validated.flagged,
            text: validated.text,
            maxResults: validated.maxResults,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    folder: validated.folder,
                    count: results.length,
                    results,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'move_email': {
          const validated = MoveEmailSchema.parse(args);
          const client = await getImapClient(validated.account);

          await client.moveEmail(
            validated.uid,
            validated.sourceFolder,
            validated.destinationFolder
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    uid: validated.uid,
                    from: validated.sourceFolder,
                    to: validated.destinationFolder,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'move_emails': {
          const validated = MoveEmailsSchema.parse(args);
          const client = await getImapClient(validated.account);

          await client.moveEmails(
            validated.uids,
            validated.sourceFolder,
            validated.destinationFolder
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    count: validated.uids.length,
                    uids: validated.uids,
                    from: validated.sourceFolder,
                    to: validated.destinationFolder,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'delete_email': {
          const validated = DeleteEmailSchema.parse(args);
          const client = await getImapClient(validated.account);

          await client.deleteEmail(validated.uid, validated.folder, validated.permanent);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    uid: validated.uid,
                    folder: validated.folder,
                    permanent: validated.permanent,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'download_attachment': {
          const validated = DownloadAttachmentSchema.parse(args);
          const client = await getImapClient(validated.account);

          const attachment = await client.downloadAttachment(
            validated.uid,
            validated.partId,
            validated.folder
          );

          // Determine save path
          const savePath = validated.savePath || process.cwd();
          const filename = validated.filename || attachment.filename;
          const fullPath = path.join(savePath, filename);

          // Ensure directory exists
          if (!fs.existsSync(savePath)) {
            fs.mkdirSync(savePath, { recursive: true });
          }

          // Write file
          fs.writeFileSync(fullPath, attachment.content);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    filename,
                    path: fullPath,
                    size: attachment.content.length,
                    mimeType: attachment.mimeType,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'mark_emails_read': {
          const validated = MarkEmailsReadSchema.parse(args);
          const client = await getImapClient(validated.account);

          await client.markEmailsRead(validated.uids, validated.folder);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    folder: validated.folder || 'INBOX',
                    uids: validated.uids,
                    action: 'marked as read',
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // =================================================================
        // Folder Operations
        // =================================================================

        case 'list_folders': {
          const validated = ListFoldersSchema.parse(args);
          const client = await getImapClient(validated.account);

          const folders = await client.listFolders();

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    count: folders.length,
                    folders,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'create_folder': {
          const validated = CreateFolderSchema.parse(args);
          const client = await getImapClient(validated.account);

          await client.createFolder(validated.path);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    path: validated.path,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // =================================================================
        // Account Operations
        // =================================================================

        case 'list_accounts': {
          const accounts = accountManager.listAccounts();

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    count: accounts.length,
                    accounts: accounts.map((acc) => ({
                      email: acc.email,
                      alias: acc.alias,
                      lastUsed: acc.lastUsed,
                    })),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'switch_account': {
          const validated = SwitchAccountSchema.parse(args);

          await accountManager.setActiveAccount(validated.account);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    activeAccount: accountManager.resolveEmailFromAlias(validated.account),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'get_active_account': {
          const activeAccount = await accountManager.getActiveAccount();
          const accountInfo = activeAccount
            ? accountManager.getAccountInfo(activeAccount)
            : null;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    activeAccount,
                    alias: accountInfo?.alias,
                    lastUsed: accountInfo?.lastUsed,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      // Log to stderr for debugging
      console.error('MCP Tool Error:', {
        tool: name,
        error: error.message,
        stack: error.stack,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}\n\nStack: ${error.stack}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run main
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
