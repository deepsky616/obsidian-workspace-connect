import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import { WorkspaceView, WORKSPACE_VIEW_TYPE } from './src/ui/WorkspaceView';
import { GoogleFilePicker } from './src/ui/GoogleFilePicker';
import { AIWorkspaceModal } from './src/ui/AIWorkspaceModal';
import { OAuthManager } from './src/auth/OAuth';
import { DocsService } from './src/services/DocsService';
import { SheetsService } from './src/services/SheetsService';
import { SlidesService } from './src/services/SlidesService';
import { FormsService } from './src/services/FormsService';
import { DriveService } from './src/services/DriveService';
import { DocsConverter } from './src/converters/DocsConverter';
import { SheetsConverter } from './src/converters/SheetsConverter';
import { SlidesConverter } from './src/converters/SlidesConverter';
import { FormsConverter } from './src/converters/FormsConverter';

export interface LinkedFile {
    localPath: string;
    googleFileId: string;
    googleFileType: 'docs' | 'sheets' | 'slides' | 'forms';
    lastSyncedAt: string;
    googleFileName: string;
}

export interface WorkspaceConnectSettings {
    clientId: string;
    clientSecret: string;
    accessToken: string;
    refreshToken: string;
    tokenExpiry: string;
    defaultImportFolder: string;
    linkedFiles: LinkedFile[];
}

const DEFAULT_SETTINGS: WorkspaceConnectSettings = {
    clientId: '',
    clientSecret: '',
    accessToken: '',
    refreshToken: '',
    tokenExpiry: '',
    defaultImportFolder: '',
    linkedFiles: []
}

export default class WorkspaceConnectPlugin extends Plugin {
    settings: WorkspaceConnectSettings;
    oauthManager: OAuthManager;
    docsService: DocsService;
    sheetsService: SheetsService;
    slidesService: SlidesService;
    formsService: FormsService;
    driveService: DriveService;

    async onload() {
        await this.loadSettings();

        // Initialize services
        this.oauthManager = new OAuthManager(this);
        this.docsService = new DocsService(this);
        this.sheetsService = new SheetsService(this);
        this.slidesService = new SlidesService(this);
        this.formsService = new FormsService(this);
        this.driveService = new DriveService(this);

        // Register View
        this.registerView(
            WORKSPACE_VIEW_TYPE,
            (leaf) => new WorkspaceView(leaf, this)
        );

        // Ribbon Icon
        this.addRibbonIcon('cloud', 'Open Workspace Connect', () => {
            this.activateView();
        });

        // Commands
        this.addCommand({
            id: 'open-workspace-connect',
            name: 'Open Workspace Connect',
            callback: () => {
                this.activateView();
            }
        });

        this.addCommand({
            id: 'import-google-doc',
            name: 'Import Google Doc',
            callback: async () => {
                await this.importGoogleFile('docs');
            }
        });

        this.addCommand({
            id: 'import-google-sheet',
            name: 'Import Google Sheet',
            callback: async () => {
                await this.importGoogleFile('sheets');
            }
        });

        this.addCommand({
            id: 'import-google-slides',
            name: 'Import Google Slides',
            callback: async () => {
                await this.importGoogleFile('slides');
            }
        });

        this.addCommand({
            id: 'import-google-form',
            name: 'Import Google Form',
            callback: async () => {
                await this.importGoogleFile('forms');
            }
        });

        this.addCommand({
            id: 'export-to-google-docs',
            name: 'Export Note to Google Docs',
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile && activeFile.extension === 'md') {
                    if (!checking) {
                        this.exportToGoogleDocs(activeFile);
                    }
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'export-to-google-sheets',
            name: 'Export Note to Google Sheets',
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile && activeFile.extension === 'md') {
                    if (!checking) {
                        this.exportToGoogleSheets(activeFile);
                    }
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'create-new-google-doc',
            name: 'Create New Google Doc',
            callback: async () => {
                await this.createNewGoogleDoc();
            }
        });

        this.addCommand({
            id: 'sync-with-google',
            name: 'Sync with Google',
            callback: async () => {
                await this.syncLinkedFiles();
            }
        });

        this.addCommand({
            id: 'open-ai-workspace-creator',
            name: 'AI Workspace Creator',
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile && activeFile.extension === 'md') {
                    if (!checking) {
                        new AIWorkspaceModal(this.app, this).open();
                    }
                    return true;
                }
                return false;
            }
        });

        this.addSettingTab(new WorkspaceConnectSettingTab(this.app, this));
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(WORKSPACE_VIEW_TYPE);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: WORKSPACE_VIEW_TYPE, active: true });
            }
        }
        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    async importGoogleFile(type: 'docs' | 'sheets' | 'slides' | 'forms') {
        if (!this.isAuthenticated()) {
            new Notice('Please connect to Google first in settings');
            return;
        }

        try {
            const files = await this.driveService.listFiles(type);

            new GoogleFilePicker(this.app, files, async (selectedFile) => {
                new Notice(`Importing: ${selectedFile.name}`);

                let markdown = '';

                switch (type) {
                    case 'docs':
                        const docsContent = await this.docsService.getDocument(selectedFile.id);
                        markdown = DocsConverter.toMarkdown(docsContent);
                        break;
                    case 'sheets':
                        const sheetsContent = await this.sheetsService.getSpreadsheet(selectedFile.id);
                        markdown = SheetsConverter.toMarkdown(sheetsContent);
                        break;
                    case 'slides':
                        const slidesContent = await this.slidesService.getPresentation(selectedFile.id);
                        markdown = SlidesConverter.toMarkdown(slidesContent);
                        break;
                    case 'forms':
                        const formsContent = await this.formsService.getForm(selectedFile.id);
                        markdown = FormsConverter.toMarkdown(formsContent);
                        break;
                }

                // Create note in vault
                const folder = this.settings.defaultImportFolder;
                const fileName = this.sanitizeFileName(selectedFile.name) + '.md';
                const filePath = folder ? `${folder}/${fileName}` : fileName;

                // Ensure folder exists
                if (folder) {
                    const folderExists = this.app.vault.getAbstractFileByPath(folder);
                    if (!folderExists) {
                        await this.app.vault.createFolder(folder);
                    }
                }

                // Check for existing file
                let finalPath = filePath;
                let counter = 1;
                while (this.app.vault.getAbstractFileByPath(finalPath)) {
                    const baseName = this.sanitizeFileName(selectedFile.name);
                    finalPath = folder ? `${folder}/${baseName} ${counter}.md` : `${baseName} ${counter}.md`;
                    counter++;
                }

                const file = await this.app.vault.create(finalPath, markdown);

                // Add to linked files
                this.settings.linkedFiles.push({
                    localPath: finalPath,
                    googleFileId: selectedFile.id,
                    googleFileType: type,
                    lastSyncedAt: new Date().toISOString(),
                    googleFileName: selectedFile.name
                });
                await this.saveSettings();

                new Notice(`Imported: ${file.basename}`);

                // Open the file
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.openFile(file);

            }).open();

        } catch (e: any) {
            new Notice(`Import failed: ${e.message}`);
            console.error('Import error:', e);
        }
    }

    async exportToGoogleDocs(file: TFile) {
        if (!this.isAuthenticated()) {
            new Notice('Please connect to Google first in settings');
            return;
        }

        try {
            const content = await this.app.vault.read(file);

            // Check if this file is already linked
            const linked = this.settings.linkedFiles.find(l => l.localPath === file.path);

            if (linked && linked.googleFileType === 'docs') {
                // Update existing document
                await this.docsService.updateDocument(linked.googleFileId, content);
                linked.lastSyncedAt = new Date().toISOString();
                await this.saveSettings();
                new Notice(`Updated Google Doc: ${linked.googleFileName}`);
            } else {
                // Create new document
                const docId = await this.docsService.createDocument(file.basename, content);

                this.settings.linkedFiles.push({
                    localPath: file.path,
                    googleFileId: docId,
                    googleFileType: 'docs',
                    lastSyncedAt: new Date().toISOString(),
                    googleFileName: file.basename
                });
                await this.saveSettings();
                new Notice(`Created Google Doc: ${file.basename}`);
            }
        } catch (e: any) {
            new Notice(`Export failed: ${e.message}`);
            console.error('Export error:', e);
        }
    }

    async exportToGoogleSheets(file: TFile) {
        if (!this.isAuthenticated()) {
            new Notice('Please connect to Google first in settings');
            return;
        }

        try {
            const content = await this.app.vault.read(file);
            const tables = SheetsConverter.extractTables(content);

            if (tables.length === 0) {
                new Notice('No tables found in this note');
                return;
            }

            // Check if this file is already linked
            const linked = this.settings.linkedFiles.find(l => l.localPath === file.path && l.googleFileType === 'sheets');

            if (linked) {
                // Update existing spreadsheet
                await this.sheetsService.updateSpreadsheet(linked.googleFileId, tables[0]);
                linked.lastSyncedAt = new Date().toISOString();
                await this.saveSettings();
                new Notice(`Updated Google Sheet: ${linked.googleFileName}`);
            } else {
                // Create new spreadsheet
                const sheetId = await this.sheetsService.createSpreadsheet(file.basename, tables[0]);

                this.settings.linkedFiles.push({
                    localPath: file.path,
                    googleFileId: sheetId,
                    googleFileType: 'sheets',
                    lastSyncedAt: new Date().toISOString(),
                    googleFileName: file.basename
                });
                await this.saveSettings();
                new Notice(`Created Google Sheet: ${file.basename}`);
            }
        } catch (e: any) {
            new Notice(`Export failed: ${e.message}`);
            console.error('Export error:', e);
        }
    }

    async createNewGoogleDoc() {
        if (!this.isAuthenticated()) {
            new Notice('Please connect to Google first in settings');
            return;
        }

        try {
            const activeFile = this.app.workspace.getActiveFile();
            let title = 'New Document';
            let content = '';

            if (activeFile && activeFile.extension === 'md') {
                title = activeFile.basename;
                content = await this.app.vault.read(activeFile);
            }

            const docId = await this.docsService.createDocument(title, content);

            if (activeFile) {
                this.settings.linkedFiles.push({
                    localPath: activeFile.path,
                    googleFileId: docId,
                    googleFileType: 'docs',
                    lastSyncedAt: new Date().toISOString(),
                    googleFileName: title
                });
                await this.saveSettings();
            }

            new Notice(`Created Google Doc: ${title}`);
        } catch (e: any) {
            new Notice(`Creation failed: ${e.message}`);
            console.error('Creation error:', e);
        }
    }

    async syncLinkedFiles() {
        if (!this.isAuthenticated()) {
            new Notice('Please connect to Google first in settings');
            return;
        }

        const linkedFiles = this.settings.linkedFiles;
        if (linkedFiles.length === 0) {
            new Notice('No linked files to sync');
            return;
        }

        new Notice(`Syncing ${linkedFiles.length} files...`);
        let synced = 0;
        let errors = 0;

        for (const linked of linkedFiles) {
            try {
                const localFile = this.app.vault.getAbstractFileByPath(linked.localPath);
                if (!localFile || !(localFile instanceof TFile)) {
                    continue;
                }

                // Get Google content
                let googleMarkdown = '';

                switch (linked.googleFileType) {
                    case 'docs':
                        const docsData = await this.docsService.getDocument(linked.googleFileId);
                        googleMarkdown = DocsConverter.toMarkdown(docsData);
                        break;
                    case 'sheets':
                        const sheetsData = await this.sheetsService.getSpreadsheet(linked.googleFileId);
                        googleMarkdown = SheetsConverter.toMarkdown(sheetsData);
                        break;
                    case 'slides':
                        const slidesData = await this.slidesService.getPresentation(linked.googleFileId);
                        googleMarkdown = SlidesConverter.toMarkdown(slidesData);
                        break;
                    case 'forms':
                        const formsData = await this.formsService.getForm(linked.googleFileId);
                        googleMarkdown = FormsConverter.toMarkdown(formsData);
                        break;
                }

                // Update local file with Google content
                await this.app.vault.modify(localFile, googleMarkdown);
                linked.lastSyncedAt = new Date().toISOString();
                synced++;

            } catch (e: any) {
                console.error(`Sync error for ${linked.localPath}:`, e);
                errors++;
            }
        }

        await this.saveSettings();
        new Notice(`Synced ${synced} files, ${errors} errors`);
    }

    isAuthenticated(): boolean {
        return !!(this.settings.accessToken && this.settings.refreshToken);
    }

    sanitizeFileName(name: string): string {
        return name.replace(/[\\/:*?"<>|]/g, '-');
    }

    onunload() {
        // Cleanup
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class WorkspaceConnectSettingTab extends PluginSettingTab {
    plugin: WorkspaceConnectPlugin;

    constructor(app: App, plugin: WorkspaceConnectPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Workspace Connect Settings' });

        // Connection Status
        const statusDiv = containerEl.createDiv({ cls: 'workspace-connect-status' });
        if (this.plugin.isAuthenticated()) {
            statusDiv.createEl('span', {
                text: 'Connected to Google',
                cls: 'status-connected'
            });
        } else {
            statusDiv.createEl('span', {
                text: 'Not connected',
                cls: 'status-disconnected'
            });
        }

        // OAuth Section
        containerEl.createEl('h3', { text: 'Google OAuth 2.0' });
        containerEl.createEl('p', {
            text: 'Create OAuth credentials in Google Cloud Console and enable required APIs (Docs, Sheets, Slides, Forms, Drive).',
            cls: 'setting-item-description'
        });

        new Setting(containerEl)
            .setName('Client ID')
            .setDesc('OAuth 2.0 Client ID from Google Cloud Console')
            .addText(text => text
                .setPlaceholder('xxxxx.apps.googleusercontent.com')
                .setValue(this.plugin.settings.clientId)
                .onChange(async (value) => {
                    this.plugin.settings.clientId = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Client Secret')
            .setDesc('OAuth 2.0 Client Secret')
            .addText(text => text
                .setPlaceholder('GOCSPX-xxxxx')
                .setValue(this.plugin.settings.clientSecret)
                .onChange(async (value) => {
                    this.plugin.settings.clientSecret = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Connect to Google')
            .setDesc('Authenticate with your Google account')
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
                        this.display();
                    } catch (e: any) {
                        new Notice(`Authentication failed: ${e.message}`);
                    }
                }));

        if (this.plugin.isAuthenticated()) {
            new Setting(containerEl)
                .setName('Disconnect')
                .setDesc('Remove Google account connection')
                .addButton(button => button
                    .setButtonText('Disconnect')
                    .onClick(async () => {
                        this.plugin.settings.accessToken = '';
                        this.plugin.settings.refreshToken = '';
                        this.plugin.settings.tokenExpiry = '';
                        await this.plugin.saveSettings();
                        new Notice('Disconnected from Google');
                        this.display();
                    }));
        }

        // Import Settings
        containerEl.createEl('h3', { text: 'Import Settings' });

        new Setting(containerEl)
            .setName('Default Import Folder')
            .setDesc('Folder where imported files will be saved (leave empty for vault root)')
            .addText(text => text
                .setPlaceholder('Google Imports')
                .setValue(this.plugin.settings.defaultImportFolder)
                .onChange(async (value) => {
                    this.plugin.settings.defaultImportFolder = value;
                    await this.plugin.saveSettings();
                }));

        // Linked Files
        containerEl.createEl('h3', { text: 'Linked Files' });

        const linkedFiles = this.plugin.settings.linkedFiles;
        if (linkedFiles.length === 0) {
            containerEl.createEl('p', {
                text: 'No files linked yet. Import or export files to create links.',
                cls: 'setting-item-description'
            });
        } else {
            const linkedList = containerEl.createDiv({ cls: 'linked-files-list' });

            linkedFiles.forEach((linked, index) => {
                const item = linkedList.createDiv({ cls: 'linked-file-item' });

                const info = item.createDiv({ cls: 'linked-file-info' });
                const typeIcon = linked.googleFileType === 'docs' ? '📄' :
                                linked.googleFileType === 'sheets' ? '📊' :
                                linked.googleFileType === 'slides' ? '📽️' : '📝';
                info.createEl('span', { text: `${typeIcon} ${linked.googleFileName}` });
                info.createEl('span', {
                    text: ` → ${linked.localPath}`,
                    cls: 'linked-file-path'
                });
                info.createEl('span', {
                    text: ` (synced: ${new Date(linked.lastSyncedAt).toLocaleDateString()})`,
                    cls: 'linked-file-date'
                });

                const removeBtn = item.createEl('button', {
                    text: 'Unlink',
                    cls: 'linked-file-remove'
                });
                removeBtn.addEventListener('click', async () => {
                    this.plugin.settings.linkedFiles.splice(index, 1);
                    await this.plugin.saveSettings();
                    this.display();
                });
            });
        }
    }
}
