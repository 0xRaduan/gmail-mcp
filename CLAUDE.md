# Gmail MCP Development Guide

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

## Project Structure

- `src/index.ts` - Main MCP server with tool handlers
- `src/schemas.ts` - JSON Schema definitions for all tools
- `src/account-manager.ts` - Multi-account OAuth management
- `src/label-manager.ts` - Gmail label operations
- `src/filter-manager.ts` - Gmail filter operations
- `src/utl.ts` - Email utilities (MIME, attachments)

## Testing

Run the MCP server locally:
```bash
npm run build && npm start
```

Authenticate a new account:
```bash
npm run auth [alias]
```
