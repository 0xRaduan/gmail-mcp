/**
 * Batch service - handles bulk operations on emails and threads
 */

import { GmailService } from './gmail-service.js';
import type {
    ModifyLabelsParams,
    BatchOperationResult,
    ServiceOptions,
} from './types.js';

export class BatchService extends GmailService {
    /**
     * Batch modify email labels
     */
    async modifyEmails(
        messageIds: string[],
        labels: ModifyLabelsParams,
        options: ServiceOptions & { batchSize?: number } = {}
    ): Promise<BatchOperationResult<string>> {
        const batchSize = options.batchSize || 50;

        if (options.dryRun) {
            const actions: string[] = [];
            if (labels.addLabelIds?.length) {
                actions.push(`add labels: ${labels.addLabelIds.join(', ')}`);
            }
            if (labels.removeLabelIds?.length) {
                actions.push(`remove labels: ${labels.removeLabelIds.join(', ')}`);
            }

            return {
                successes: messageIds.map(id => ({ item: id })),
                failures: [],
                totalProcessed: messageIds.length,
                successCount: messageIds.length,
                failureCount: 0,
            };
        }

        const gmail = await this.getGmail(options.account);

        const { successes, failures } = await this.processBatches(
            messageIds,
            batchSize,
            async (batch) => {
                const results = await Promise.all(
                    batch.map(async (messageId) => {
                        await gmail.users.messages.modify({
                            userId: 'me',
                            id: messageId,
                            requestBody: {
                                addLabelIds: labels.addLabelIds,
                                removeLabelIds: labels.removeLabelIds,
                            },
                        });
                        return { item: messageId, success: true };
                    })
                );
                return results;
            }
        );

        return {
            successes: successes.map(s => ({ item: (s as any).item || s })),
            failures: failures.map(f => ({ item: f.item, error: f.error.message })),
            totalProcessed: messageIds.length,
            successCount: successes.length,
            failureCount: failures.length,
        };
    }

    /**
     * Batch delete emails
     */
    async deleteEmails(
        messageIds: string[],
        options: ServiceOptions & { batchSize?: number } = {}
    ): Promise<BatchOperationResult<string>> {
        const batchSize = options.batchSize || 50;

        if (options.dryRun) {
            return {
                successes: messageIds.map(id => ({ item: id })),
                failures: [],
                totalProcessed: messageIds.length,
                successCount: messageIds.length,
                failureCount: 0,
            };
        }

        const gmail = await this.getGmail(options.account);

        const { successes, failures } = await this.processBatches(
            messageIds,
            batchSize,
            async (batch) => {
                const results = await Promise.all(
                    batch.map(async (messageId) => {
                        await gmail.users.messages.delete({
                            userId: 'me',
                            id: messageId,
                        });
                        return { item: messageId, success: true };
                    })
                );
                return results;
            }
        );

        return {
            successes: successes.map(s => ({ item: (s as any).item || s })),
            failures: failures.map(f => ({ item: f.item, error: f.error.message })),
            totalProcessed: messageIds.length,
            successCount: successes.length,
            failureCount: failures.length,
        };
    }

    /**
     * Batch modify thread labels
     */
    async modifyThreads(
        threadIds: string[],
        labels: ModifyLabelsParams,
        options: ServiceOptions & { batchSize?: number } = {}
    ): Promise<BatchOperationResult<string> & { totalMessages?: number }> {
        const batchSize = options.batchSize || 50;

        if (options.dryRun) {
            const actions: string[] = [];
            if (labels.addLabelIds?.length) {
                actions.push(`add labels: ${labels.addLabelIds.join(', ')}`);
            }
            if (labels.removeLabelIds?.length) {
                actions.push(`remove labels: ${labels.removeLabelIds.join(', ')}`);
            }

            return {
                successes: threadIds.map(id => ({ item: id })),
                failures: [],
                totalProcessed: threadIds.length,
                successCount: threadIds.length,
                failureCount: 0,
            };
        }

        const gmail = await this.getGmail(options.account);
        let totalMessages = 0;

        const { successes, failures } = await this.processBatches(
            threadIds,
            batchSize,
            async (batch) => {
                const results = await Promise.all(
                    batch.map(async (threadId) => {
                        const result = await gmail.users.threads.modify({
                            userId: 'me',
                            id: threadId,
                            requestBody: {
                                addLabelIds: labels.addLabelIds,
                                removeLabelIds: labels.removeLabelIds,
                            },
                        });
                        const messageCount = result.data.messages?.length || 0;
                        totalMessages += messageCount;
                        return { item: threadId, messageCount };
                    })
                );
                return results;
            }
        );

        return {
            successes: successes.map(s => ({ item: (s as any).item || s, result: s })),
            failures: failures.map(f => ({ item: f.item, error: f.error.message })),
            totalProcessed: threadIds.length,
            successCount: successes.length,
            failureCount: failures.length,
            totalMessages,
        };
    }

    /**
     * Archive emails (convenience method - removes INBOX label)
     */
    async archiveEmails(
        messageIds: string[],
        options: ServiceOptions & { batchSize?: number } = {}
    ): Promise<BatchOperationResult<string>> {
        return this.modifyEmails(messageIds, { removeLabelIds: ['INBOX'] }, options);
    }

    /**
     * Archive threads (convenience method - removes INBOX label)
     */
    async archiveThreads(
        threadIds: string[],
        options: ServiceOptions & { batchSize?: number } = {}
    ): Promise<BatchOperationResult<string> & { totalMessages?: number }> {
        return this.modifyThreads(threadIds, { removeLabelIds: ['INBOX'] }, options);
    }

    /**
     * Mark emails as read (removes UNREAD label)
     */
    async markAsRead(
        messageIds: string[],
        options: ServiceOptions & { batchSize?: number } = {}
    ): Promise<BatchOperationResult<string>> {
        return this.modifyEmails(messageIds, { removeLabelIds: ['UNREAD'] }, options);
    }

    /**
     * Mark emails as unread (adds UNREAD label)
     */
    async markAsUnread(
        messageIds: string[],
        options: ServiceOptions & { batchSize?: number } = {}
    ): Promise<BatchOperationResult<string>> {
        return this.modifyEmails(messageIds, { addLabelIds: ['UNREAD'] }, options);
    }

    /**
     * Move emails to trash (adds TRASH label)
     */
    async trashEmails(
        messageIds: string[],
        options: ServiceOptions & { batchSize?: number } = {}
    ): Promise<BatchOperationResult<string>> {
        return this.modifyEmails(messageIds, { addLabelIds: ['TRASH'] }, options);
    }

    /**
     * Star emails (adds STARRED label)
     */
    async starEmails(
        messageIds: string[],
        options: ServiceOptions & { batchSize?: number } = {}
    ): Promise<BatchOperationResult<string>> {
        return this.modifyEmails(messageIds, { addLabelIds: ['STARRED'] }, options);
    }

    /**
     * Unstar emails (removes STARRED label)
     */
    async unstarEmails(
        messageIds: string[],
        options: ServiceOptions & { batchSize?: number } = {}
    ): Promise<BatchOperationResult<string>> {
        return this.modifyEmails(messageIds, { removeLabelIds: ['STARRED'] }, options);
    }
}
