/**
 * iCloud IMAP Client Wrapper
 * Wraps imapflow with connection management and helper methods
 */

import { ImapFlow, FetchMessageObject } from 'imapflow';
import { simpleParser, ParsedMail, AddressObject, Attachment } from 'mailparser';
import {
  AccountCredentials,
  ICLOUD_CONFIG,
  EmailMessage,
  EmailSearchResult,
  EmailAddress,
  EmailAttachment,
  FolderInfo,
  EmailSummary,
} from './types.js';

export class ImapClient {
  private client: ImapFlow | null = null;
  private credentials: AccountCredentials;
  private currentMailbox: string | null = null;

  constructor(credentials: AccountCredentials) {
    this.credentials = credentials;
  }

  /**
   * Create and connect IMAP client
   */
  async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    this.client = new ImapFlow({
      host: ICLOUD_CONFIG.imap.host,
      port: ICLOUD_CONFIG.imap.port,
      secure: ICLOUD_CONFIG.imap.secure,
      auth: {
        user: this.credentials.email,
        pass: this.credentials.appPassword,
      },
      logger: console,
    });

    await this.client.connect();
  }

  /**
   * Disconnect IMAP client
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.logout();
      this.client = null;
      this.currentMailbox = null;
    }
  }

  /**
   * Ensure client is connected
   */
  private async ensureConnected(): Promise<ImapFlow> {
    if (!this.client) {
      await this.connect();
    } else {
      // Check if connection is still alive
      try {
        // Try to get the client's usable state
        if (!this.client.usable) {
          console.error('IMAP connection not usable, reconnecting...');
          await this.disconnect();
          await this.connect();
        }
      } catch (error) {
        console.error('Connection check failed, reconnecting...', error);
        await this.disconnect();
        await this.connect();
      }
    }
    return this.client!;
  }

  /**
   * Select a mailbox if not already selected
   */
  private async selectMailbox(mailbox: string): Promise<void> {
    const client = await this.ensureConnected();
    if (this.currentMailbox !== mailbox) {
      await client.mailboxOpen(mailbox);
      this.currentMailbox = mailbox;
    }
  }

  /**
   * List all folders/mailboxes
   */
  async listFolders(): Promise<FolderInfo[]> {
    const client = await this.ensureConnected();
    const folders: FolderInfo[] = [];

    const listResult = client.list() as any;

    const pushFolder = (folder: any) =>
      folders.push({
        path: folder.path,
        name: folder.name,
        delimiter: folder.delimiter,
        specialUse: folder.specialUse,
        flags: folder.flags ? Array.from(folder.flags) : [],
      });

    if (this.isAsyncIterable(listResult)) {
      // Newer imapflow versions return an async generator
      for await (const folder of listResult) {
        pushFolder(folder);
      }
    } else {
      // Older typings return Promise<ListResponse[]>
      const list = await listResult;
      for (const folder of list) {
        pushFolder(folder);
      }
    }

    return folders;
  }

  /**
   * Create a new folder
   */
  async createFolder(path: string): Promise<void> {
    const client = await this.ensureConnected();
    await client.mailboxCreate(path);
  }

  /**
   * Search for emails
   */
  async searchEmails(options: {
    folder?: string;
    from?: string;
    to?: string;
    subject?: string;
    since?: Date;
    before?: Date;
    seen?: boolean;
    flagged?: boolean;
    text?: string;
    maxResults?: number;
  }): Promise<EmailSearchResult[]> {
    const client = await this.ensureConnected();
    const folder = options.folder || 'INBOX';
    await this.selectMailbox(folder);

    // Build IMAP search criteria
    const searchCriteria: any = {};

    if (options.from) searchCriteria.from = options.from;
    if (options.to) searchCriteria.to = options.to;
    if (options.subject) searchCriteria.subject = options.subject;
    if (options.since) searchCriteria.since = options.since;
    if (options.before) searchCriteria.before = options.before;
    if (options.seen !== undefined) {
      searchCriteria.seen = options.seen;
    }
    if (options.flagged !== undefined) {
      searchCriteria.flagged = options.flagged;
    }
    if (options.text) searchCriteria.body = options.text;

    // If no criteria specified, get all
    const hasAnyCriteria = Object.keys(searchCriteria).length > 0;
    const query = hasAnyCriteria ? searchCriteria : { all: true };

    const searchResult = await client.search(query, { uid: true });
    const results: EmailSearchResult[] = [];
    const maxResults = options.maxResults || 50;

    // Handle case where search returns false (no results)
    if (!searchResult || searchResult.length === 0) {
      return results;
    }

    // Sort UIDs in descending order (newest first) and limit
    const sortedUids = (searchResult as number[]).sort((a: number, b: number) => b - a).slice(0, maxResults);

    if (sortedUids.length === 0) {
      return results;
    }

    // Fetch envelope data for matching messages
    // Use try-catch and handle potential connection issues
      try {
        const fetchIterator = client.fetch(
          sortedUids,
          {
            envelope: true,
            flags: true,
            bodyStructure: true,
            // Include UID in the response objects
            uid: true,
          },
          // Use UID mode so the range uses UID numbers returned by search()
          { uid: true }
        );

      for await (const msg of fetchIterator) {
        const envelope = msg.envelope;
        if (!envelope) continue;
        results.push({
          uid: msg.uid.toString(),
          subject: envelope.subject || '(no subject)',
          from: this.parseAddressList(envelope.from),
          to: this.parseAddressList(envelope.to),
          date: envelope.date || new Date(),
          flags: msg.flags ? Array.from(msg.flags) : [],
          hasAttachments: this.hasAttachments(msg.bodyStructure),
        });
      }
    } catch (error: any) {
      // Connection might be stale, invalidate it
      this.currentMailbox = null;
      throw new Error(`Failed to fetch emails: ${error.message}`);
    }

    return results;
  }

  /**
   * Read a single email by UID
   */
  async readEmail(uid: string, folder?: string): Promise<EmailMessage> {
    const client = await this.ensureConnected();
    const mailbox = folder || 'INBOX';
    await this.selectMailbox(mailbox);

    const uidNum = parseInt(uid, 10);

    // Fetch the full message
    const message = await client.fetchOne(
      uidNum,
      {
        source: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
        // Return UID in the response
        uid: true,
      },
      // Treat the provided number as a UID, not a sequence number
      { uid: true }
    );

    if (!message || !message.source) {
      throw new Error(`Message not found: UID ${uid} in ${mailbox}`);
    }

    // Parse the message using mailparser
    const parsed: ParsedMail = await simpleParser(message.source) as ParsedMail;

    // TODO: Consider converting large HTML bodies to a concise markdown/text
    // representation before returning, to reduce MCP response size for
    // marketing-style emails with heavyweight templates.

    return {
      uid: message.uid.toString(),
      messageId: parsed.messageId,
      subject: parsed.subject || '(no subject)',
      from: this.parseMailparserAddresses(parsed.from),
      to: this.parseMailparserAddresses(parsed.to),
      cc: parsed.cc ? this.parseMailparserAddresses(parsed.cc) : undefined,
      date: parsed.date || new Date(),
      body: {
        text: parsed.text,
        html: parsed.html || undefined,
      },
      attachments: this.parseAttachments(parsed, message.bodyStructure),
      flags: message.flags ? Array.from(message.flags) : [],
      folder: mailbox,
      inReplyTo: parsed.inReplyTo,
      references: parsed.references
        ? Array.isArray(parsed.references)
          ? parsed.references
          : [parsed.references]
        : undefined,
    };
  }

  /**
   * Read a lightweight summary of an email by UID
   */
  async readEmailSummary(uid: string, folder?: string, maxBodyChars = 1000): Promise<EmailSummary> {
    const client = await this.ensureConnected();
    const mailbox = folder || 'INBOX';
    await this.selectMailbox(mailbox);

    const uidNum = parseInt(uid, 10);

    // Fetch envelope, flags, body structure, and a bounded portion of the source for snippet
    const message = await client.fetchOne(
      uidNum,
      {
        envelope: true,
        flags: true,
        bodyStructure: true,
        size: true,
        uid: true,
        // Limit downloaded bytes to avoid large payloads
        source: { maxLength: 20000 },
      },
      { uid: true }
    );

    if (!message || !message.envelope) {
      throw new Error(`Message not found: UID ${uid} in ${mailbox}`);
    }

    let snippet: string | undefined;
    let hasAttachments = this.hasAttachments(message.bodyStructure);

    if (message.source) {
      const parsed: ParsedMail = (await simpleParser(message.source)) as ParsedMail;
      const text = parsed.text || parsed.html;
      if (text) {
        snippet = text.replace(/\s+/g, ' ').slice(0, maxBodyChars);
      }
      if (parsed.attachments && parsed.attachments.length > 0) {
        hasAttachments = true;
      }
    }

    return {
      uid: message.uid.toString(),
      subject: message.envelope.subject || '(no subject)',
      from: this.parseAddressList(message.envelope.from),
      to: this.parseAddressList(message.envelope.to),
      cc: this.parseAddressList(message.envelope.cc),
      date: message.envelope.date || new Date(),
      flags: message.flags ? Array.from(message.flags) : [],
      folder: mailbox,
      hasAttachments,
      size: message.size,
      snippet,
    };
  }

  /**
   * Move an email to a different folder
   */
  async moveEmail(uid: string, sourceFolder: string, destinationFolder: string): Promise<void> {
    const client = await this.ensureConnected();
    await this.selectMailbox(sourceFolder);

    const uidNum = parseInt(uid, 10);
    await client.messageMove(uidNum, destinationFolder, { uid: true });

    // Reset current mailbox since move might have changed things
    this.currentMailbox = null;
  }

  /**
   * Move multiple emails to a different folder
   */
  async moveEmails(uids: string[], sourceFolder: string, destinationFolder: string): Promise<void> {
    const client = await this.ensureConnected();
    await this.selectMailbox(sourceFolder);

    if (!uids.length) return;

    const uidNumbers = uids.map((uid) => parseInt(uid, 10)).filter((n) => !Number.isNaN(n));
    if (!uidNumbers.length) {
      throw new Error('No valid UIDs provided');
    }

    await client.messageMove(uidNumbers, destinationFolder, { uid: true });

    // Reset current mailbox since move might have changed things
    this.currentMailbox = null;
  }

  /**
   * Delete an email (move to Trash or permanently delete)
   */
  async deleteEmail(uid: string, folder?: string, permanent?: boolean): Promise<void> {
    const client = await this.ensureConnected();
    const mailbox = folder || 'INBOX';
    await this.selectMailbox(mailbox);

    const uidNum = parseInt(uid, 10);

    if (permanent) {
      // Permanently delete: mark as deleted and expunge
      await client.messageFlagsAdd(uidNum, ['\\Deleted'], { uid: true });
      await client.messageDelete(uidNum, { uid: true });
    } else {
      // Move to Trash
      // iCloud uses "Deleted Messages" as the trash folder
      const folders = await this.listFolders();
      const trashFolder = folders.find(
        (f) => f.specialUse === '\\Trash' || f.path.toLowerCase().includes('trash') || f.path === 'Deleted Messages'
      );

      if (trashFolder) {
        await client.messageMove(uidNum, trashFolder.path, { uid: true });
      } else {
        // Fallback to permanent delete if no trash folder found
        await client.messageFlagsAdd(uidNum, ['\\Deleted'], { uid: true });
        await client.messageDelete(uidNum, { uid: true });
      }
    }

    // Reset current mailbox
    this.currentMailbox = null;
  }

  /**
   * Mark one or more messages as read (adds \Seen flag)
   */
  async markEmailsRead(uids: string[], folder?: string): Promise<void> {
    const client = await this.ensureConnected();
    const mailbox = folder || 'INBOX';
    await this.selectMailbox(mailbox);

    if (!uids.length) return;

    const uidNumbers = uids.map((uid) => parseInt(uid, 10)).filter((n) => !Number.isNaN(n));
    if (!uidNumbers.length) {
      throw new Error('No valid UIDs provided');
    }

    // Add \Seen flag using UID mode so we don't accidentally operate on sequence numbers
    await client.messageFlagsAdd(uidNumbers, ['\\Seen'], { uid: true });
  }

  /**
   * Download an attachment
   */
  async downloadAttachment(
    uid: string,
    partId: string,
    folder?: string
  ): Promise<{ content: Buffer; filename: string; mimeType: string }> {
    const client = await this.ensureConnected();
    const mailbox = folder || 'INBOX';
    await this.selectMailbox(mailbox);

    const uidNum = parseInt(uid, 10);

    // Fetch the specific body part
    const message = await client.fetchOne(
      uidNum,
      {
        source: true,
        // Return UID in the response
        uid: true,
      },
      // Use UID mode for the fetch range
      { uid: true }
    );

    if (!message || !message.source) {
      throw new Error(`Message not found: UID ${uid} in ${mailbox}`);
    }

    // Parse the full message to extract the attachment
    const parsed: ParsedMail = await simpleParser(message.source) as ParsedMail;

    const attachment = parsed.attachments?.find(
      (att: Attachment) => att.contentId === partId || att.filename === partId
    );

    if (!attachment) {
      // Try to find by index
      const index = parseInt(partId, 10);
      const attachmentByIndex = parsed.attachments?.[index];
      if (!attachmentByIndex) {
        throw new Error(`Attachment not found: ${partId}`);
      }
      return {
        content: attachmentByIndex.content,
        filename: attachmentByIndex.filename || `attachment-${index}`,
        mimeType: attachmentByIndex.contentType,
      };
    }

    return {
      content: attachment.content,
      filename: attachment.filename || 'attachment',
      mimeType: attachment.contentType,
    };
  }

  /**
   * Append a message to a folder (used for drafts)
   */
  async appendMessage(folder: string, message: Buffer, flags?: string[]): Promise<string> {
    const client = await this.ensureConnected();

    const result = await client.append(folder, message, flags || ['\\Draft']);

    if (!result || typeof result === 'boolean') {
      return 'unknown';
    }
    return result.uid?.toString() || result.uidValidity?.toString() || 'unknown';
  }

  /**
   * Parse imapflow address list to our EmailAddress format
   */
  private parseAddressList(addresses: any[] | undefined): EmailAddress[] {
    if (!addresses) return [];
    return addresses.map((addr) => ({
      address: addr.address || '',
      name: addr.name,
    }));
  }

  /**
   * Parse mailparser addresses to our EmailAddress format
   */
  private parseMailparserAddresses(addresses: AddressObject | AddressObject[] | undefined): EmailAddress[] {
    if (!addresses) return [];

    const addressArray = Array.isArray(addresses) ? addresses : [addresses];
    const result: EmailAddress[] = [];

    for (const addrObj of addressArray) {
      if (addrObj.value) {
        for (const addr of addrObj.value) {
          result.push({
            address: addr.address || '',
            name: addr.name,
          });
        }
      }
    }

    return result;
  }

  /**
   * Check if message has attachments from body structure
   */
  private hasAttachments(bodyStructure: any): boolean {
    if (!bodyStructure) return false;

    const check = (part: any): boolean => {
      if (part.disposition === 'attachment') return true;
      if (part.childNodes) {
        return part.childNodes.some(check);
      }
      return false;
    };

    return check(bodyStructure);
  }

  /**
   * Parse attachments from parsed mail
   */
  private parseAttachments(parsed: ParsedMail, bodyStructure: any): EmailAttachment[] {
    const attachments: EmailAttachment[] = [];

    if (parsed.attachments) {
      parsed.attachments.forEach((att: Attachment, index: number) => {
        attachments.push({
          partId: att.contentId || index.toString(),
          filename: att.filename || `attachment-${index}`,
          mimeType: att.contentType,
          size: att.size,
        });
      });
    }

    return attachments;
  }

  /**
   * Narrower type guard for async iterables
   */
  private isAsyncIterable<T>(value: any): value is AsyncIterable<T> {
    return value && typeof value[Symbol.asyncIterator] === 'function';
  }
}
