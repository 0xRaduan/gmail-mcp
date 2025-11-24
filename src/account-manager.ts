import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Configuration paths
const CONFIG_DIR = path.join(os.homedir(), '.gmail-mcp');
const ACCOUNTS_DIR = path.join(CONFIG_DIR, 'accounts');
const REGISTRY_PATH = path.join(ACCOUNTS_DIR, 'accounts-registry.json');
const ACTIVE_ACCOUNT_PATH = path.join(CONFIG_DIR, 'active-account.txt');

export interface AccountInfo {
    email: string;
    alias?: string;
    credentialsPath: string;
    lastUsed: Date;
    scopes: string[];
}

interface AccountRegistry {
    [email: string]: AccountInfo;
}

export class AccountManager {
    private registry: AccountRegistry = {};
    private clients: Map<string, OAuth2Client> = new Map();
    private oauth2Config: { clientId: string; clientSecret: string; redirectUri: string } | null = null;

    constructor() {
        this.loadRegistry();
    }

    /**
     * Initialize OAuth2 configuration from keys file
     */
    async initializeOAuth2Config(oauthPath: string): Promise<void> {
        if (!fs.existsSync(oauthPath)) {
            throw new Error(`OAuth keys file not found at ${oauthPath}`);
        }

        const keysContent = JSON.parse(fs.readFileSync(oauthPath, 'utf8'));
        const keys = keysContent.installed || keysContent.web;

        if (!keys) {
            throw new Error('Invalid OAuth keys file format');
        }

        this.oauth2Config = {
            clientId: keys.client_id,
            clientSecret: keys.client_secret,
            redirectUri: keys.redirect_uris?.[0] || 'http://localhost:3000/oauth2callback',
        };
    }

    /**
     * Load the account registry from disk
     */
    private loadRegistry(): void {
        // Ensure directories exist
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
        if (!fs.existsSync(ACCOUNTS_DIR)) {
            fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
        }

        if (fs.existsSync(REGISTRY_PATH)) {
            const data = fs.readFileSync(REGISTRY_PATH, 'utf8');
            this.registry = JSON.parse(data);

            // Convert lastUsed strings back to Date objects
            for (const email in this.registry) {
                this.registry[email].lastUsed = new Date(this.registry[email].lastUsed);
            }
        }
    }

    /**
     * Save the account registry to disk
     */
    private saveRegistry(): void {
        fs.writeFileSync(REGISTRY_PATH, JSON.stringify(this.registry, null, 2));
    }

    /**
     * Add a new account to the registry
     */
    async addAccount(email: string, credentials: any, alias?: string, scopes?: string[]): Promise<void> {
        const credentialsPath = path.join(ACCOUNTS_DIR, `${email}.json`);

        // Save credentials
        fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));

        // Add to registry
        this.registry[email] = {
            email,
            alias,
            credentialsPath,
            lastUsed: new Date(),
            scopes: scopes || [
                'https://www.googleapis.com/auth/gmail.modify',
                'https://www.googleapis.com/auth/gmail.settings.basic'
            ],
        };

        this.saveRegistry();

        // Set as active if it's the first account
        const accounts = this.listAccounts();
        if (accounts.length === 1) {
            await this.setActiveAccount(email);
        }
    }

    /**
     * Remove an account from the registry
     */
    async removeAccount(emailOrAlias: string): Promise<void> {
        const email = this.resolveEmailFromAlias(emailOrAlias);

        if (!this.registry[email]) {
            throw new Error(`Account not found: ${emailOrAlias}`);
        }

        // Delete credentials file
        const credentialsPath = this.registry[email].credentialsPath;
        if (fs.existsSync(credentialsPath)) {
            fs.unlinkSync(credentialsPath);
        }

        // Remove from registry
        delete this.registry[email];
        this.saveRegistry();

        // Remove cached client
        this.clients.delete(email);

        // Clear active account if it was this one
        const activeAccount = await this.getActiveAccount();
        if (activeAccount === email) {
            if (fs.existsSync(ACTIVE_ACCOUNT_PATH)) {
                fs.unlinkSync(ACTIVE_ACCOUNT_PATH);
            }
        }
    }

    /**
     * Set an alias for an account
     */
    async setAlias(emailOrAlias: string, newAlias: string): Promise<void> {
        const email = this.resolveEmailFromAlias(emailOrAlias);

        if (!this.registry[email]) {
            throw new Error(`Account not found: ${emailOrAlias}`);
        }

        // Check if alias is already in use
        for (const e in this.registry) {
            if (this.registry[e].alias === newAlias && e !== email) {
                throw new Error(`Alias '${newAlias}' is already in use by ${e}`);
            }
        }

        this.registry[email].alias = newAlias;
        this.saveRegistry();
    }

    /**
     * List all registered accounts
     */
    listAccounts(): AccountInfo[] {
        return Object.values(this.registry).sort((a, b) =>
            b.lastUsed.getTime() - a.lastUsed.getTime()
        );
    }

    /**
     * Get the active account email
     */
    async getActiveAccount(): Promise<string | null> {
        if (fs.existsSync(ACTIVE_ACCOUNT_PATH)) {
            return fs.readFileSync(ACTIVE_ACCOUNT_PATH, 'utf8').trim();
        }
        return null;
    }

    /**
     * Set the active account
     */
    async setActiveAccount(emailOrAlias: string): Promise<void> {
        const email = this.resolveEmailFromAlias(emailOrAlias);

        if (!this.registry[email]) {
            throw new Error(`Account not found: ${emailOrAlias}`);
        }

        fs.writeFileSync(ACTIVE_ACCOUNT_PATH, email);

        // Update last used timestamp
        this.registry[email].lastUsed = new Date();
        this.saveRegistry();
    }

    /**
     * Check if an account exists
     */
    hasAccount(emailOrAlias: string): boolean {
        try {
            const email = this.resolveEmailFromAlias(emailOrAlias);
            return !!this.registry[email];
        } catch {
            return false;
        }
    }

    /**
     * Resolve email from alias (or return email if it's already an email)
     */
    private resolveEmailFromAlias(emailOrAlias: string): string {
        // Check if it's already an email in the registry
        if (this.registry[emailOrAlias]) {
            return emailOrAlias;
        }

        // Search by alias
        for (const email in this.registry) {
            if (this.registry[email].alias === emailOrAlias) {
                return email;
            }
        }

        // If not found, assume it's an email (will fail later if not in registry)
        return emailOrAlias;
    }

    /**
     * Get OAuth2 client for a specific account
     */
    async getClient(emailOrAlias?: string): Promise<OAuth2Client> {
        let email: string;

        if (emailOrAlias) {
            email = this.resolveEmailFromAlias(emailOrAlias);
        } else {
            const activeAccount = await this.getActiveAccount();
            if (!activeAccount) {
                const accounts = this.listAccounts();
                if (accounts.length === 0) {
                    throw new Error('No accounts authenticated. Please run authentication first.');
                }
                // Auto-activate if only one account
                if (accounts.length === 1) {
                    email = accounts[0].email;
                    await this.setActiveAccount(email);
                } else {
                    throw new Error('No active account. Use switch_account tool or specify account parameter.');
                }
            } else {
                email = activeAccount;
            }
        }

        if (!this.registry[email]) {
            throw new Error(`Account not found: ${emailOrAlias || email}. Available accounts: ${this.listAccounts().map(a => a.alias || a.email).join(', ')}`);
        }

        // Return cached client if available
        if (this.clients.has(email)) {
            return this.clients.get(email)!;
        }

        // Create new client
        if (!this.oauth2Config) {
            throw new Error('OAuth2 configuration not initialized');
        }

        const client = new OAuth2Client(
            this.oauth2Config.clientId,
            this.oauth2Config.clientSecret,
            this.oauth2Config.redirectUri
        );

        // Load credentials
        const credentialsPath = this.registry[email].credentialsPath;
        if (!fs.existsSync(credentialsPath)) {
            throw new Error(`Credentials file not found for ${email}. Please re-authenticate.`);
        }

        const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        client.setCredentials(credentials);

        // Cache the client
        this.clients.set(email, client);

        return client;
    }

    /**
     * Get account info for display purposes
     */
    getAccountInfo(emailOrAlias: string): AccountInfo | null {
        const email = this.resolveEmailFromAlias(emailOrAlias);
        return this.registry[email] || null;
    }

    /**
     * Create a new OAuth2 client for authentication flow
     */
    createAuthClient(redirectUri?: string): OAuth2Client {
        if (!this.oauth2Config) {
            throw new Error('OAuth2 configuration not initialized');
        }

        return new OAuth2Client(
            this.oauth2Config.clientId,
            this.oauth2Config.clientSecret,
            redirectUri || this.oauth2Config.redirectUri
        );
    }

    /**
     * Complete authentication and register the account
     */
    async completeAuthentication(
        client: OAuth2Client,
        tokens: any,
        alias?: string
    ): Promise<string> {
        // Set credentials to get user profile
        client.setCredentials(tokens);

        // Get user email
        const gmail = google.gmail({ version: 'v1', auth: client });
        const profile = await gmail.users.getProfile({ userId: 'me' });
        const email = profile.data.emailAddress!;

        // Save account
        await this.addAccount(email, tokens, alias, tokens.scope?.split(' '));

        return email;
    }
}
