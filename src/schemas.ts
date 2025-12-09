// Plain JSON Schema definitions for MCP tools
// This avoids the slow zod-to-json-schema conversion at build time

const accountProperty = {
    account: {
        type: "string",
        description: "Email address or alias of the account to use. If not specified, uses the active account."
    }
};

export const SendEmailSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        to: { type: "array", items: { type: "string" }, description: "List of recipient email addresses" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body content (used for text/plain or when htmlBody not provided)" },
        htmlBody: { type: "string", description: "HTML version of the email body" },
        mimeType: { type: "string", enum: ["text/plain", "text/html", "multipart/alternative"], description: "Email content type" },
        from: { type: "string", description: "Email address to send from (must be a verified alias). If not specified, uses the authenticated user's primary email" },
        cc: { type: "array", items: { type: "string" }, description: "List of CC recipients" },
        bcc: { type: "array", items: { type: "string" }, description: "List of BCC recipients" },
        threadId: { type: "string", description: "Thread ID to reply to" },
        inReplyTo: { type: "string", description: "Message ID being replied to" },
        attachments: { type: "array", items: { type: "string" }, description: "List of file paths to attach to the email" }
    },
    required: ["to", "subject", "body"]
};

export const ReadEmailSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        messageId: { type: "string", description: "ID of the email message to retrieve" }
    },
    required: ["messageId"]
};

export const SearchEmailsSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        query: { type: "string", description: "Gmail search query (e.g., 'from:example@gmail.com')" },
        maxResults: { type: "number", description: "Maximum number of results to return" }
    },
    required: ["query"]
};

export const ModifyEmailSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        messageId: { type: "string", description: "ID of the email message to modify" },
        labelIds: { type: "array", items: { type: "string" }, description: "List of label IDs to apply" },
        addLabelIds: { type: "array", items: { type: "string" }, description: "List of label IDs to add to the message" },
        removeLabelIds: { type: "array", items: { type: "string" }, description: "List of label IDs to remove from the message" }
    },
    required: ["messageId"]
};

export const DeleteEmailSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        messageId: { type: "string", description: "ID of the email message to delete" }
    },
    required: ["messageId"]
};

export const ListEmailLabelsSchema = {
    type: "object",
    properties: {
        ...accountProperty
    }
};

export const CreateLabelSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        name: { type: "string", description: "Name for the new label" },
        messageListVisibility: { type: "string", enum: ["show", "hide"], description: "Whether to show or hide the label in the message list" },
        labelListVisibility: { type: "string", enum: ["labelShow", "labelShowIfUnread", "labelHide"], description: "Visibility of the label in the label list" }
    },
    required: ["name"]
};

export const UpdateLabelSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        id: { type: "string", description: "ID of the label to update" },
        name: { type: "string", description: "New name for the label" },
        messageListVisibility: { type: "string", enum: ["show", "hide"], description: "Whether to show or hide the label in the message list" },
        labelListVisibility: { type: "string", enum: ["labelShow", "labelShowIfUnread", "labelHide"], description: "Visibility of the label in the label list" }
    },
    required: ["id"]
};

export const DeleteLabelSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        id: { type: "string", description: "ID of the label to delete" }
    },
    required: ["id"]
};

export const GetOrCreateLabelSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        name: { type: "string", description: "Name of the label to get or create" },
        messageListVisibility: { type: "string", enum: ["show", "hide"], description: "Whether to show or hide the label in the message list" },
        labelListVisibility: { type: "string", enum: ["labelShow", "labelShowIfUnread", "labelHide"], description: "Visibility of the label in the label list" }
    },
    required: ["name"]
};

export const BatchModifyEmailsSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        messageIds: { type: "array", items: { type: "string" }, description: "List of message IDs to modify" },
        addLabelIds: { type: "array", items: { type: "string" }, description: "List of label IDs to add to all messages" },
        removeLabelIds: { type: "array", items: { type: "string" }, description: "List of label IDs to remove from all messages" },
        batchSize: { type: "number", description: "Number of messages to process in each batch (default: 50)" }
    },
    required: ["messageIds"]
};

export const BatchDeleteEmailsSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        messageIds: { type: "array", items: { type: "string" }, description: "List of message IDs to delete" },
        batchSize: { type: "number", description: "Number of messages to process in each batch (default: 50)" }
    },
    required: ["messageIds"]
};

export const ReadThreadSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        threadId: { type: "string", description: "ID of the thread to read" },
        maxMessages: { type: "number", description: "Maximum number of messages to return (default: all)" },
        offset: { type: "number", description: "Number of messages to skip from the start (default: 0)" }
    },
    required: ["threadId"]
};

export const ModifyThreadSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        threadId: { type: "string", description: "ID of the thread to modify" },
        addLabelIds: { type: "array", items: { type: "string" }, description: "List of label IDs to add to the thread" },
        removeLabelIds: { type: "array", items: { type: "string" }, description: "List of label IDs to remove from the thread" }
    },
    required: ["threadId"]
};

export const BatchModifyThreadsSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        threadIds: { type: "array", items: { type: "string" }, description: "List of thread IDs to modify" },
        addLabelIds: { type: "array", items: { type: "string" }, description: "List of label IDs to add to all threads" },
        removeLabelIds: { type: "array", items: { type: "string" }, description: "List of label IDs to remove from all threads" },
        batchSize: { type: "number", description: "Number of threads to process in each batch (default: 50)" }
    },
    required: ["threadIds"]
};

export const CreateFilterSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        criteria: {
            type: "object",
            properties: {
                from: { type: "string", description: "Sender email address to match" },
                to: { type: "string", description: "Recipient email address to match" },
                subject: { type: "string", description: "Subject text to match" },
                query: { type: "string", description: "Gmail search query (e.g., 'has:attachment')" },
                negatedQuery: { type: "string", description: "Text that must NOT be present" },
                hasAttachment: { type: "boolean", description: "Whether to match emails with attachments" },
                excludeChats: { type: "boolean", description: "Whether to exclude chat messages" },
                size: { type: "number", description: "Email size in bytes" },
                sizeComparison: { type: "string", enum: ["unspecified", "smaller", "larger"], description: "Size comparison operator" }
            },
            description: "Criteria for matching emails"
        },
        action: {
            type: "object",
            properties: {
                addLabelIds: { type: "array", items: { type: "string" }, description: "Label IDs to add to matching emails" },
                removeLabelIds: { type: "array", items: { type: "string" }, description: "Label IDs to remove from matching emails" },
                forward: { type: "string", description: "Email address to forward matching emails to" }
            },
            description: "Actions to perform on matching emails"
        }
    },
    required: ["criteria", "action"]
};

export const ListFiltersSchema = {
    type: "object",
    properties: {
        ...accountProperty
    }
};

export const GetFilterSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        filterId: { type: "string", description: "ID of the filter to retrieve" }
    },
    required: ["filterId"]
};

export const DeleteFilterSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        filterId: { type: "string", description: "ID of the filter to delete" }
    },
    required: ["filterId"]
};

export const CreateFilterFromTemplateSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        template: {
            type: "string",
            enum: ["fromSender", "withSubject", "withAttachments", "largeEmails", "containingText", "mailingList"],
            description: "Pre-defined filter template to use"
        },
        parameters: {
            type: "object",
            properties: {
                senderEmail: { type: "string", description: "Sender email (for fromSender template)" },
                subjectText: { type: "string", description: "Subject text (for withSubject template)" },
                searchText: { type: "string", description: "Text to search for (for containingText template)" },
                listIdentifier: { type: "string", description: "Mailing list identifier (for mailingList template)" },
                sizeInBytes: { type: "number", description: "Size threshold in bytes (for largeEmails template)" },
                labelIds: { type: "array", items: { type: "string" }, description: "Label IDs to apply" },
                archive: { type: "boolean", description: "Whether to archive (skip inbox)" },
                markAsRead: { type: "boolean", description: "Whether to mark as read" },
                markImportant: { type: "boolean", description: "Whether to mark as important" }
            },
            description: "Template-specific parameters"
        }
    },
    required: ["template", "parameters"]
};

export const DownloadAttachmentSchema = {
    type: "object",
    properties: {
        ...accountProperty,
        messageId: { type: "string", description: "ID of the email message containing the attachment" },
        attachmentId: { type: "string", description: "ID of the attachment to download" },
        filename: { type: "string", description: "Filename to save the attachment as (if not provided, uses original filename)" },
        savePath: { type: "string", description: "Directory path to save the attachment (defaults to current directory)" }
    },
    required: ["messageId", "attachmentId"]
};

export const ListAccountsSchema = {
    type: "object",
    properties: {}
};

export const SwitchAccountSchema = {
    type: "object",
    properties: {
        account: { type: "string", description: "Email address or alias of the account to switch to" }
    },
    required: ["account"]
};

export const GetActiveAccountSchema = {
    type: "object",
    properties: {}
};

export const RemoveAccountSchema = {
    type: "object",
    properties: {
        account: { type: "string", description: "Email address or alias of the account to remove" }
    },
    required: ["account"]
};

export const SetAccountAliasSchema = {
    type: "object",
    properties: {
        account: { type: "string", description: "Email address or current alias of the account" },
        alias: { type: "string", description: "New alias to set for this account" }
    },
    required: ["account", "alias"]
};
