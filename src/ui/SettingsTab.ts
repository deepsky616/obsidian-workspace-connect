import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import WorkspaceConnectPlugin from '../../main';

export class WorkspaceConnectSettingTab extends PluginSettingTab {
    plugin: WorkspaceConnectPlugin;

    constructor(app: App, plugin: WorkspaceConnectPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Workspace Connect Settings' });

        // Connection Status Section
        const statusSection = containerEl.createDiv({ cls: 'setting-section' });
        statusSection.createEl('h3', { text: 'Connection Status' });

        const statusDiv = statusSection.createDiv({ cls: 'workspace-connect-status-card' });
        if (this.plugin.isAuthenticated()) {
            statusDiv.addClass('connected');
            statusDiv.createEl('span', { text: '✓ Connected to Google', cls: 'status-text' });
        } else {
            statusDiv.addClass('disconnected');
            statusDiv.createEl('span', { text: '○ Not connected', cls: 'status-text' });
        }

        // OAuth Configuration Section
        containerEl.createEl('h3', { text: 'Google OAuth 2.0 Configuration' });

        const helpText = containerEl.createDiv({ cls: 'setting-help' });
        helpText.innerHTML = `
            <p>To use this plugin, you need to create OAuth 2.0 credentials in Google Cloud Console:</p>
            <ol>
                <li>Go to <a href="https://console.cloud.google.com/">Google Cloud Console</a></li>
                <li>Create a new project or select an existing one</li>
                <li>Enable these APIs: Google Docs API, Google Sheets API, Google Slides API, Google Forms API, Google Drive API</li>
                <li>Go to "Credentials" → "Create Credentials" → "OAuth client ID"</li>
                <li>Select "Desktop app" as application type</li>
                <li>Copy the Client ID and Client Secret below</li>
                <li>Add <code>http://localhost:51895/callback</code> to Authorized redirect URIs</li>
            </ol>
        `;

        new Setting(containerEl)
            .setName('Client ID')
            .setDesc('Your OAuth 2.0 Client ID')
            .addText(text => text
                .setPlaceholder('xxxxx.apps.googleusercontent.com')
                .setValue(this.plugin.settings.clientId)
                .onChange(async (value) => {
                    this.plugin.settings.clientId = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Client Secret')
            .setDesc('Your OAuth 2.0 Client Secret')
            .addText(text => {
                text
                    .setPlaceholder('GOCSPX-xxxxx')
                    .setValue(this.plugin.settings.clientSecret)
                    .onChange(async (value) => {
                        this.plugin.settings.clientSecret = value;
                        await this.plugin.saveSettings();
                    });
                // Make it a password field
                text.inputEl.type = 'password';
            });

        new Setting(containerEl)
            .setName('Connect to Google')
            .setDesc('Authenticate with your Google account to enable the plugin')
            .addButton(button => button
                .setButtonText(this.plugin.isAuthenticated() ? 'Reconnect' : 'Connect')
                .setCta()
                .onClick(async () => {
                    if (!this.plugin.settings.clientId || !this.plugin.settings.clientSecret) {
                        new Notice('Please enter Client ID and Client Secret first');
                        return;
                    }
                    try {
                        await this.plugin.oauthManager.authenticate();
                        this.display(); // Refresh the settings
                    } catch (e: any) {
                        new Notice(`Authentication failed: ${e.message}`);
                    }
                }));

        if (this.plugin.isAuthenticated()) {
            new Setting(containerEl)
                .setName('Disconnect')
                .setDesc('Remove the connection to Google')
                .addButton(button => button
                    .setButtonText('Disconnect')
                    .setWarning()
                    .onClick(async () => {
                        this.plugin.settings.accessToken = '';
                        this.plugin.settings.refreshToken = '';
                        this.plugin.settings.tokenExpiry = '';
                        await this.plugin.saveSettings();
                        new Notice('Disconnected from Google');
                        this.display();
                    }));
        }

        // Import Settings Section
        containerEl.createEl('h3', { text: 'Import Settings' });

        new Setting(containerEl)
            .setName('Default Import Folder')
            .setDesc('Folder where imported Google files will be saved as Markdown notes')
            .addText(text => text
                .setPlaceholder('Google Imports')
                .setValue(this.plugin.settings.defaultImportFolder)
                .onChange(async (value) => {
                    this.plugin.settings.defaultImportFolder = value;
                    await this.plugin.saveSettings();
                }));

        // Linked Files Section
        containerEl.createEl('h3', { text: 'Linked Files' });

        const linkedFiles = this.plugin.settings.linkedFiles;

        if (linkedFiles.length === 0) {
            containerEl.createEl('p', {
                text: 'No files are currently linked. Import or export files to create links.',
                cls: 'setting-item-description'
            });
        } else {
            containerEl.createEl('p', {
                text: `${linkedFiles.length} file(s) linked`,
                cls: 'setting-item-description'
            });

            const linkedListEl = containerEl.createDiv({ cls: 'linked-files-settings-list' });

            for (let i = 0; i < linkedFiles.length; i++) {
                const linked = linkedFiles[i];

                const itemEl = linkedListEl.createDiv({ cls: 'linked-file-settings-item' });

                // Icon
                const icon = this.getTypeIcon(linked.googleFileType);
                itemEl.createEl('span', { text: icon, cls: 'linked-type-icon' });

                // Info
                const infoEl = itemEl.createDiv({ cls: 'linked-file-info' });
                infoEl.createEl('div', { text: linked.googleFileName, cls: 'linked-google-name' });
                infoEl.createEl('div', { text: `Local: ${linked.localPath}`, cls: 'linked-local-path' });
                infoEl.createEl('div', {
                    text: `Last synced: ${new Date(linked.lastSyncedAt).toLocaleString()}`,
                    cls: 'linked-sync-date'
                });

                // Unlink button
                const unlinkBtn = itemEl.createEl('button', {
                    text: 'Unlink',
                    cls: 'linked-unlink-btn'
                });
                unlinkBtn.addEventListener('click', async () => {
                    this.plugin.settings.linkedFiles.splice(i, 1);
                    await this.plugin.saveSettings();
                    this.display();
                    new Notice('File unlinked');
                });
            }

            // Clear all button
            new Setting(containerEl)
                .setName('Clear All Links')
                .setDesc('Remove all file links (does not delete files)')
                .addButton(button => button
                    .setButtonText('Clear All')
                    .setWarning()
                    .onClick(async () => {
                        this.plugin.settings.linkedFiles = [];
                        await this.plugin.saveSettings();
                        this.display();
                        new Notice('All links cleared');
                    }));
        }

        // About Section
        containerEl.createEl('h3', { text: 'About' });
        containerEl.createEl('p', {
            text: 'Workspace Connect allows you to import, export, and sync Google Workspace files (Docs, Sheets, Slides, Forms) with your Obsidian vault.',
            cls: 'setting-item-description'
        });

        const linksEl = containerEl.createDiv({ cls: 'about-links' });
        linksEl.innerHTML = `
            <p>
                <a href="https://github.com/DeepSky616/obsidian-workspace-connect">GitHub Repository</a> |
                <a href="https://github.com/DeepSky616/obsidian-workspace-connect/issues">Report Issues</a>
            </p>
        `;
    }

    private getTypeIcon(type: string): string {
        switch (type) {
            case 'docs': return '📄';
            case 'sheets': return '📊';
            case 'slides': return '📽️';
            case 'forms': return '📝';
            default: return '📁';
        }
    }
}
