/**
 * iCloud Mail MCP Types
 */

// iCloud IMAP/SMTP server configuration
export const ICLOUD_CONFIG = {
  imap: {
    host: 'imap.mail.me.com',
    port: 993,
    secure: true,
  },
  smtp: {
    host: 'smtp.mail.me.com',
    port: 587,
    secure: false, // Uses STARTTLS
    requireTLS: true,
  },
  supportedDomains: ['@icloud.com', '@me.com', '@mac.com'],
} as const;

// Account management types
export interface AccountCredentials {
  email: string;
  appPassword: string;
}

export interface AccountInfo {
  email: string;
  alias?: string;
  credentialsPath: string;
  lastUsed: Date;
}

export interface AccountRegistry {
  [email: string]: AccountInfo;
}

// Email types
export interface EmailAddress {
  address: string;
  name?: string;
}

export interface EmailAttachment {
  partId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface EmailMessage {
  uid: string;
  messageId?: string;
  subject: string;
  from: EmailAddress[];
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  date: Date;
  body: {
    text?: string;
    html?: string;
  };
  attachments: EmailAttachment[];
  flags: string[];
  folder: string;
  inReplyTo?: string;
  references?: string[];
}

export interface EmailSummary {
  uid: string;
  subject: string;
  from: EmailAddress[];
  to: EmailAddress[];
  cc?: EmailAddress[];
  date: Date;
  flags: string[];
  folder: string;
  hasAttachments: boolean;
  size?: number;
  snippet?: string;
}

export interface EmailSearchResult {
  uid: string;
  subject: string;
  from: EmailAddress[];
  to: EmailAddress[];
  date: Date;
  flags: string[];
  hasAttachments: boolean;
}

// Folder types
export interface FolderInfo {
  path: string;
  name: string;
  delimiter: string;
  specialUse?: string;
  flags: string[];
  exists?: number; // Number of messages
}

// Tool input types
export interface SendEmailInput {
  to: string[];
  subject: string;
  body: string;
  htmlBody?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: string[];
  inReplyTo?: string;
  account?: string;
}

export interface SearchEmailsInput {
  query?: string;
  folder?: string;
  from?: string;
  to?: string;
  subject?: string;
  since?: string;
  before?: string;
  seen?: boolean;
  flagged?: boolean;
  maxResults?: number;
  account?: string;
}

export interface ReadEmailInput {
  uid: string;
  folder?: string;
  account?: string;
}

export interface MoveEmailInput {
  uid: string;
  sourceFolder: string;
  destinationFolder: string;
  account?: string;
}

export interface MoveEmailsInput {
  uids: string[];
  sourceFolder: string;
  destinationFolder: string;
  account?: string;
}

export interface DeleteEmailInput {
  uid: string;
  folder?: string;
  permanent?: boolean;
  account?: string;
}

export interface ReadEmailSummaryInput {
  uid: string;
  folder?: string;
  maxBodyChars?: number;
  account?: string;
}

export interface MarkEmailsReadInput {
  uids: string[];
  folder?: string;
  account?: string;
}

export interface DownloadAttachmentInput {
  uid: string;
  folder?: string;
  partId: string;
  savePath?: string;
  filename?: string;
  account?: string;
}

export interface DraftEmailInput {
  to: string[];
  subject: string;
  body: string;
  htmlBody?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: string[];
  account?: string;
}

export interface CreateFolderInput {
  path: string;
  account?: string;
}

export interface ListFoldersInput {
  account?: string;
}

// Account tool input types
export interface SwitchAccountInput {
  account: string;
}

export interface SetAccountAliasInput {
  account: string;
  alias: string;
}
