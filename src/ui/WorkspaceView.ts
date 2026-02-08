import { ItemView, WorkspaceLeaf, Notice, Menu } from 'obsidian';
import WorkspaceConnectPlugin, { LinkedFile } from '../../main';
import { GoogleFile } from '../services/DriveService';
import { GoogleFilePicker } from './GoogleFilePicker';
import { AIWorkspaceModal } from './AIWorkspaceModal';
import { DocsConverter } from '../converters/DocsConverter';
import { SheetsConverter } from '../converters/SheetsConverter';
import { SlidesConverter } from '../converters/SlidesConverter';
import { FormsConverter } from '../converters/FormsConverter';

export const WORKSPACE_VIEW_TYPE = 'workspace-connect-view';

export class WorkspaceView extends ItemView {
    plugin: WorkspaceConnectPlugin;
    private contentContainer: HTMLElement;
    private fileListContainer: HTMLElement;
    private statusEl: HTMLElement;

    constructor(leaf: WorkspaceLeaf, plugin: WorkspaceConnectPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return WORKSPACE_VIEW_TYPE;
    }

    getDisplayText() {
        return 'Workspace Connect';
    }

    getIcon() {
        return 'cloud';
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('workspace-connect-container');

        // Header
        const header = container.createDiv({ cls: 'workspace-header' });
        header.createEl('h3', { text: 'Google Workspace' });

        // Status indicator
        this.statusEl = header.createDiv({ cls: 'workspace-status' });
        this.updateStatus();

        // Main content
        this.contentContainer = container.createDiv({ cls: 'workspace-content' });

        const aiBtn = this.contentContainer.createEl('button', {
            text: '✨ AI Workspace Creator',
            cls: 'ai-workspace-creator-btn',
        });
        aiBtn.addEventListener('click', () => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile && activeFile.extension === 'md') {
                new AIWorkspaceModal(this.app, this.plugin).open();
            } else {
                new Notice('Please open a Markdown note first');
            }
        });

        const actionsSection = this.contentContainer.createDiv({ cls: 'workspace-actions' });
        actionsSection.createEl('h4', { text: 'Quick Actions' });

        const actionGrid = actionsSection.createDiv({ cls: 'action-grid' });

        // Import buttons
        this.createActionButton(actionGrid, '📄', 'Import Doc', () => this.plugin.importGoogleFile('docs'));
        this.createActionButton(actionGrid, '📊', 'Import Sheet', () => this.plugin.importGoogleFile('sheets'));
        this.createActionButton(actionGrid, '📽️', 'Import Slides', () => this.plugin.importGoogleFile('slides'));
        this.createActionButton(actionGrid, '📝', 'Import Form', () => this.plugin.importGoogleFile('forms'));

        // Export section
        const exportSection = this.contentContainer.createDiv({ cls: 'workspace-actions' });
        exportSection.createEl('h4', { text: 'Export Current Note' });

        const exportGrid = exportSection.createDiv({ cls: 'action-grid' });
        this.createActionButton(exportGrid, '📄', 'To Docs', async () => {
            const file = this.app.workspace.getActiveFile();
            if (file) {
                await this.plugin.exportToGoogleDocs(file);
            } else {
                new Notice('No active note to export');
            }
        });
        this.createActionButton(exportGrid, '📊', 'To Sheets', async () => {
            const file = this.app.workspace.getActiveFile();
            if (file) {
                await this.plugin.exportToGoogleSheets(file);
            } else {
                new Notice('No active note to export');
            }
        });

        // Sync button
        const syncSection = this.contentContainer.createDiv({ cls: 'workspace-sync' });
        const syncBtn = syncSection.createEl('button', {
            text: '🔄 Sync All Linked Files',
            cls: 'sync-btn'
        });
        syncBtn.addEventListener('click', () => this.plugin.syncLinkedFiles());

        // Linked files section
        const linkedSection = this.contentContainer.createDiv({ cls: 'workspace-linked' });
        linkedSection.createEl('h4', { text: 'Linked Files' });
        this.fileListContainer = linkedSection.createDiv({ cls: 'linked-files-container' });

        this.renderLinkedFiles();
    }

    private createActionButton(container: HTMLElement, icon: string, label: string, onClick: () => void) {
        const btn = container.createDiv({ cls: 'action-btn' });
        btn.createEl('span', { text: icon, cls: 'action-icon' });
        btn.createEl('span', { text: label, cls: 'action-label' });
        btn.addEventListener('click', onClick);
    }

    private updateStatus() {
        this.statusEl.empty();
        if (this.plugin.isAuthenticated()) {
            this.statusEl.createEl('span', { text: '● Connected', cls: 'status-connected' });
        } else {
            this.statusEl.createEl('span', { text: '○ Not connected', cls: 'status-disconnected' });
            const connectBtn = this.statusEl.createEl('button', {
                text: 'Connect',
                cls: 'connect-btn-small'
            });
            connectBtn.addEventListener('click', async () => {
                try {
                    await this.plugin.oauthManager.authenticate();
                    this.updateStatus();
                } catch (e: any) {
                    new Notice(`Connection failed: ${e.message}`);
                }
            });
        }
    }

    private renderLinkedFiles() {
        this.fileListContainer.empty();

        const linkedFiles = this.plugin.settings.linkedFiles;

        if (linkedFiles.length === 0) {
            this.fileListContainer.createEl('p', {
                text: 'No linked files yet',
                cls: 'empty-state'
            });
            return;
        }

        for (const linked of linkedFiles) {
            const item = this.fileListContainer.createDiv({ cls: 'linked-file-item' });

            // Icon
            const icon = this.getTypeIcon(linked.googleFileType);
            item.createEl('span', { text: icon, cls: 'linked-icon' });

            // Info
            const info = item.createDiv({ cls: 'linked-info' });
            info.createEl('div', { text: linked.googleFileName, cls: 'linked-name' });
            info.createEl('div', {
                text: `→ ${linked.localPath}`,
                cls: 'linked-path'
            });

            // Actions
            const actions = item.createDiv({ cls: 'linked-actions' });

            // Open local file
            const openBtn = actions.createEl('button', {
                text: '📂',
                attr: { 'aria-label': 'Open local file' }
            });
            openBtn.addEventListener('click', async () => {
                const file = this.app.vault.getAbstractFileByPath(linked.localPath);
                if (file) {
                    const leaf = this.app.workspace.getLeaf(false);
                    await leaf.openFile(file as any);
                } else {
                    new Notice('Local file not found');
                }
            });

            // Open in Google
            const googleBtn = actions.createEl('button', {
                text: '🔗',
                attr: { 'aria-label': 'Open in Google' }
            });
            googleBtn.addEventListener('click', () => {
                const url = this.getGoogleUrl(linked);
                window.open(url);
            });

            // Sync single file
            const syncBtn = actions.createEl('button', {
                text: '🔄',
                attr: { 'aria-label': 'Sync this file' }
            });
            syncBtn.addEventListener('click', async () => {
                await this.syncSingleFile(linked);
            });

            // Context menu
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showFileContextMenu(e, linked);
            });
        }
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

    private getGoogleUrl(linked: LinkedFile): string {
        switch (linked.googleFileType) {
            case 'docs':
                return `https://docs.google.com/document/d/${linked.googleFileId}/edit`;
            case 'sheets':
                return `https://docs.google.com/spreadsheets/d/${linked.googleFileId}/edit`;
            case 'slides':
                return `https://docs.google.com/presentation/d/${linked.googleFileId}/edit`;
            case 'forms':
                return `https://docs.google.com/forms/d/${linked.googleFileId}/edit`;
            default:
                return `https://drive.google.com/file/d/${linked.googleFileId}`;
        }
    }

    private async syncSingleFile(linked: LinkedFile) {
        try {
            new Notice(`Syncing ${linked.googleFileName}...`);

            const localFile = this.app.vault.getAbstractFileByPath(linked.localPath);
            if (!localFile) {
                new Notice('Local file not found');
                return;
            }

            let content: any;
            let markdown: string;

            switch (linked.googleFileType) {
                case 'docs':
                    content = await this.plugin.docsService.getDocument(linked.googleFileId);
                    markdown = DocsConverter.toMarkdown(content);
                    break;
                case 'sheets':
                    content = await this.plugin.sheetsService.getSpreadsheet(linked.googleFileId);
                    markdown = SheetsConverter.toMarkdown(content);
                    break;
                case 'slides':
                    content = await this.plugin.slidesService.getPresentation(linked.googleFileId);
                    markdown = SlidesConverter.toMarkdown(content);
                    break;
                case 'forms':
                    content = await this.plugin.formsService.getForm(linked.googleFileId);
                    markdown = FormsConverter.toMarkdown(content);
                    break;
                default:
                    throw new Error('Unknown file type');
            }

            await this.app.vault.modify(localFile as any, markdown);
            linked.lastSyncedAt = new Date().toISOString();
            await this.plugin.saveSettings();

            new Notice(`Synced: ${linked.googleFileName}`);

        } catch (e: any) {
            new Notice(`Sync failed: ${e.message}`);
        }
    }

    private showFileContextMenu(e: MouseEvent, linked: LinkedFile) {
        const menu = new Menu();

        menu.addItem((item) => {
            item.setTitle('Open Local File')
                .setIcon('file')
                .onClick(async () => {
                    const file = this.app.vault.getAbstractFileByPath(linked.localPath);
                    if (file) {
                        const leaf = this.app.workspace.getLeaf(false);
                        await leaf.openFile(file as any);
                    }
                });
        });

        menu.addItem((item) => {
            item.setTitle('Open in Google')
                .setIcon('external-link')
                .onClick(() => {
                    window.open(this.getGoogleUrl(linked));
                });
        });

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle('Sync from Google')
                .setIcon('refresh-cw')
                .onClick(() => this.syncSingleFile(linked));
        });

        if (linked.googleFileType === 'docs') {
            menu.addItem((item) => {
                item.setTitle('Push to Google')
                    .setIcon('upload')
                    .onClick(async () => {
                        const file = this.app.vault.getAbstractFileByPath(linked.localPath);
                        if (file) {
                            const content = await this.app.vault.read(file as any);
                            await this.plugin.docsService.updateDocument(linked.googleFileId, content);
                            new Notice(`Pushed to Google: ${linked.googleFileName}`);
                        }
                    });
            });
        }

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle('Unlink')
                .setIcon('unlink')
                .onClick(async () => {
                    const index = this.plugin.settings.linkedFiles.indexOf(linked);
                    if (index > -1) {
                        this.plugin.settings.linkedFiles.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.renderLinkedFiles();
                        new Notice('File unlinked');
                    }
                });
        });

        menu.showAtPosition({ x: e.pageX, y: e.pageY });
    }

    async onClose() {
        // Cleanup
    }
}
