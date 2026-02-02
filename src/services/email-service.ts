/**
 * Email service - handles individual email operations
 */

import { GmailService } from './gmail-service.js';
import { createEmailMessage, createEmailWithNodemailer } from '../utl.js';
import type {
    EmailData,
    SearchResult,
    SendEmailParams,
    SearchParams,
    ModifyLabelsParams,
    OperationResult,
    GmailMessagePart,
    ServiceOptions,
    DryRunResult,
} from './types.js';

export class EmailService extends GmailService {
    /**
     * Read a single email by ID
     */
    async read(messageId: string, options: ServiceOptions = {}): Promise<EmailData> {
        const gmail = await this.getGmail(options.account);

        const response = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full',
        });

        const headers = response.data.payload?.headers || [];
        const payload = response.data.payload as GmailMessagePart || {};

        const { text, html } = this.extractEmailContent(payload);
        const attachments = this.extractAttachments(payload);

        return {
            id: response.data.id || messageId,
            threadId: response.data.threadId || '',
            messageId: this.getHeader(headers, 'message-id'),
            subject: this.getHeader(headers, 'subject'),
            from: this.getHeader(headers, 'from'),
            to: this.getHeader(headers, 'to'),
            cc: this.getHeader(headers, 'cc') || undefined,
            bcc: this.getHeader(headers, 'bcc') || undefined,
            date: this.getHeader(headers, 'date'),
            snippet: response.data.snippet || undefined,
            labelIds: response.data.labelIds || undefined,
            body: { text, html },
            attachments,
            isHtmlOnly: !text && !!html,
        };
    }

    /**
     * Search for emails
     */
    async search(params: SearchParams, options: ServiceOptions = {}): Promise<SearchResult[]> {
        const gmail = await this.getGmail(options.account);

        const response = await gmail.users.messages.list({
            userId: 'me',
            q: params.query,
            maxResults: params.maxResults || 10,
        });

        const messages = response.data.messages || [];

        const results = await Promise.all(
            messages.map(async (msg) => {
                const detail = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id!,
                    format: 'metadata',
                    metadataHeaders: ['Subject', 'From', 'Date'],
                });

                const headers = detail.data.payload?.headers || [];

                return {
                    id: msg.id!,
                    threadId: msg.threadId || '',
                    subject: this.getHeader(headers, 'Subject'),
                    from: this.getHeader(headers, 'From'),
                    date: this.getHeader(headers, 'Date'),
                    snippet: detail.data.snippet || undefined,
                };
            })
        );

        return results;
    }

    /**
     * Send an email
     */
    async send(params: SendEmailParams, options: ServiceOptions = {}): Promise<OperationResult> {
        if (options.dryRun) {
            return {
                success: true,
                message: `[DRY RUN] Would send email to ${params.to.join(', ')} with subject "${params.subject}"`,
            };
        }

        const gmail = await this.getGmail(options.account);
        let message: string;

        // Check if we have attachments
        if (params.attachments && params.attachments.length > 0) {
            message = await createEmailWithNodemailer(params);
        } else {
            message = createEmailMessage(params);
        }

        const encodedMessage = Buffer.from(message).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const result = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedMessage,
                ...(params.threadId && { threadId: params.threadId })
            }
        });

        return {
            success: true,
            id: result.data.id || undefined,
            message: `Email sent successfully`,
        };
    }

    /**
     * Create a draft email
     */
    async draft(params: SendEmailParams, options: ServiceOptions = {}): Promise<OperationResult> {
        if (options.dryRun) {
            return {
                success: true,
                message: `[DRY RUN] Would create draft to ${params.to.join(', ')} with subject "${params.subject}"`,
            };
        }

        const gmail = await this.getGmail(options.account);
        let message: string;

        if (params.attachments && params.attachments.length > 0) {
            message = await createEmailWithNodemailer(params);
        } else {
            message = createEmailMessage(params);
        }

        const encodedMessage = Buffer.from(message).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const result = await gmail.users.drafts.create({
            userId: 'me',
            requestBody: {
                message: {
                    raw: encodedMessage,
                    ...(params.threadId && { threadId: params.threadId })
                },
            },
        });

        return {
            success: true,
            id: result.data.id || undefined,
            message: `Draft created successfully`,
        };
    }

    /**
     * Modify email labels
     */
    async modify(
        messageId: string,
        labels: ModifyLabelsParams,
        options: ServiceOptions = {}
    ): Promise<OperationResult> {
        if (options.dryRun) {
            const actions: string[] = [];
            if (labels.addLabelIds?.length) {
                actions.push(`add labels: ${labels.addLabelIds.join(', ')}`);
            }
            if (labels.removeLabelIds?.length) {
                actions.push(`remove labels: ${labels.removeLabelIds.join(', ')}`);
            }
            return {
                success: true,
                message: `[DRY RUN] Would modify email ${messageId}: ${actions.join('; ')}`,
            };
        }

        const gmail = await this.getGmail(options.account);

        await gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: {
                addLabelIds: labels.addLabelIds,
                removeLabelIds: labels.removeLabelIds,
            },
        });

        return {
            success: true,
            id: messageId,
            message: `Email labels updated successfully`,
        };
    }

    /**
     * Delete an email permanently
     */
    async delete(messageId: string, options: ServiceOptions = {}): Promise<OperationResult> {
        if (options.dryRun) {
            // Fetch email info for preview
            try {
                const email = await this.read(messageId, { account: options.account });
                return {
                    success: true,
                    message: `[DRY RUN] Would delete email "${email.subject}" from ${email.from}`,
                };
            } catch {
                return {
                    success: true,
                    message: `[DRY RUN] Would delete email ${messageId}`,
                };
            }
        }

        const gmail = await this.getGmail(options.account);

        await gmail.users.messages.delete({
            userId: 'me',
            id: messageId,
        });

        return {
            success: true,
            id: messageId,
            message: `Email deleted successfully`,
        };
    }

    /**
     * Download an attachment
     */
    async downloadAttachment(
        messageId: string,
        attachmentId: string,
        options: ServiceOptions & { filename?: string; savePath?: string } = {}
    ): Promise<{ filename: string; size: number; path: string }> {
        const gmail = await this.getGmail(options.account);
        const fs = await import('fs');
        const path = await import('path');

        const attachmentResponse = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: messageId,
            id: attachmentId,
        });

        if (!attachmentResponse.data.data) {
            throw new Error('No attachment data received');
        }

        const buffer = Buffer.from(attachmentResponse.data.data, 'base64url');
        const savePath = options.savePath || process.cwd();
        let filename = options.filename;

        if (!filename) {
            // Get original filename from message
            const messageResponse = await gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full',
            });

            const findAttachment = (part: any): string | null => {
                if (part.body && part.body.attachmentId === attachmentId) {
                    return part.filename || `attachment-${attachmentId}`;
                }
                if (part.parts) {
                    for (const subpart of part.parts) {
                        const found = findAttachment(subpart);
                        if (found) return found;
                    }
                }
                return null;
            };

            filename = findAttachment(messageResponse.data.payload) || `attachment-${attachmentId}`;
        }

        // Ensure save directory exists
        if (!fs.existsSync(savePath)) {
            fs.mkdirSync(savePath, { recursive: true });
        }

        const fullPath = path.join(savePath, filename);
        fs.writeFileSync(fullPath, buffer);

        return {
            filename,
            size: buffer.length,
            path: fullPath,
        };
    }
}
