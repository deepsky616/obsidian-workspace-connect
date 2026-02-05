import { App, Modal } from 'obsidian';
import { GoogleFile } from '../services/DriveService';

export class GoogleFilePicker extends Modal {
    files: GoogleFile[];
    onChoose: (file: GoogleFile) => void;
    filteredFiles: GoogleFile[];
    searchInput: HTMLInputElement;
    listContainer: HTMLElement;

    constructor(app: App, files: GoogleFile[], onChoose: (file: GoogleFile) => void) {
        super(app);
        this.files = files;
        this.filteredFiles = files;
        this.onChoose = onChoose;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('google-file-picker');

        // Header
        contentEl.createEl('h2', { text: 'Select a Google File' });

        // Search input
        this.searchInput = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Search files...',
            cls: 'google-file-search'
        });

        this.searchInput.addEventListener('input', () => {
            this.filterFiles(this.searchInput.value);
        });

        // File list container
        this.listContainer = contentEl.createDiv({ cls: 'google-file-list' });

        // Initial render
        this.renderFiles();

        // Focus search input
        setTimeout(() => this.searchInput.focus(), 50);
    }

    filterFiles(searchTerm: string) {
        const term = searchTerm.toLowerCase();
        if (!term) {
            this.filteredFiles = this.files;
        } else {
            this.filteredFiles = this.files.filter(f =>
                f.name.toLowerCase().includes(term)
            );
        }
        this.renderFiles();
    }

    renderFiles() {
        this.listContainer.empty();

        if (this.filteredFiles.length === 0) {
            this.listContainer.createEl('div', {
                text: 'No files found',
                cls: 'google-file-empty'
            });
            return;
        }

        for (const file of this.filteredFiles) {
            const fileItem = this.listContainer.createDiv({ cls: 'google-file-item' });

            // File icon based on type
            const icon = this.getFileIcon(file.mimeType);
            fileItem.createEl('span', { text: icon, cls: 'google-file-icon' });

            // File info
            const fileInfo = fileItem.createDiv({ cls: 'google-file-info' });
            fileInfo.createEl('div', { text: file.name, cls: 'google-file-name' });

            const modifiedDate = new Date(file.modifiedTime).toLocaleDateString();
            fileInfo.createEl('div', { text: `Modified: ${modifiedDate}`, cls: 'google-file-date' });

            // Click handler
            fileItem.addEventListener('click', () => {
                this.onChoose(file);
                this.close();
            });

            // Keyboard navigation
            fileItem.tabIndex = 0;
            fileItem.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.onChoose(file);
                    this.close();
                }
            });
        }
    }

    getFileIcon(mimeType: string): string {
        switch (mimeType) {
            case 'application/vnd.google-apps.document':
                return '📄';
            case 'application/vnd.google-apps.spreadsheet':
                return '📊';
            case 'application/vnd.google-apps.presentation':
                return '📽️';
            case 'application/vnd.google-apps.form':
                return '📝';
            default:
                return '📁';
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * File type filter picker
 */
export class FileTypePickerModal extends Modal {
    onChoose: (type: 'docs' | 'sheets' | 'slides' | 'forms') => void;

    constructor(app: App, onChoose: (type: 'docs' | 'sheets' | 'slides' | 'forms') => void) {
        super(app);
        this.onChoose = onChoose;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('google-type-picker');

        contentEl.createEl('h2', { text: 'Select File Type' });

        const types: { type: 'docs' | 'sheets' | 'slides' | 'forms'; icon: string; label: string }[] = [
            { type: 'docs', icon: '📄', label: 'Google Docs' },
            { type: 'sheets', icon: '📊', label: 'Google Sheets' },
            { type: 'slides', icon: '📽️', label: 'Google Slides' },
            { type: 'forms', icon: '📝', label: 'Google Forms' }
        ];

        const typeList = contentEl.createDiv({ cls: 'google-type-list' });

        for (const { type, icon, label } of types) {
            const typeItem = typeList.createDiv({ cls: 'google-type-item' });
            typeItem.createEl('span', { text: icon, cls: 'google-type-icon' });
            typeItem.createEl('span', { text: label, cls: 'google-type-label' });

            typeItem.addEventListener('click', () => {
                this.onChoose(type);
                this.close();
            });
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
