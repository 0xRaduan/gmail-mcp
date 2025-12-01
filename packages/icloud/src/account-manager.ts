/**
 * iCloud Mail Account Manager
 * Handles multi-account credential storage using app-specific passwords
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { ImapFlow } from 'imapflow';
import { AccountInfo, AccountCredentials, AccountRegistry, ICLOUD_CONFIG } from './types.js';

// Configuration paths
const CONFIG_DIR = path.join(os.homedir(), '.icloud-mcp');
const ACCOUNTS_DIR = path.join(CONFIG_DIR, 'accounts');
const REGISTRY_PATH = path.join(ACCOUNTS_DIR, 'accounts-registry.json');
const ACTIVE_ACCOUNT_PATH = path.join(CONFIG_DIR, 'active-account.txt');

export class AccountManager {
  private registry: AccountRegistry = {};

  constructor() {
    this.loadRegistry();
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
   * Validate iCloud credentials by attempting IMAP login
   */
  async validateCredentials(credentials: AccountCredentials): Promise<boolean> {
    const client = new ImapFlow({
      host: ICLOUD_CONFIG.imap.host,
      port: ICLOUD_CONFIG.imap.port,
      secure: ICLOUD_CONFIG.imap.secure,
      auth: {
        user: credentials.email,
        pass: credentials.appPassword,
      },
      logger: false,
    });

    try {
      await client.connect();
      await client.logout();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Add a new account to the registry
   */
  async addAccount(credentials: AccountCredentials, alias?: string): Promise<void> {
    const { email, appPassword } = credentials;
    const credentialsPath = path.join(ACCOUNTS_DIR, `${email}.json`);

    // Prevent alias collisions so alias resolution stays unambiguous
    if (alias) {
      this.ensureAliasAvailable(alias, email);
    }

    // Save credentials (app password stored as-is, consider encryption for production)
    const credentialData: AccountCredentials = {
      email,
      appPassword,
    };
    fs.writeFileSync(credentialsPath, JSON.stringify(credentialData, null, 2), { mode: 0o600 });

    // Add to registry
    this.registry[email] = {
      email,
      alias,
      credentialsPath,
      lastUsed: new Date(),
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

    this.ensureAliasAvailable(newAlias, email);

    this.registry[email].alias = newAlias;
    this.saveRegistry();
  }

  /**
   * List all registered accounts
   */
  listAccounts(): AccountInfo[] {
    return Object.values(this.registry).sort(
      (a, b) => b.lastUsed.getTime() - a.lastUsed.getTime()
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
  resolveEmailFromAlias(emailOrAlias: string): string {
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
   * Get credentials for a specific account
   */
  async getCredentials(emailOrAlias?: string): Promise<AccountCredentials> {
    let email: string;

    if (emailOrAlias) {
      email = this.resolveEmailFromAlias(emailOrAlias);
    } else {
      const activeAccount = await this.getActiveAccount();
      if (!activeAccount) {
        const accounts = this.listAccounts();
        if (accounts.length === 0) {
          throw new Error(
            'No accounts authenticated. Please run: npx @anthropic/icloud-mcp auth'
          );
        }
        // Auto-activate if only one account
        if (accounts.length === 1) {
          email = accounts[0].email;
          await this.setActiveAccount(email);
        } else {
          throw new Error(
            'No active account. Use switch_account tool or specify account parameter.'
          );
        }
      } else {
        email = activeAccount;
      }
    }

    if (!this.registry[email]) {
      throw new Error(
        `Account not found: ${emailOrAlias || email}. Available accounts: ${this.listAccounts()
          .map((a) => a.alias || a.email)
          .join(', ')}`
      );
    }

    // Load credentials
    const credentialsPath = this.registry[email].credentialsPath;
    if (!fs.existsSync(credentialsPath)) {
      throw new Error(`Credentials file not found for ${email}. Please re-authenticate.`);
    }

    const credentials: AccountCredentials = JSON.parse(
      fs.readFileSync(credentialsPath, 'utf8')
    );

    // Update last used timestamp
    this.registry[email].lastUsed = new Date();
    this.saveRegistry();

    return credentials;
  }

  /**
   * Get account info for display purposes
   */
  getAccountInfo(emailOrAlias: string): AccountInfo | null {
    const email = this.resolveEmailFromAlias(emailOrAlias);
    return this.registry[email] || null;
  }

  /**
   * Ensure an alias is not already assigned to another account
   */
  private ensureAliasAvailable(alias: string, ownerEmail: string): void {
    for (const email in this.registry) {
      // Prevent alias from shadowing another account's email
      if (alias === email && email !== ownerEmail) {
        throw new Error(`Alias '${alias}' is already registered as an email for ${email}`);
      }

      // Prevent alias from colliding with another alias
      if (this.registry[email].alias === alias && email !== ownerEmail) {
        throw new Error(`Alias '${alias}' is already in use by ${email}`);
      }
    }
  }
}
