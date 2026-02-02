# Gmail MCP & CLI Development Guide

This project provides **two interfaces** to Gmail:
1. **MCP Server** - For AI assistants (Claude Code, Cursor, etc.)
2. **CLI** - For terminal usage and shell automations

## Quick Start

### CLI Usage

```bash
# Authenticate an account
gmail account auth personal

# Search emails
gmail email search --query "from:boss@company.com is:unread"

# Read an email
gmail email read --id "abc123"

# Archive old LinkedIn emails (with dry-run preview)
gmail email search --query "from:linkedin older_than:30d" -f json | \
  jq -r '.messages[].id' | \
  gmail batch archive --stdin --dry-run

# Execute if satisfied
gmail email search --query "from:linkedin older_than:30d" -f json | \
  jq -r '.messages[].id' | \
  gmail batch archive --stdin
```

### MCP Server

Configure in Claude Code or other MCP clients:
```json
{
  "mcpServers": {
    "gmail": {
      "command": "gmail-mcp"
    }
  }
}
```

## CLI Commands

```
gmail
├── account     - list, switch, active, remove, alias, auth
├── email       - search, read, send, draft, modify, delete
├── batch       - modify-emails, delete-emails, modify-threads, archive, trash, mark-read, star
├── thread      - read, modify
├── label       - list, create, update, delete, get-or-create
├── filter      - list, get, create, delete, template
└── attachment  - download
```

Global options: `-a/--account`, `-f/--format` (human|json), `--dry-run`, `--quiet`

## Project Structure

```
src/
├── index.ts              # MCP server entry point
├── cli.ts                # CLI entry point
├── services/             # Shared business logic
│   ├── gmail-service.ts  # Base class, Gmail client
│   ├── email-service.ts  # Email CRUD operations
│   ├── thread-service.ts # Thread operations
│   ├── batch-service.ts  # Batch operations
│   └── types.ts          # Shared TypeScript interfaces
├── formatters/           # Output formatting
│   ├── cli-formatter.ts  # Human-readable output
│   └── json-formatter.ts # JSON for piping
├── cli/commands/         # CLI command definitions
├── schemas.ts            # JSON Schema definitions for MCP
├── account-manager.ts    # Multi-account OAuth management
├── label-manager.ts      # Label operations
├── filter-manager.ts     # Filter operations
└── utl.ts                # Email utilities (MIME, attachments)
```

## MCP Development Best Practices

### Error Handling

Always return `isError: true` in error responses so MCP clients can properly display errors:

```typescript
} catch (error: any) {
    return {
        content: [
            {
                type: "text",
                text: `Error: ${error.message}`,
            },
        ],
        isError: true,  // Signals error to MCP client (shows red in Claude Code)
    };
}
```

### Schema Definitions

Avoid `zod-to-json-schema` at build time - it causes extremely slow TypeScript compilation with complex schemas. Instead, define JSON schemas directly:

```typescript
// schemas.ts - Plain JSON Schema (fast)
export const MyToolSchema = {
    type: "object",
    properties: {
        param: { type: "string", description: "Description here" }
    },
    required: ["param"]
};

// Then use directly:
inputSchema: schemas.MyToolSchema
```

### Build Configuration

Exclude test/eval directories from the main build if they have extra dependencies:

```json
// tsconfig.json
{
    "exclude": ["node_modules", "dist", "src/evals"]
}
```

## Testing

Run the MCP server locally:
```bash
npm run build && npm start
```

Run the CLI:
```bash
npm run cli -- email search --query "test"
# or after npm link:
gmail email search --query "test"
```

Authenticate a new account:
```bash
gmail account auth [alias]
# or:
npm run auth [alias]
```
