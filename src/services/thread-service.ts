/**
 * Thread service - handles thread-level operations
 */

import { GmailService } from './gmail-service.js';
import type {
    ThreadData,
    EmailData,
    ReadThreadParams,
    ModifyLabelsParams,
    OperationResult,
    GmailMessagePart,
    ServiceOptions,
} from './types.js';

export class ThreadService extends GmailService {
    /**
     * Read a thread with all its messages
     */
    async read(params: ReadThreadParams, options: ServiceOptions = {}): Promise<ThreadData> {
        const gmail = await this.getGmail(options.account);

        const response = await gmail.users.threads.get({
            userId: 'me',
            id: params.threadId,
            format: 'full',
        });

        const allMessages = response.data.messages || [];
        const totalMessages = allMessages.length;

        // Apply pagination
        const offset = params.offset || 0;
        const messages = params.maxMessages
            ? allMessages.slice(offset, offset + params.maxMessages)
            : allMessages.slice(offset);

        // Get thread subject from first message
        const firstMessageHeaders = allMessages[0]?.payload?.headers || [];
        const threadSubject = this.getHeader(firstMessageHeaders, 'subject') || '(no subject)';

        // Process each message
        const processedMessages: EmailData[] = messages.map((msg) => {
            const headers = msg.payload?.headers || [];
            const payload = msg.payload as GmailMessagePart || {};

            const { text, html } = this.extractEmailContent(payload);
            const attachments = this.extractAttachments(payload);

            return {
                id: msg.id || '',
                threadId: msg.threadId || params.threadId,
                messageId: this.getHeader(headers, 'message-id'),
                subject: this.getHeader(headers, 'subject'),
                from: this.getHeader(headers, 'from'),
                to: this.getHeader(headers, 'to'),
                cc: this.getHeader(headers, 'cc') || undefined,
                date: this.getHeader(headers, 'date'),
                snippet: msg.snippet || undefined,
                labelIds: msg.labelIds || undefined,
                body: { text, html },
                attachments,
                isHtmlOnly: !text && !!html,
            };
        });

        return {
            id: params.threadId,
            subject: threadSubject,
            totalMessages,
            messages: processedMessages,
            historyId: response.data.historyId || undefined,
        };
    }

    /**
     * Modify thread labels
     */
    async modify(
        threadId: string,
        labels: ModifyLabelsParams,
        options: ServiceOptions = {}
    ): Promise<OperationResult & { messageCount?: number }> {
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
                message: `[DRY RUN] Would modify thread ${threadId}: ${actions.join('; ')}`,
            };
        }

        const gmail = await this.getGmail(options.account);

        const result = await gmail.users.threads.modify({
            userId: 'me',
            id: threadId,
            requestBody: {
                addLabelIds: labels.addLabelIds,
                removeLabelIds: labels.removeLabelIds,
            },
        });

        const messageCount = result.data.messages?.length || 0;

        return {
            success: true,
            id: threadId,
            message: `Thread modified successfully (${messageCount} messages)`,
            messageCount,
        };
    }
}
