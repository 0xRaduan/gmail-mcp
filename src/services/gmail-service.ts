/**
 * Base Gmail service - provides core functionality shared by all services
 */

import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';
import { AccountManager } from '../account-manager.js';
import type { GmailMessagePart, EmailContent, AttachmentInfo, ServiceOptions } from './types.js';

export class GmailService {
    protected accountManager: AccountManager;

    constructor(accountManager: AccountManager) {
        this.accountManager = accountManager;
    }

    /**
     * Get authenticated Gmail client for specified account
     */
    async getGmail(account?: string): Promise<gmail_v1.Gmail> {
        const client = await this.accountManager.getClient(account);
        return google.gmail({ version: 'v1', auth: client });
    }

    /**
     * Recursively extract email body content from MIME message parts
     * Handles complex email structures with nested parts
     */
    extractEmailContent(messagePart: GmailMessagePart): EmailContent {
        let textContent = '';
        let htmlContent = '';

        // If the part has a body with data, process it based on MIME type
        if (messagePart.body && messagePart.body.data) {
            const content = Buffer.from(messagePart.body.data, 'base64').toString('utf8');

            if (messagePart.mimeType === 'text/plain') {
                textContent = content;
            } else if (messagePart.mimeType === 'text/html') {
                htmlContent = content;
            }
        }

        // If the part has nested parts, recursively process them
        if (messagePart.parts && messagePart.parts.length > 0) {
            for (const part of messagePart.parts) {
                const { text, html } = this.extractEmailContent(part);
                if (text) textContent += text;
                if (html) htmlContent += html;
            }
        }

        return { text: textContent, html: htmlContent };
    }

    /**
     * Extract attachment information from message parts
     */
    extractAttachments(messagePart: GmailMessagePart): AttachmentInfo[] {
        const attachments: AttachmentInfo[] = [];

        const processAttachmentParts = (part: GmailMessagePart) => {
            if (part.body && part.body.attachmentId) {
                attachments.push({
                    id: part.body.attachmentId,
                    filename: part.filename || `attachment-${part.body.attachmentId}`,
                    mimeType: part.mimeType || 'application/octet-stream',
                    size: part.body.size || 0
                });
            }

            if (part.parts) {
                part.parts.forEach(subpart => processAttachmentParts(subpart));
            }
        };

        processAttachmentParts(messagePart);
        return attachments;
    }

    /**
     * Get header value from message headers
     */
    getHeader(headers: Array<{ name?: string | null; value?: string | null }> | undefined, name: string): string {
        if (!headers) return '';
        return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
    }

    /**
     * Process operations in batches with fallback to individual processing on failure
     */
    async processBatches<T, U>(
        items: T[],
        batchSize: number,
        processFn: (batch: T[]) => Promise<U[]>
    ): Promise<{ successes: U[]; failures: { item: T; error: Error }[] }> {
        const successes: U[] = [];
        const failures: { item: T; error: Error }[] = [];

        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            try {
                const results = await processFn(batch);
                successes.push(...results);
            } catch (error) {
                // If batch fails, try individual items
                for (const item of batch) {
                    try {
                        const result = await processFn([item]);
                        successes.push(...result);
                    } catch (itemError) {
                        failures.push({ item, error: itemError as Error });
                    }
                }
            }
        }

        return { successes, failures };
    }
}
