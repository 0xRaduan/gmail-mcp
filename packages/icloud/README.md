# iCloud Mail MCP Server

An MCP (Model Context Protocol) server that provides email operations for iCloud Mail via IMAP/SMTP.

## Features

- **12 tools** for comprehensive email management
- **Multi-account support** with account switching
- **IMAP/SMTP** based (uses app-specific passwords)
- Works with Claude Desktop and other MCP clients

## Prerequisites

1. **Two-factor authentication** must be enabled on your Apple ID
2. **App-specific password** generated at [appleid.apple.com](https://appleid.apple.com)
   - Go to Security > App-Specific Passwords > Generate

## Installation

```bash
# Clone and install
cd packages/icloud
pnpm install
pnpm run build
```

## Authentication

Before using the MCP server, authenticate your iCloud account:

```bash
# Authenticate first account
node dist/index.js auth

# Authenticate with an alias
node dist/index.js auth personal
```

You'll be prompted for:
- Your iCloud email (e.g., `user@icloud.com`, `user@me.com`, or `user@mac.com`)
- Your app-specific password (format: `xxxx-xxxx-xxxx-xxxx`)

Credentials are stored in `~/.icloud-mcp/accounts/`.

## Claude Desktop Configuration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "icloud-mail": {
      "command": "node",
      "args": ["/path/to/gmail-mcp/packages/icloud/dist/index.js"]
    }
  }
}
```

## Available Tools

### Email Operations

| Tool | Description |
|------|-------------|
| `send_email` | Send email with optional attachments |
| `draft_email` | Save email draft to Drafts folder |
| `read_email` | Read full email content by UID |
| `search_emails` | Search emails with various filters |
| `move_email` | Move email to different folder |
| `delete_email` | Delete email (trash or permanent) |
| `download_attachment` | Download email attachment |

### Folder Operations

| Tool | Description |
|------|-------------|
| `list_folders` | List all mailbox folders |
| `create_folder` | Create new folder |

### Account Operations

| Tool | Description |
|------|-------------|
| `list_accounts` | List authenticated accounts |
| `switch_account` | Switch active account |
| `get_active_account` | Get current active account |

## Usage Examples

### Send an Email

```json
{
  "tool": "send_email",
  "arguments": {
    "to": ["recipient@example.com"],
    "subject": "Hello from iCloud MCP",
    "body": "This is a test email sent via the iCloud Mail MCP server."
  }
}
```

### Search Emails

```json
{
  "tool": "search_emails",
  "arguments": {
    "folder": "INBOX",
    "from": "someone@example.com",
    "since": "2024-01-01",
    "maxResults": 10
  }
}
```

### Read an Email

```json
{
  "tool": "read_email",
  "arguments": {
    "uid": "12345",
    "folder": "INBOX"
  }
}
```

## Limitations

This MCP uses IMAP/SMTP protocols. Compared to Gmail's API:

| Feature | iCloud MCP | Gmail MCP |
|---------|------------|-----------|
| Server-side filters | Not available (use iCloud.com) | Full CRUD |
| Labels | Folders only (one per email) | Multi-label support |
| Search syntax | IMAP search | Gmail query syntax |
| Thread IDs | Not available | Native support |
| Authentication | App-specific passwords | OAuth2 |

## iCloud Server Settings

- **IMAP**: `imap.mail.me.com:993` (SSL)
- **SMTP**: `smtp.mail.me.com:587` (STARTTLS)
- **Supported domains**: `@icloud.com`, `@me.com`, `@mac.com`

## Troubleshooting

### Authentication Failed
- Ensure you're using an **app-specific password**, not your Apple ID password
- Verify two-factor authentication is enabled on your Apple ID
- Check that the email domain is correct (@icloud.com, @me.com, or @mac.com)

### Connection Issues
- iCloud IMAP requires SSL on port 993
- SMTP requires STARTTLS on port 587
- Check your firewall settings

### Missing Folders
- iCloud uses "Sent Messages" instead of "Sent"
- Trash folder is "Deleted Messages"
- Use `list_folders` to see exact folder names

## License

MIT
