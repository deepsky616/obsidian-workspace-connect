import { App, Modal, Notice, TFile, Setting, MarkdownView } from 'obsidian';
import WorkspaceConnectPlugin from '../../main';
import { NoteAnalyzer, NoteAnalysis, DocsAnalysis, SheetsAnalysis, SlidesAnalysis, FormsAnalysis, DetectedQuestion } from '../ai/NoteAnalyzer';
import { GoogleFilePicker } from './GoogleFilePicker';
import { SheetsConverter } from '../converters/SheetsConverter';

type TabType = 'docs' | 'sheets' | 'slides' | 'forms';
type SheetsMode = 'export' | 'import';

interface FormSettings {
    formType: 'quiz' | 'survey';
    collectEmail: boolean;
    shuffleQuestions: boolean;
    confirmationMessage: string;
    questions: DetectedQuestion[];
}

interface DocsSettings {
    title: string;
    includeTableOfContents: boolean;
    pageSize: 'letter' | 'a4';
}

interface SheetsSettings {
    title: string;
    selectedTableIndex: number;
    freezeFirstRow: boolean;
    mode: SheetsMode;
}

interface SlidesSettings {
    title: string;
    theme: 'professional' | 'academic' | 'creative' | 'minimal';
    includeNotes: boolean;
    slidesToInclude: boolean[];
}

export class AIWorkspaceModal extends Modal {
    private plugin: WorkspaceConnectPlugin;
    private analysis: NoteAnalysis | null = null;
    private activeTab: TabType = 'docs';
    private noteContent: string = '';
    private noteFile: TFile | null = null;
    private cursorLine: number = 0;
    private cursorCh: number = 0;

    private tabContainer: HTMLElement;
    private contentArea: HTMLElement;
    private footerArea: HTMLElement;

    private formSettings: FormSettings;
    private docsSettings: DocsSettings;
    private sheetsSettings: SheetsSettings;
    private slidesSettings: SlidesSettings;

    constructor(app: App, plugin: WorkspaceConnectPlugin) {
        super(app);
        this.plugin = plugin;

        this.formSettings = {
            formType: 'survey',
            collectEmail: false,
            shuffleQuestions: false,
            confirmationMessage: 'Your response has been recorded.',
            questions: [],
        };
        this.docsSettings = {
            title: '',
            includeTableOfContents: false,
            pageSize: 'letter',
        };
        this.sheetsSettings = {
            title: '',
            selectedTableIndex: 0,
            freezeFirstRow: true,
            mode: 'export',
        };
        this.slidesSettings = {
            title: '',
            theme: 'professional',
            includeNotes: true,
            slidesToInclude: [],
        };
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('ai-workspace-modal');
        this.modalEl.addClass('ai-workspace-modal-container');

        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView || !markdownView.file || markdownView.file.extension !== 'md') {
            contentEl.createEl('div', {
                cls: 'ai-workspace-empty',
                text: 'Please open a Markdown note first.',
            });
            return;
        }

        this.noteFile = markdownView.file;
        this.noteContent = await this.app.vault.read(this.noteFile);

        const editor = markdownView.editor;
        const cursor = editor.getCursor();
        this.cursorLine = cursor.line;
        this.cursorCh = cursor.ch;

        const loadingEl = contentEl.createEl('div', { cls: 'ai-workspace-loading' });
        loadingEl.createEl('div', { cls: 'ai-workspace-spinner' });
        loadingEl.createEl('div', { text: 'Analyzing note content...', cls: 'ai-workspace-loading-text' });

        await new Promise(resolve => setTimeout(resolve, 300));

        this.analysis = NoteAnalyzer.analyze(this.noteContent, this.noteFile.basename);
        this.initializeSettings();

        contentEl.empty();
        this.renderModal();
    }

    private initializeSettings() {
        if (!this.analysis) return;
        this.docsSettings.title = this.analysis.docs.suggestedTitle;
        this.sheetsSettings.title = this.analysis.title;
        this.slidesSettings.title = this.analysis.slides.suggestedTitle;
        this.slidesSettings.theme = this.analysis.slides.theme;
        this.slidesSettings.slidesToInclude = this.analysis.slides.slides.map(() => true);
        this.formSettings.formType = this.analysis.forms.isQuizLikely ? 'quiz' : 'survey';
        this.formSettings.questions = [...this.analysis.forms.questions];
    }

    private insertAtCursor(text: string) {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView) return;
        const editor = markdownView.editor;

        const lineContent = editor.getLine(this.cursorLine);
        let insertText = text;
        if (lineContent.trim().length > 0) {
            insertText = '\n' + text;
        }
        editor.replaceRange(insertText, { line: this.cursorLine, ch: this.cursorCh });
    }

    private linkFile(googleFileId: string, googleFileType: 'docs' | 'sheets' | 'slides' | 'forms', googleFileName: string) {
        if (!this.noteFile) return;
        this.plugin.settings.linkedFiles.push({
            localPath: this.noteFile.path,
            googleFileId,
            googleFileType,
            lastSyncedAt: new Date().toISOString(),
            googleFileName,
        });
        this.plugin.saveSettings();
    }

    private renderModal() {
        const { contentEl } = this;
        const header = contentEl.createEl('div', { cls: 'ai-workspace-header' });
        header.createEl('h2', { text: 'AI Workspace Creator' });
        const subtitle = header.createEl('div', { cls: 'ai-workspace-subtitle' });
        subtitle.createEl('span', { text: this.analysis?.title || '' });
        subtitle.createEl('span', {
            text: ` | ${this.analysis?.wordCount} words | ${this.analysis?.lineCount} lines`,
            cls: 'ai-workspace-meta',
        });

        this.tabContainer = contentEl.createEl('div', { cls: 'ai-workspace-tabs' });
        this.renderTabs();
        this.contentArea = contentEl.createEl('div', { cls: 'ai-workspace-content' });
        this.footerArea = contentEl.createEl('div', { cls: 'ai-workspace-footer' });
        this.renderTabContent();
    }

    private renderTabs() {
        this.tabContainer.empty();
        const tabs: { type: TabType; icon: string; label: string; badge?: string }[] = [
            { type: 'docs', icon: '📄', label: 'Docs', badge: this.analysis?.docs.contentType },
            { type: 'sheets', icon: '📊', label: 'Sheets', badge: this.analysis?.sheets.tables.length ? `${this.analysis.sheets.tables.length} tables` : undefined },
            { type: 'slides', icon: '📽️', label: 'Slides', badge: this.analysis?.slides.slides.length ? `${this.analysis.slides.slides.length} slides` : undefined },
            { type: 'forms', icon: '📝', label: 'Forms', badge: this.analysis?.forms.questions.length ? `${this.analysis.forms.questions.length} Q` : undefined },
        ];
        for (const tab of tabs) {
            const tabEl = this.tabContainer.createEl('button', {
                cls: `ai-workspace-tab ${this.activeTab === tab.type ? 'active' : ''}`,
            });
            tabEl.createEl('span', { text: tab.icon, cls: 'tab-icon' });
            tabEl.createEl('span', { text: tab.label, cls: 'tab-label' });
            if (tab.badge) { tabEl.createEl('span', { text: tab.badge, cls: 'tab-badge' }); }
            tabEl.addEventListener('click', () => {
                this.activeTab = tab.type;
                this.renderTabs();
                this.renderTabContent();
            });
        }
    }

    private renderTabContent() {
        this.contentArea.empty();
        this.footerArea.empty();
        if (!this.analysis) return;
        switch (this.activeTab) {
            case 'docs': this.renderDocsTab(this.analysis.docs); break;
            case 'sheets': this.renderSheetsTab(this.analysis.sheets); break;
            case 'slides': this.renderSlidesTab(this.analysis.slides); break;
            case 'forms': this.renderFormsTab(this.analysis.forms); break;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  DOCS TAB
    // ═══════════════════════════════════════════════════════════

    private renderDocsTab(docs: DocsAnalysis) {
        const container = this.contentArea.createEl('div', { cls: 'tab-panel' });

        const aiCard = container.createEl('div', { cls: 'ai-suggestion-card' });
        aiCard.createEl('div', { text: 'AI Analysis', cls: 'ai-card-label' });
        aiCard.createEl('div', { text: docs.summary, cls: 'ai-card-value' });
        const typeLabel = docs.contentType.charAt(0).toUpperCase() + docs.contentType.slice(1);
        aiCard.createEl('div', { text: `Detected type: ${typeLabel}`, cls: 'ai-card-detail' });

        const settingsContainer = container.createEl('div', { cls: 'settings-section' });
        settingsContainer.createEl('h4', { text: 'Document Settings' });

        new Setting(settingsContainer).setName('Title')
            .addText(text => text.setValue(this.docsSettings.title).onChange(v => { this.docsSettings.title = v; }));
        new Setting(settingsContainer).setName('Include Table of Contents')
            .addToggle(toggle => toggle.setValue(this.docsSettings.includeTableOfContents).onChange(v => { this.docsSettings.includeTableOfContents = v; }));
        new Setting(settingsContainer).setName('Page Size')
            .addDropdown(dd => dd.addOption('letter', 'Letter').addOption('a4', 'A4')
                .setValue(this.docsSettings.pageSize).onChange(v => { this.docsSettings.pageSize = v as 'letter' | 'a4'; }));

        if (docs.headings.length > 0) {
            const outlineSection = container.createEl('div', { cls: 'preview-section' });
            outlineSection.createEl('h4', { text: 'Document Outline' });
            const outlineList = outlineSection.createEl('div', { cls: 'outline-list' });
            for (const heading of docs.headings) {
                const item = outlineList.createEl('div', { cls: 'outline-item' });
                item.style.paddingLeft = `${(heading.level - 1) * 16}px`;
                item.createEl('span', { text: `H${heading.level}`, cls: 'outline-level' });
                item.createEl('span', { text: heading.text });
            }
        }

        this.renderStandardFooter('Google Doc', () => this.executeDocsCreate(false), () => this.executeDocsCreate(true));
    }

    private async executeDocsCreate(embedAtCursor: boolean) {
        if (!this.plugin.isAuthenticated()) { new Notice('Please connect to Google first in settings'); return; }
        try {
            new Notice('Creating Google Doc...');
            const docId = await this.plugin.docsService.createDocument(this.docsSettings.title, this.noteContent);
            this.linkFile(docId, 'docs', this.docsSettings.title);

            if (embedAtCursor) {
                const embed = [
                    '',
                    `> [!note] 📄 Google Doc: ${this.docsSettings.title}`,
                    `> [Open Document](https://docs.google.com/document/d/${docId}/edit)`,
                    '',
                ].join('\n');
                this.insertAtCursor(embed);
                new Notice('Google Doc created and embedded!');
            } else {
                window.open(`https://docs.google.com/document/d/${docId}/edit`);
                new Notice(`Created and opened: ${this.docsSettings.title}`);
            }
            this.close();
        } catch (e: any) { new Notice(`Failed: ${e.message}`); }
    }

    // ═══════════════════════════════════════════════════════════
    //  SHEETS TAB
    // ═══════════════════════════════════════════════════════════

    private renderSheetsTab(sheets: SheetsAnalysis) {
        const container = this.contentArea.createEl('div', { cls: 'tab-panel' });

        const modeSection = container.createEl('div', { cls: 'sheets-mode-toggle' });
        const exportModeBtn = modeSection.createEl('button', {
            text: '📤 Note → Google Sheets',
            cls: `sheets-mode-btn ${this.sheetsSettings.mode === 'export' ? 'active' : ''}`,
        });
        const importModeBtn = modeSection.createEl('button', {
            text: '📥 Google Sheets → Note',
            cls: `sheets-mode-btn ${this.sheetsSettings.mode === 'import' ? 'active' : ''}`,
        });
        exportModeBtn.addEventListener('click', () => { this.sheetsSettings.mode = 'export'; this.renderTabContent(); });
        importModeBtn.addEventListener('click', () => { this.sheetsSettings.mode = 'import'; this.renderTabContent(); });

        if (this.sheetsSettings.mode === 'export') {
            this.renderSheetsExport(container, sheets);
        } else {
            this.renderSheetsImport(container);
        }
    }

    private renderSheetsExport(container: HTMLElement, sheets: SheetsAnalysis) {
        if (!sheets.hasTabulableContent) {
            const emptyCard = container.createEl('div', { cls: 'ai-suggestion-card warning' });
            emptyCard.createEl('div', { text: 'No tabular data detected', cls: 'ai-card-label' });
            emptyCard.createEl('div', { text: 'Add markdown tables or lists to your note to export.', cls: 'ai-card-value' });
            return;
        }

        const aiCard = container.createEl('div', { cls: 'ai-suggestion-card' });
        aiCard.createEl('div', { text: 'AI Analysis', cls: 'ai-card-label' });
        const stats: string[] = [];
        if (sheets.tables.length > 0) stats.push(`${sheets.tables.length} table(s)`);
        if (sheets.lists.length > 0) stats.push(`${sheets.lists.length} list(s)`);
        if (sheets.numericalData.length > 0) stats.push(`${sheets.numericalData.length} data points`);
        aiCard.createEl('div', { text: stats.join(' | '), cls: 'ai-card-value' });
        if (sheets.suggestedChartType !== 'none') {
            aiCard.createEl('div', { text: `Suggested chart: ${sheets.suggestedChartType}`, cls: 'ai-card-detail' });
        }

        const settingsContainer = container.createEl('div', { cls: 'settings-section' });
        settingsContainer.createEl('h4', { text: 'Export Settings' });

        new Setting(settingsContainer).setName('Sheet Title')
            .addText(text => text.setValue(this.sheetsSettings.title).onChange(v => { this.sheetsSettings.title = v; }));

        if (sheets.tables.length > 1) {
            new Setting(settingsContainer).setName('Select Table')
                .addDropdown(dd => {
                    sheets.tables.forEach((table, i) => {
                        dd.addOption(i.toString(), `Table ${i + 1} (${table.headers.join(', ').substring(0, 40)}...)`);
                    });
                    dd.setValue(this.sheetsSettings.selectedTableIndex.toString());
                    dd.onChange(v => { this.sheetsSettings.selectedTableIndex = parseInt(v); this.renderTabContent(); });
                });
        }

        new Setting(settingsContainer).setName('Freeze First Row')
            .addToggle(toggle => toggle.setValue(this.sheetsSettings.freezeFirstRow).onChange(v => { this.sheetsSettings.freezeFirstRow = v; }));

        if (sheets.tables.length > 0) {
            const previewSection = container.createEl('div', { cls: 'preview-section' });
            previewSection.createEl('h4', { text: 'Table Preview' });
            this.renderTablePreview(previewSection, sheets.tables[this.sheetsSettings.selectedTableIndex]);
        }

        if (sheets.lists.length > 0 && sheets.tables.length === 0) {
            const listSection = container.createEl('div', { cls: 'preview-section' });
            listSection.createEl('h4', { text: 'Lists (will be converted to rows)' });
            for (const list of sheets.lists) {
                const listCard = listSection.createEl('div', { cls: 'list-preview-card' });
                if (list.title) listCard.createEl('div', { text: list.title, cls: 'list-title' });
                listCard.createEl('div', { text: `${list.items.length} items`, cls: 'list-count' });
            }
        }

        const leftActions = this.footerArea.createEl('div', { cls: 'footer-left' });
        const rightActions = this.footerArea.createEl('div', { cls: 'footer-right' });

        const embedBtn = leftActions.createEl('button', { text: 'Export & Embed Link at Cursor', cls: 'ai-workspace-action-btn embed-btn' });
        embedBtn.addEventListener('click', () => this.executeSheetsExport(true));

        const openBtn = rightActions.createEl('button', { text: 'Export & Open in Browser', cls: 'mod-cta ai-workspace-action-btn' });
        openBtn.addEventListener('click', () => this.executeSheetsExport(false));
    }

    private renderSheetsImport(container: HTMLElement) {
        const infoCard = container.createEl('div', { cls: 'ai-suggestion-card' });
        infoCard.createEl('div', { text: 'Import from Google Sheets', cls: 'ai-card-label' });
        infoCard.createEl('div', {
            text: 'Select a Google Sheet to import its data as a Markdown table at the current cursor position.',
            cls: 'ai-card-value',
        });

        const linkedSheets = this.plugin.settings.linkedFiles.filter(f => f.googleFileType === 'sheets');
        if (linkedSheets.length > 0) {
            const linkedSection = container.createEl('div', { cls: 'preview-section' });
            linkedSection.createEl('h4', { text: 'Linked Sheets' });
            for (const linked of linkedSheets) {
                const card = linkedSection.createEl('div', { cls: 'linked-sheet-card' });
                card.createEl('span', { text: `📊 ${linked.googleFileName}`, cls: 'linked-sheet-name' });
                const btn = card.createEl('button', { text: 'Import at Cursor', cls: 'ai-workspace-action-btn' });
                btn.addEventListener('click', () => this.executeSheetsImportById(linked.googleFileId, linked.googleFileName));
            }
        }

        const rightActions = this.footerArea.createEl('div', { cls: 'footer-right' });
        const browseBtn = rightActions.createEl('button', { text: 'Browse Google Sheets...', cls: 'mod-cta ai-workspace-action-btn' });
        browseBtn.addEventListener('click', () => this.executeSheetsImportBrowse());
    }

    private renderTablePreview(container: HTMLElement, table: { headers: string[]; rows: string[][] }) {
        if (!table) return;
        const tableEl = container.createEl('table', { cls: 'preview-table' });
        const thead = tableEl.createEl('thead');
        const headerRow = thead.createEl('tr');
        for (const h of table.headers) { headerRow.createEl('th', { text: h }); }
        const tbody = tableEl.createEl('tbody');
        for (const row of table.rows.slice(0, 5)) {
            const tr = tbody.createEl('tr');
            for (const cell of row) { tr.createEl('td', { text: cell }); }
        }
        if (table.rows.length > 5) {
            const moreRow = tbody.createEl('tr');
            const moreCell = moreRow.createEl('td', { text: `... and ${table.rows.length - 5} more rows`, cls: 'preview-more' });
            moreCell.colSpan = table.headers.length;
        }
    }

    private async executeSheetsExport(embedAtCursor: boolean) {
        if (!this.plugin.isAuthenticated()) { new Notice('Please connect to Google first in settings'); return; }
        if (!this.analysis) return;
        try {
            new Notice('Creating Google Sheet...');
            let data: string[][] = [];
            if (this.analysis.sheets.tables.length > 0) {
                const table = this.analysis.sheets.tables[this.sheetsSettings.selectedTableIndex];
                data = [table.headers, ...table.rows];
            } else if (this.analysis.sheets.lists.length > 0) {
                for (const list of this.analysis.sheets.lists) {
                    data.push([list.title || 'Item']);
                    for (const item of list.items) { data.push([item]); }
                }
            }
            const sheetId = await this.plugin.sheetsService.createSpreadsheet(this.sheetsSettings.title, data);
            this.linkFile(sheetId, 'sheets', this.sheetsSettings.title);

            if (embedAtCursor) {
                const embed = [
                    '',
                    `> [!note] 📊 Google Sheet: ${this.sheetsSettings.title}`,
                    `> [Open Spreadsheet](https://docs.google.com/spreadsheets/d/${sheetId}/edit)`,
                    '',
                ].join('\n');
                this.insertAtCursor(embed);
                new Notice('Google Sheet created and embedded!');
            } else {
                window.open(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
                new Notice(`Created and opened: ${this.sheetsSettings.title}`);
            }
            this.close();
        } catch (e: any) { new Notice(`Failed: ${e.message}`); }
    }

    private async executeSheetsImportById(sheetId: string, sheetName: string) {
        if (!this.plugin.isAuthenticated()) { new Notice('Please connect to Google first in settings'); return; }
        try {
            new Notice(`Importing: ${sheetName}...`);
            const values = await this.plugin.sheetsService.getSheetValues(sheetId);
            if (values.length === 0) { new Notice('Sheet is empty'); return; }
            const markdownTable = SheetsConverter.arrayToMarkdownTable(values);
            this.insertAtCursor('\n' + markdownTable + '\n');
            new Notice(`Imported ${values.length} rows from "${sheetName}"`);
            this.close();
        } catch (e: any) { new Notice(`Import failed: ${e.message}`); }
    }

    private async executeSheetsImportBrowse() {
        if (!this.plugin.isAuthenticated()) { new Notice('Please connect to Google first in settings'); return; }
        try {
            const files = await this.plugin.driveService.listFiles('sheets');
            const savedCursorLine = this.cursorLine;
            const savedCursorCh = this.cursorCh;
            this.close();

            new GoogleFilePicker(this.app, files, async (selectedFile) => {
                try {
                    new Notice(`Importing: ${selectedFile.name}...`);
                    const values = await this.plugin.sheetsService.getSheetValues(selectedFile.id);
                    if (values.length === 0) { new Notice('Sheet is empty'); return; }
                    const markdownTable = SheetsConverter.arrayToMarkdownTable(values);

                    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (mdView) {
                        mdView.editor.replaceRange('\n' + markdownTable + '\n', { line: savedCursorLine, ch: savedCursorCh });
                    }

                    this.linkFile(selectedFile.id, 'sheets', selectedFile.name);
                    new Notice(`Imported ${values.length} rows from "${selectedFile.name}"`);
                } catch (e: any) { new Notice(`Import failed: ${e.message}`); }
            }).open();
        } catch (e: any) { new Notice(`Failed to list sheets: ${e.message}`); }
    }

    // ═══════════════════════════════════════════════════════════
    //  SLIDES TAB
    // ═══════════════════════════════════════════════════════════

    private renderSlidesTab(slides: SlidesAnalysis) {
        const container = this.contentArea.createEl('div', { cls: 'tab-panel' });

        const aiCard = container.createEl('div', { cls: 'ai-suggestion-card' });
        aiCard.createEl('div', { text: 'AI Analysis', cls: 'ai-card-label' });
        aiCard.createEl('div', {
            text: `${slides.slides.length} slides | ${slides.estimatedDuration} | ${slides.theme} theme`,
            cls: 'ai-card-value',
        });

        const settingsContainer = container.createEl('div', { cls: 'settings-section' });
        settingsContainer.createEl('h4', { text: 'Presentation Settings' });

        new Setting(settingsContainer).setName('Title')
            .addText(text => text.setValue(this.slidesSettings.title).onChange(v => { this.slidesSettings.title = v; }));
        new Setting(settingsContainer).setName('Theme')
            .addDropdown(dd => dd.addOption('professional', 'Professional').addOption('academic', 'Academic')
                .addOption('creative', 'Creative').addOption('minimal', 'Minimal')
                .setValue(this.slidesSettings.theme).onChange(v => { this.slidesSettings.theme = v as any; }));
        new Setting(settingsContainer).setName('Include Speaker Notes')
            .addToggle(toggle => toggle.setValue(this.slidesSettings.includeNotes).onChange(v => { this.slidesSettings.includeNotes = v; }));

        const slideList = container.createEl('div', { cls: 'slide-preview-list' });
        slideList.createEl('h4', { text: 'Slide Outline' });

        slides.slides.forEach((slide, index) => {
            const slideCard = slideList.createEl('div', { cls: 'slide-preview-card' });
            const slideHeader = slideCard.createEl('div', { cls: 'slide-preview-header' });
            const checkbox = slideHeader.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
            checkbox.checked = this.slidesSettings.slidesToInclude[index] ?? true;
            checkbox.addEventListener('change', () => { this.slidesSettings.slidesToInclude[index] = checkbox.checked; });
            slideHeader.createEl('span', { text: `${index + 1}. ${slide.title || '(Untitled)'}`, cls: 'slide-title' });
            slideHeader.createEl('span', { text: slide.layout, cls: 'slide-layout-badge' });

            if (slide.bulletPoints.length > 0) {
                const bulletList = slideCard.createEl('ul', { cls: 'slide-bullets' });
                for (const bullet of slide.bulletPoints.slice(0, 4)) { bulletList.createEl('li', { text: bullet }); }
                if (slide.bulletPoints.length > 4) {
                    bulletList.createEl('li', { text: `+${slide.bulletPoints.length - 4} more`, cls: 'slide-more' });
                }
            }
        });

        this.renderStandardFooter('Google Slides', () => this.executeSlidesCreate(false), () => this.executeSlidesCreate(true));
    }

    private async executeSlidesCreate(embedAtCursor: boolean) {
        if (!this.plugin.isAuthenticated()) { new Notice('Please connect to Google first in settings'); return; }
        if (!this.analysis) return;
        try {
            new Notice('Creating Google Slides...');
            const presentationId = await this.plugin.slidesService.createPresentation(this.slidesSettings.title);
            const selectedSlides = this.analysis.slides.slides.filter((_, i) => this.slidesSettings.slidesToInclude[i]);

            for (const slide of selectedSlides) {
                await this.plugin.slidesService.addSlide(presentationId, {
                    title: slide.title,
                    body: slide.bulletPoints.join('\n'),
                });
            }
            this.linkFile(presentationId, 'slides', this.slidesSettings.title);

            if (embedAtCursor) {
                const embed = [
                    '',
                    `> [!note] 📽️ Google Slides: ${this.slidesSettings.title}`,
                    `> ${selectedSlides.length} slides | ${this.analysis.slides.estimatedDuration}`,
                    `> [Open Presentation](https://docs.google.com/presentation/d/${presentationId}/edit)`,
                    `> [Start Slideshow](https://docs.google.com/presentation/d/${presentationId}/present)`,
                    '',
                ].join('\n');
                this.insertAtCursor(embed);
                new Notice('Google Slides created and embedded!');
            } else {
                window.open(`https://docs.google.com/presentation/d/${presentationId}/edit`);
                new Notice(`Created and opened: ${this.slidesSettings.title}`);
            }
            this.close();
        } catch (e: any) { new Notice(`Failed: ${e.message}`); }
    }

    // ═══════════════════════════════════════════════════════════
    //  FORMS TAB
    // ═══════════════════════════════════════════════════════════

    private renderFormsTab(forms: FormsAnalysis) {
        const container = this.contentArea.createEl('div', { cls: 'tab-panel' });

        const aiCard = container.createEl('div', { cls: 'ai-suggestion-card' });
        aiCard.createEl('div', { text: 'AI Analysis', cls: 'ai-card-label' });
        const formTypeBadge = forms.isQuizLikely ? 'Quiz detected' : forms.isSurveyLikely ? 'Survey detected' : 'General form';
        aiCard.createEl('div', { text: formTypeBadge, cls: 'ai-card-value' });
        aiCard.createEl('div', {
            text: `${forms.questions.length} questions found | ${forms.hasAnswerKey ? 'Answer key detected' : 'No answer key'}`,
            cls: 'ai-card-detail',
        });

        const settingsContainer = container.createEl('div', { cls: 'settings-section' });
        settingsContainer.createEl('h4', { text: 'Form Settings' });

        new Setting(settingsContainer).setName('Form Type')
            .setDesc('Quiz includes scoring and correct answers. Survey collects responses.')
            .addDropdown(dd => dd.addOption('quiz', 'Quiz').addOption('survey', 'Survey')
                .setValue(this.formSettings.formType).onChange(v => { this.formSettings.formType = v as 'quiz' | 'survey'; this.renderTabContent(); }));
        new Setting(settingsContainer).setName('Collect Email Addresses')
            .addToggle(toggle => toggle.setValue(this.formSettings.collectEmail).onChange(v => { this.formSettings.collectEmail = v; }));
        new Setting(settingsContainer).setName('Shuffle Question Order')
            .addToggle(toggle => toggle.setValue(this.formSettings.shuffleQuestions).onChange(v => { this.formSettings.shuffleQuestions = v; }));
        new Setting(settingsContainer).setName('Confirmation Message')
            .addText(text => text.setValue(this.formSettings.confirmationMessage).onChange(v => { this.formSettings.confirmationMessage = v; }));

        if (forms.questions.length > 0) {
            const questionsSection = container.createEl('div', { cls: 'questions-section' });
            questionsSection.createEl('h4', { text: 'Detected Questions' });

            forms.questions.forEach((question, index) => {
                const questionCard = questionsSection.createEl('div', { cls: 'question-card' });
                const questionHeader = questionCard.createEl('div', { cls: 'question-header' });
                questionHeader.createEl('span', { text: `Q${index + 1}`, cls: 'question-number' });
                questionHeader.createEl('span', { text: question.text, cls: 'question-text' });

                const questionMeta = questionCard.createEl('div', { cls: 'question-meta' });
                const typeMap: Record<string, string> = {
                    'multiple_choice': 'Multiple Choice', 'checkbox': 'Checkboxes',
                    'short_answer': 'Short Answer', 'paragraph': 'Paragraph',
                    'scale': 'Scale', 'dropdown': 'Dropdown',
                };
                questionMeta.createEl('span', { text: typeMap[question.type] || question.type, cls: 'question-type-badge' });
                if (question.required) { questionMeta.createEl('span', { text: 'Required', cls: 'question-required-badge' }); }
                if (this.formSettings.formType === 'quiz' && question.correctAnswer) {
                    questionMeta.createEl('span', { text: `Answer: ${question.correctAnswer}`, cls: 'question-answer-badge' });
                }

                if (question.options.length > 0) {
                    const optionsList = questionCard.createEl('div', { cls: 'question-options' });
                    for (const option of question.options) {
                        const optionEl = optionsList.createEl('div', { cls: 'question-option' });
                        const isRadio = question.type === 'multiple_choice' || question.type === 'dropdown';
                        optionEl.createEl('span', { text: isRadio ? '○' : '☐', cls: 'option-marker' });
                        optionEl.createEl('span', { text: option });
                    }
                }
            });
        } else {
            const emptyState = container.createEl('div', { cls: 'ai-suggestion-card warning' });
            emptyState.createEl('div', { text: 'No questions detected', cls: 'ai-card-label' });
            emptyState.createEl('div', {
                text: 'Add lines ending with "?" or use "Q:" prefix in your note to auto-detect questions.',
                cls: 'ai-card-value',
            });
        }

        const formTypeLabel = this.formSettings.formType === 'quiz' ? 'Quiz' : 'Form';
        this.renderStandardFooter(`Google ${formTypeLabel}`, () => this.executeFormsCreate(false), () => this.executeFormsCreate(true));
    }

    private async executeFormsCreate(embedAtCursor: boolean) {
        if (!this.plugin.isAuthenticated()) { new Notice('Please connect to Google first in settings'); return; }
        if (!this.analysis) return;
        try {
            const formTypeLabel = this.formSettings.formType === 'quiz' ? 'Quiz' : 'Form';
            new Notice(`Creating Google ${formTypeLabel}...`);

            const formId = await this.plugin.formsService.createForm(
                this.analysis.forms.suggestedTitle, this.analysis.forms.description
            );

            for (const question of this.formSettings.questions) {
                let qType: 'SHORT_ANSWER' | 'PARAGRAPH' | 'MULTIPLE_CHOICE' | 'CHECKBOXES' | 'DROPDOWN' | 'SCALE';
                switch (question.type) {
                    case 'multiple_choice': qType = 'MULTIPLE_CHOICE'; break;
                    case 'checkbox': qType = 'CHECKBOXES'; break;
                    case 'short_answer': qType = 'SHORT_ANSWER'; break;
                    case 'paragraph': qType = 'PARAGRAPH'; break;
                    case 'scale': qType = 'SCALE'; break;
                    case 'dropdown': qType = 'DROPDOWN'; break;
                    default: qType = 'SHORT_ANSWER';
                }
                await this.plugin.formsService.addQuestion(formId, question.text, qType, {
                    choices: question.options.length > 0 ? question.options : undefined,
                    required: question.required,
                });
            }

            this.linkFile(formId, 'forms', this.analysis.forms.suggestedTitle);

            if (embedAtCursor) {
                const embed = [
                    '',
                    `> [!info] 📝 ${formTypeLabel}: ${this.analysis.forms.suggestedTitle}`,
                    `> ${this.formSettings.questions.length} questions | ${formTypeLabel}`,
                    `> [Open ${formTypeLabel}](https://docs.google.com/forms/d/${formId}/viewform)`,
                    `> [Edit ${formTypeLabel}](https://docs.google.com/forms/d/${formId}/edit)`,
                    `> [View Responses](https://docs.google.com/forms/d/${formId}/edit#responses)`,
                    '',
                ].join('\n');
                this.insertAtCursor(embed);
                new Notice(`Google ${formTypeLabel} created and embedded!`);
            } else {
                window.open(`https://docs.google.com/forms/d/${formId}/edit`);
                new Notice(`Created and opened: ${this.analysis.forms.suggestedTitle}`);
            }
            this.close();
        } catch (e: any) { new Notice(`Failed: ${e.message}`); }
    }

    // ═══════════════════════════════════════════════════════════
    //  SHARED FOOTER
    // ═══════════════════════════════════════════════════════════

    private renderStandardFooter(label: string, onOpenBrowser: () => void, onEmbedAtCursor: () => void) {
        const leftActions = this.footerArea.createEl('div', { cls: 'footer-left' });
        const rightActions = this.footerArea.createEl('div', { cls: 'footer-right' });

        const embedBtn = leftActions.createEl('button', { text: 'Embed at Cursor', cls: 'ai-workspace-action-btn embed-btn' });
        embedBtn.addEventListener('click', onEmbedAtCursor);

        const openBtn = rightActions.createEl('button', { text: `Create & Open ${label}`, cls: 'mod-cta ai-workspace-action-btn' });
        openBtn.addEventListener('click', onOpenBrowser);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
