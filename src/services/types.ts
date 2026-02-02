/**
 * Shared types for Gmail services
 */

import type { gmail_v1 } from 'googleapis';

// Re-export Gmail type for convenience
export type GmailClient = gmail_v1.Gmail;

/**
 * Gmail message part structure (MIME)
 */
export interface GmailMessagePart {
    partId?: string;
    mimeType?: string;
    filename?: string;
    headers?: Array<{
        name: string;
        value: string;
    }>;
    body?: {
        attachmentId?: string;
        size?: number;
        data?: string;
    };
    parts?: GmailMessagePart[];
}

/**
 * Email attachment information
 */
export interface AttachmentInfo {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
}

/**
 * Extracted email content
 */
export interface EmailContent {
    text: string;
    html: string;
}

/**
 * Full email data structure
 */
export interface EmailData {
    id: string;
    threadId: string;
    messageId: string;
    subject: string;
    from: string;
    to: string;
    cc?: string;
    bcc?: string;
    date: string;
    snippet?: string;
    labelIds?: string[];
    body: EmailContent;
    attachments: AttachmentInfo[];
    isHtmlOnly: boolean;
}

/**
 * Search result (lighter than full EmailData)
 */
export interface SearchResult {
    id: string;
    threadId: string;
    subject: string;
    from: string;
    date: string;
    snippet?: string;
}

/**
 * Thread data structure
 */
export interface ThreadData {
    id: string;
    subject: string;
    totalMessages: number;
    messages: EmailData[];
    historyId?: string;
}

/**
 * Operation result for mutations
 */
export interface OperationResult {
    success: boolean;
    id?: string;
    message?: string;
    error?: string;
}

/**
 * Batch operation result
 */
export interface BatchOperationResult<T = string> {
    successes: Array<{ item: T; result?: any }>;
    failures: Array<{ item: T; error: string }>;
    totalProcessed: number;
    successCount: number;
    failureCount: number;
}

/**
 * Send email parameters
 */
export interface SendEmailParams {
    to: string[];
    subject: string;
    body: string;
    htmlBody?: string;
    mimeType?: 'text/plain' | 'text/html' | 'multipart/alternative';
    from?: string;
    cc?: string[];
    bcc?: string[];
    threadId?: string;
    inReplyTo?: string;
    attachments?: string[];
}

/**
 * Search parameters
 */
export interface SearchParams {
    query: string;
    maxResults?: number;
}

/**
 * Modify labels parameters
 */
export interface ModifyLabelsParams {
    addLabelIds?: string[];
    removeLabelIds?: string[];
}

/**
 * Thread read parameters
 */
export interface ReadThreadParams {
    threadId: string;
    maxMessages?: number;
    offset?: number;
}

/**
 * Dry-run result for preview mode
 */
export interface DryRunResult<T> {
    wouldExecute: boolean;
    description: string;
    affectedItems: T[];
    previewData?: any;
}

/**
 * Service options
 */
export interface ServiceOptions {
    dryRun?: boolean;
    account?: string;
}

/**
 * Gmail label (from label-manager)
 */
export interface GmailLabel {
    id: string;
    name: string;
    type: 'system' | 'user';
    messageListVisibility?: string;
    labelListVisibility?: string;
    messagesTotal?: number;
    messagesUnread?: number;
    threadsTotal?: number;
    threadsUnread?: number;
}

/**
 * Filter criteria
 */
export interface FilterCriteria {
    from?: string;
    to?: string;
    subject?: string;
    query?: string;
    negatedQuery?: string;
    hasAttachment?: boolean;
    excludeChats?: boolean;
    size?: number;
    sizeComparison?: 'unspecified' | 'smaller' | 'larger';
}

/**
 * Filter action
 */
export interface FilterAction {
    addLabelIds?: string[];
    removeLabelIds?: string[];
    forward?: string;
}

/**
 * Gmail filter
 */
export interface GmailFilter {
    id: string;
    criteria: FilterCriteria;
    action: FilterAction;
}
