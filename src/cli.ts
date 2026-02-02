#!/usr/bin/env node

/**
 * Gmail CLI - Command line interface for Gmail
 *
 * Usage:
 *   gmail <command> [options]
 *
 * Examples:
 *   gmail email search --query "from:boss@company.com"
 *   gmail email read --id "abc123"
 *   gmail batch archive --stdin --dry-run
 *   gmail account list
 */

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { AccountManager } from './account-manager.js';
import {
    createEmailCommands,
    createBatchCommands,
    createThreadCommands,
    createLabelCommands,
    createFilterCommands,
    createAccountCommands,
    createAttachmentCommands,
} from './cli/commands/index.js';

// Configuration paths
const CONFIG_DIR = path.join(os.homedir(), '.gmail-mcp');
const OAUTH_PATH = process.env.GMAIL_OAUTH_PATH || path.join(CONFIG_DIR, 'gcp-oauth.keys.json');

async function main() {
    // Initialize account manager
    const accountManager = new AccountManager();

    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    // Check for OAuth keys in current directory first, then in config directory
    const localOAuthPath = path.join(process.cwd(), 'gcp-oauth.keys.json');

    if (fs.existsSync(localOAuthPath) && !fs.existsSync(OAUTH_PATH)) {
        fs.copyFileSync(localOAuthPath, OAUTH_PATH);
        console.log('OAuth keys found in current directory, copied to global config.');
    }

    if (!fs.existsSync(OAUTH_PATH)) {
        console.error('Error: OAuth keys file not found.');
        console.error('Please place gcp-oauth.keys.json in current directory or', CONFIG_DIR);
        process.exit(1);
    }

    await accountManager.initializeOAuth2Config(OAUTH_PATH);

    // Create main program
    const program = new Command();

    program
        .name('gmail')
        .version('1.3.0')
        .description('Gmail CLI - manage email from the command line')
        .configureHelp({
            sortSubcommands: true,
            sortOptions: true,
        });

    // Register command groups
    program.addCommand(createEmailCommands(accountManager));
    program.addCommand(createBatchCommands(accountManager));
    program.addCommand(createThreadCommands(accountManager));
    program.addCommand(createLabelCommands(accountManager));
    program.addCommand(createFilterCommands(accountManager));
    program.addCommand(createAccountCommands(accountManager));
    program.addCommand(createAttachmentCommands(accountManager));

    // Parse and execute
    await program.parseAsync(process.argv);
}

main().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
});
