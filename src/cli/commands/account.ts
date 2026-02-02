/**
 * Account commands
 */

import { Command } from 'commander';
import { AccountManager } from '../../account-manager.js';
import { getFormatterFromOptions, output, asyncHandler, type GlobalOptions } from '../utils.js';
import http from 'http';
import open from 'open';

export function createAccountCommands(accountManager: AccountManager): Command {
    const account = new Command('account')
        .description('Account management');

    // gmail account list
    account
        .command('list')
        .description('List all authenticated accounts')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions) => {
            const accounts = accountManager.listAccounts();
            const activeAccount = await accountManager.getActiveAccount();

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatAccounts(accounts, activeAccount || undefined), options);
        }));

    // gmail account switch
    account
        .command('switch')
        .description('Switch the active account')
        .requiredOption('--to <account>', 'Account email or alias to switch to')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & { to: string }) => {
            await accountManager.setActiveAccount(options.to);
            const accountInfo = accountManager.getAccountInfo(options.to);

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatSuccess(
                `Switched to account: ${accountInfo?.email}${accountInfo?.alias ? ` (${accountInfo.alias})` : ''}`
            ), options);
        }));

    // gmail account active
    account
        .command('active')
        .description('Show the currently active account')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions) => {
            const activeAccount = await accountManager.getActiveAccount();

            const formatter = getFormatterFromOptions(options);

            if (!activeAccount) {
                const accounts = accountManager.listAccounts();
                if (accounts.length === 0) {
                    output(formatter.formatError('No accounts authenticated. Use "gmail account auth [alias]" to add an account.'), options);
                } else {
                    output(formatter.formatError(`No active account. Use "gmail account switch --to <account>" to activate one.`), options);
                }
                return;
            }

            const accountInfo = accountManager.getAccountInfo(activeAccount);
            output(formatter.formatSuccess(
                `Active account: ${accountInfo?.email}${accountInfo?.alias ? ` (${accountInfo.alias})` : ''}`
            ), options);
        }));

    // gmail account remove
    account
        .command('remove')
        .description('Remove an account')
        .requiredOption('--account <account>', 'Account email or alias to remove')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & { account: string }) => {
            const accountInfo = accountManager.getAccountInfo(options.account);

            if (!accountInfo) {
                throw new Error(`Account not found: ${options.account}`);
            }

            await accountManager.removeAccount(options.account);

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatSuccess(
                `Account removed: ${accountInfo.email}${accountInfo.alias ? ` (${accountInfo.alias})` : ''}`
            ), options);
        }));

    // gmail account alias
    account
        .command('alias')
        .description('Set an alias for an account')
        .requiredOption('--account <account>', 'Account email or current alias')
        .requiredOption('--name <alias>', 'New alias name')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(asyncHandler(async (options: GlobalOptions & { account: string; name: string }) => {
            await accountManager.setAlias(options.account, options.name);
            const accountInfo = accountManager.getAccountInfo(options.name);

            const formatter = getFormatterFromOptions(options);
            output(formatter.formatSuccess(
                `Alias set: ${accountInfo?.email} → ${options.name}`
            ), options);
        }));

    // gmail account auth
    account
        .command('auth [alias]')
        .description('Authenticate a new account')
        .option('-f, --format <format>', 'Output format: human or json', 'human')
        .option('--quiet', 'Suppress non-essential output')
        .action(async (alias: string | undefined, options: GlobalOptions) => {
            try {
            const formatter = getFormatterFromOptions(options);

            console.log(`\nAuthenticating new account${alias ? ` (alias: ${alias})` : ''}...`);

            const server = http.createServer();
            server.listen(3000);

            const email = await new Promise<string>((resolve, reject) => {
                const oauth2Client = accountManager.createAuthClient();

                const authUrl = oauth2Client.generateAuthUrl({
                    access_type: 'offline',
                    prompt: 'consent',
                    scope: [
                        'https://www.googleapis.com/auth/gmail.modify',
                        'https://www.googleapis.com/auth/gmail.settings.basic'
                    ],
                });

                console.log('Please visit this URL to authenticate:', authUrl);
                open(authUrl);

                server.on('request', async (req, res) => {
                    if (!req.url?.startsWith('/oauth2callback')) return;

                    const url = new URL(req.url, 'http://localhost:3000');
                    const code = url.searchParams.get('code');

                    if (!code) {
                        res.writeHead(400);
                        res.end('No code provided');
                        reject(new Error('No code provided'));
                        return;
                    }

                    try {
                        const { tokens } = await oauth2Client.getToken(code);
                        const actualEmail = await accountManager.completeAuthentication(
                            oauth2Client,
                            tokens,
                            alias
                        );

                        res.writeHead(200);
                        res.end(`Authentication successful for ${actualEmail}! You can close this window.`);
                        server.close();

                        resolve(actualEmail);
                    } catch (error) {
                        res.writeHead(500);
                        res.end('Authentication failed');
                        reject(error);
                    }
                });
            });

            output(formatter.formatSuccess(
                `Account authenticated: ${email}${alias ? ` (alias: ${alias})` : ''}`
            ), options);

            // List all accounts after auth
            const accounts = accountManager.listAccounts();
            console.log('\nAuthenticated accounts:');
            accounts.forEach((acc, idx) => {
                console.log(`  ${idx + 1}. ${acc.email}${acc.alias ? ` (${acc.alias})` : ''}`);
            });
            } catch (error: any) {
                console.error('Error:', error.message);
                process.exit(1);
            }
        });

    return account;
}
