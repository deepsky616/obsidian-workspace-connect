import { App, Modal, Notice, TFile, Setting, ToggleComponent, DropdownComponent, TextComponent } from 'obsidian';
import WorkspaceConnectPlugin from '../../main';
import { NoteAnalyzer, NoteAnalysis, DocsAnalysis, SheetsAnalysis, SlidesAnalysis, FormsAnalysis, DetectedQuestion } from '../ai/NoteAnalyzer';

type TabType = 'docs' | 'sheets' | 'slides' | 'forms';

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
    includeCharts: boolean;
    freezeFirstRow: boolean;
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
            includeCharts: false,
            freezeFirstRow: true,
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

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            contentEl.createEl('div', {
                cls: 'ai-workspace-empty',
                text: 'Please open a Markdown note first.',
            });
            return;
        }

        this.noteFile = activeFile;
        this.noteContent = await this.app.vault.read(activeFile);

        const loadingEl = contentEl.createEl('div', { cls: 'ai-workspace-loading' });
        loadingEl.createEl('div', { cls: 'ai-workspace-spinner' });
        loadingEl.createEl('div', { text: 'Analyzing note content...', cls: 'ai-workspace-loading-text' });

        await new Promise(resolve => setTimeout(resolve, 300));

        this.analysis = NoteAnalyzer.analyze(this.noteContent, activeFile.basename);
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
            if (tab.badge) {
                tabEl.createEl('span', { text: tab.badge, cls: 'tab-badge' });
            }

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
            case 'docs':
                this.renderDocsTab(this.analysis.docs);
                break;
            case 'sheets':
                this.renderSheetsTab(this.analysis.sheets);
                break;
            case 'slides':
                this.renderSlidesTab(this.analysis.slides);
                break;
            case 'forms':
                this.renderFormsTab(this.analysis.forms);
                break;
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

        new Setting(settingsContainer)
            .setName('Title')
            .addText(text => text
                .setValue(this.docsSettings.title)
                .onChange(v => { this.docsSettings.title = v; }));

        new Setting(settingsContainer)
            .setName('Include Table of Contents')
            .addToggle(toggle => toggle
                .setValue(this.docsSettings.includeTableOfContents)
                .onChange(v => { this.docsSettings.includeTableOfContents = v; }));

        new Setting(settingsContainer)
            .setName('Page Size')
            .addDropdown(dropdown => dropdown
                .addOption('letter', 'Letter')
                .addOption('a4', 'A4')
                .setValue(this.docsSettings.pageSize)
                .onChange(v => { this.docsSettings.pageSize = v as 'letter' | 'a4'; }));

        if (docs.headings.length > 0) {
            const outlineSection = container.createEl('div', { cls: 'preview-section' });
            outlineSection.createEl('h4', { text: 'Document Outline' });
            const outlineList = outlineSection.createEl('div', { cls: 'outline-list' });
            for (const heading of docs.headings) {
                const indent = (heading.level - 1) * 16;
                const item = outlineList.createEl('div', { cls: 'outline-item' });
                item.style.paddingLeft = `${indent}px`;
                item.createEl('span', { text: `H${heading.level}`, cls: 'outline-level' });
                item.createEl('span', { text: heading.text });
            }
        }

        this.renderDocsFooter();
    }

    private renderDocsFooter() {
        const createBtn = this.footerArea.createEl('button', {
            text: 'Create Google Doc',
            cls: 'mod-cta ai-workspace-action-btn',
        });
        createBtn.addEventListener('click', async () => {
            await this.createGoogleDoc();
        });

        const openBtn = this.footerArea.createEl('button', {
            text: 'Export & Open in Browser',
            cls: 'ai-workspace-action-btn',
        });
        openBtn.addEventListener('click', async () => {
            await this.createGoogleDoc(true);
        });
    }

    private async createGoogleDoc(openInBrowser: boolean = false) {
        if (!this.plugin.isAuthenticated()) {
            new Notice('Please connect to Google first in settings');
            return;
        }

        try {
            new Notice('Creating Google Doc...');
            const docId = await this.plugin.docsService.createDocument(
                this.docsSettings.title,
                this.noteContent
            );

            if (this.noteFile) {
                this.plugin.settings.linkedFiles.push({
                    localPath: this.noteFile.path,
                    googleFileId: docId,
                    googleFileType: 'docs',
                    lastSyncedAt: new Date().toISOString(),
                    googleFileName: this.docsSettings.title,
                });
                await this.plugin.saveSettings();
            }

            new Notice(`Created: ${this.docsSettings.title}`);

            if (openInBrowser) {
                window.open(`https://docs.google.com/document/d/${docId}/edit`);
            }

            this.close();
        } catch (e: any) {
            new Notice(`Failed: ${e.message}`);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  SHEETS TAB
    // ═══════════════════════════════════════════════════════════

    private renderSheetsTab(sheets: SheetsAnalysis) {
        const container = this.contentArea.createEl('div', { cls: 'tab-panel' });

        if (!sheets.hasTabulableContent) {
            const emptyCard = container.createEl('div', { cls: 'ai-suggestion-card warning' });
            emptyCard.createEl('div', { text: 'No tabular data detected', cls: 'ai-card-label' });
            emptyCard.createEl('div', {
                text: 'Add tables, lists, or numerical data to your note to enable Sheets export.',
                cls: 'ai-card-value',
            });
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
        settingsContainer.createEl('h4', { text: 'Spreadsheet Settings' });

        new Setting(settingsContainer)
            .setName('Title')
            .addText(text => text
                .setValue(this.sheetsSettings.title)
                .onChange(v => { this.sheetsSettings.title = v; }));

        if (sheets.tables.length > 1) {
            new Setting(settingsContainer)
                .setName('Select Table')
                .addDropdown(dropdown => {
                    sheets.tables.forEach((table, i) => {
                        dropdown.addOption(i.toString(), `Table ${i + 1} (${table.headers.join(', ').substring(0, 40)}...)`);
                    });
                    dropdown.setValue(this.sheetsSettings.selectedTableIndex.toString());
                    dropdown.onChange(v => { this.sheetsSettings.selectedTableIndex = parseInt(v); this.renderTabContent(); });
                });
        }

        new Setting(settingsContainer)
            .setName('Freeze First Row')
            .addToggle(toggle => toggle
                .setValue(this.sheetsSettings.freezeFirstRow)
                .onChange(v => { this.sheetsSettings.freezeFirstRow = v; }));

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

        this.renderSheetsFooter();
    }

    private renderTablePreview(container: HTMLElement, table: { headers: string[]; rows: string[][] }) {
        if (!table) return;

        const tableEl = container.createEl('table', { cls: 'preview-table' });
        const thead = tableEl.createEl('thead');
        const headerRow = thead.createEl('tr');
        for (const header of table.headers) {
            headerRow.createEl('th', { text: header });
        }

        const tbody = tableEl.createEl('tbody');
        const previewRows = table.rows.slice(0, 5);
        for (const row of previewRows) {
            const tr = tbody.createEl('tr');
            for (const cell of row) {
                tr.createEl('td', { text: cell });
            }
        }

        if (table.rows.length > 5) {
            const moreRow = tbody.createEl('tr');
            const moreCell = moreRow.createEl('td', {
                text: `... and ${table.rows.length - 5} more rows`,
                cls: 'preview-more',
            });
            moreCell.colSpan = table.headers.length;
        }
    }

    private renderSheetsFooter() {
        const createBtn = this.footerArea.createEl('button', {
            text: 'Create Google Sheet',
            cls: 'mod-cta ai-workspace-action-btn',
        });
        createBtn.addEventListener('click', async () => {
            await this.createGoogleSheet();
        });

        const openBtn = this.footerArea.createEl('button', {
            text: 'Export & Open in Browser',
            cls: 'ai-workspace-action-btn',
        });
        openBtn.addEventListener('click', async () => {
            await this.createGoogleSheet(true);
        });
    }

    private async createGoogleSheet(openInBrowser: boolean = false) {
        if (!this.plugin.isAuthenticated()) {
            new Notice('Please connect to Google first in settings');
            return;
        }
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
                    for (const item of list.items) {
                        data.push([item]);
                    }
                }
            }

            const sheetId = await this.plugin.sheetsService.createSpreadsheet(this.sheetsSettings.title, data);

            if (this.noteFile) {
                this.plugin.settings.linkedFiles.push({
                    localPath: this.noteFile.path,
                    googleFileId: sheetId,
                    googleFileType: 'sheets',
                    lastSyncedAt: new Date().toISOString(),
                    googleFileName: this.sheetsSettings.title,
                });
                await this.plugin.saveSettings();
            }

            new Notice(`Created: ${this.sheetsSettings.title}`);

            if (openInBrowser) {
                window.open(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
            }

            this.close();
        } catch (e: any) {
            new Notice(`Failed: ${e.message}`);
        }
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

        new Setting(settingsContainer)
            .setName('Title')
            .addText(text => text
                .setValue(this.slidesSettings.title)
                .onChange(v => { this.slidesSettings.title = v; }));

        new Setting(settingsContainer)
            .setName('Theme')
            .addDropdown(dropdown => dropdown
                .addOption('professional', 'Professional')
                .addOption('academic', 'Academic')
                .addOption('creative', 'Creative')
                .addOption('minimal', 'Minimal')
                .setValue(this.slidesSettings.theme)
                .onChange(v => { this.slidesSettings.theme = v as any; }));

        new Setting(settingsContainer)
            .setName('Include Speaker Notes')
            .addToggle(toggle => toggle
                .setValue(this.slidesSettings.includeNotes)
                .onChange(v => { this.slidesSettings.includeNotes = v; }));

        const slideList = container.createEl('div', { cls: 'slide-preview-list' });
        slideList.createEl('h4', { text: 'Slide Outline' });

        slides.slides.forEach((slide, index) => {
            const slideCard = slideList.createEl('div', { cls: 'slide-preview-card' });

            const slideHeader = slideCard.createEl('div', { cls: 'slide-preview-header' });
            const checkbox = slideHeader.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
            checkbox.checked = this.slidesSettings.slidesToInclude[index] ?? true;
            checkbox.addEventListener('change', () => {
                this.slidesSettings.slidesToInclude[index] = checkbox.checked;
            });

            slideHeader.createEl('span', {
                text: `${index + 1}. ${slide.title || '(Untitled)'}`,
                cls: 'slide-title',
            });
            slideHeader.createEl('span', { text: slide.layout, cls: 'slide-layout-badge' });

            if (slide.bulletPoints.length > 0) {
                const bulletList = slideCard.createEl('ul', { cls: 'slide-bullets' });
                for (const bullet of slide.bulletPoints.slice(0, 4)) {
                    bulletList.createEl('li', { text: bullet });
                }
                if (slide.bulletPoints.length > 4) {
                    bulletList.createEl('li', {
                        text: `+${slide.bulletPoints.length - 4} more`,
                        cls: 'slide-more',
                    });
                }
            }
        });

        this.renderSlidesFooter();
    }

    private renderSlidesFooter() {
        const createBtn = this.footerArea.createEl('button', {
            text: 'Create Google Slides',
            cls: 'mod-cta ai-workspace-action-btn',
        });
        createBtn.addEventListener('click', async () => {
            await this.createGoogleSlides();
        });

        const openBtn = this.footerArea.createEl('button', {
            text: 'Export & Open in Browser',
            cls: 'ai-workspace-action-btn',
        });
        openBtn.addEventListener('click', async () => {
            await this.createGoogleSlides(true);
        });
    }

    private async createGoogleSlides(openInBrowser: boolean = false) {
        if (!this.plugin.isAuthenticated()) {
            new Notice('Please connect to Google first in settings');
            return;
        }
        if (!this.analysis) return;

        try {
            new Notice('Creating Google Slides...');
            const presentationId = await this.plugin.slidesService.createPresentation(this.slidesSettings.title);

            const selectedSlides = this.analysis.slides.slides.filter((_, i) => this.slidesSettings.slidesToInclude[i]);

            for (const slide of selectedSlides) {
                const body = slide.bulletPoints.join('\n');
                await this.plugin.slidesService.addSlide(presentationId, {
                    title: slide.title,
                    body,
                });
            }

            if (this.noteFile) {
                this.plugin.settings.linkedFiles.push({
                    localPath: this.noteFile.path,
                    googleFileId: presentationId,
                    googleFileType: 'slides',
                    lastSyncedAt: new Date().toISOString(),
                    googleFileName: this.slidesSettings.title,
                });
                await this.plugin.saveSettings();
            }

            new Notice(`Created: ${this.slidesSettings.title}`);

            if (openInBrowser) {
                window.open(`https://docs.google.com/presentation/d/${presentationId}/edit`);
            }

            this.close();
        } catch (e: any) {
            new Notice(`Failed: ${e.message}`);
        }
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

        new Setting(settingsContainer)
            .setName('Form Type')
            .setDesc('Quiz includes scoring and correct answers. Survey collects responses.')
            .addDropdown(dropdown => dropdown
                .addOption('quiz', 'Quiz')
                .addOption('survey', 'Survey')
                .setValue(this.formSettings.formType)
                .onChange(v => {
                    this.formSettings.formType = v as 'quiz' | 'survey';
                    this.renderTabContent();
                }));

        new Setting(settingsContainer)
            .setName('Collect Email Addresses')
            .addToggle(toggle => toggle
                .setValue(this.formSettings.collectEmail)
                .onChange(v => { this.formSettings.collectEmail = v; }));

        new Setting(settingsContainer)
            .setName('Shuffle Question Order')
            .addToggle(toggle => toggle
                .setValue(this.formSettings.shuffleQuestions)
                .onChange(v => { this.formSettings.shuffleQuestions = v; }));

        new Setting(settingsContainer)
            .setName('Confirmation Message')
            .addText(text => text
                .setValue(this.formSettings.confirmationMessage)
                .onChange(v => { this.formSettings.confirmationMessage = v; }));

        if (forms.questions.length > 0) {
            const questionsSection = container.createEl('div', { cls: 'questions-section' });
            questionsSection.createEl('h4', { text: 'Detected Questions' });

            forms.questions.forEach((question, index) => {
                const questionCard = questionsSection.createEl('div', { cls: 'question-card' });

                const questionHeader = questionCard.createEl('div', { cls: 'question-header' });
                questionHeader.createEl('span', {
                    text: `Q${index + 1}`,
                    cls: 'question-number',
                });
                questionHeader.createEl('span', {
                    text: question.text,
                    cls: 'question-text',
                });

                const questionMeta = questionCard.createEl('div', { cls: 'question-meta' });
                const typeMap: Record<string, string> = {
                    'multiple_choice': 'Multiple Choice',
                    'checkbox': 'Checkboxes',
                    'short_answer': 'Short Answer',
                    'paragraph': 'Paragraph',
                    'scale': 'Scale',
                    'dropdown': 'Dropdown',
                };
                questionMeta.createEl('span', {
                    text: typeMap[question.type] || question.type,
                    cls: 'question-type-badge',
                });
                if (question.required) {
                    questionMeta.createEl('span', { text: 'Required', cls: 'question-required-badge' });
                }
                if (this.formSettings.formType === 'quiz' && question.correctAnswer) {
                    questionMeta.createEl('span', {
                        text: `Answer: ${question.correctAnswer}`,
                        cls: 'question-answer-badge',
                    });
                }

                if (question.options.length > 0) {
                    const optionsList = questionCard.createEl('div', { cls: 'question-options' });
                    for (const option of question.options) {
                        const optionEl = optionsList.createEl('div', { cls: 'question-option' });
                        const isRadio = question.type === 'multiple_choice' || question.type === 'dropdown';
                        optionEl.createEl('span', {
                            text: isRadio ? '○' : '☐',
                            cls: 'option-marker',
                        });
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

        this.renderFormsFooter(forms);
    }

    private renderFormsFooter(forms: FormsAnalysis) {
        const leftActions = this.footerArea.createEl('div', { cls: 'footer-left' });
        const rightActions = this.footerArea.createEl('div', { cls: 'footer-right' });

        const createBtn = rightActions.createEl('button', {
            text: `Create Google ${this.formSettings.formType === 'quiz' ? 'Quiz' : 'Form'}`,
            cls: 'mod-cta ai-workspace-action-btn',
        });
        createBtn.addEventListener('click', async () => {
            await this.createGoogleForm();
        });

        const openBtn = rightActions.createEl('button', {
            text: 'Create & Open in Browser',
            cls: 'ai-workspace-action-btn',
        });
        openBtn.addEventListener('click', async () => {
            await this.createGoogleForm(true);
        });

        const embedBtn = leftActions.createEl('button', {
            text: 'Create & Embed in Note',
            cls: 'ai-workspace-action-btn embed-btn',
        });
        embedBtn.addEventListener('click', async () => {
            await this.createGoogleForm(false, true);
        });
    }

    private async createGoogleForm(openInBrowser: boolean = false, embedInNote: boolean = false) {
        if (!this.plugin.isAuthenticated()) {
            new Notice('Please connect to Google first in settings');
            return;
        }
        if (!this.analysis) return;

        try {
            new Notice(`Creating Google ${this.formSettings.formType === 'quiz' ? 'Quiz' : 'Form'}...`);

            const formId = await this.plugin.formsService.createForm(
                this.analysis.forms.suggestedTitle,
                this.analysis.forms.description
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

                await this.plugin.formsService.addQuestion(
                    formId,
                    question.text,
                    qType,
                    {
                        choices: question.options.length > 0 ? question.options : undefined,
                        required: question.required,
                    }
                );
            }

            if (this.noteFile) {
                this.plugin.settings.linkedFiles.push({
                    localPath: this.noteFile.path,
                    googleFileId: formId,
                    googleFileType: 'forms',
                    lastSyncedAt: new Date().toISOString(),
                    googleFileName: this.analysis.forms.suggestedTitle,
                });
                await this.plugin.saveSettings();
            }

            if (embedInNote && this.noteFile) {
                const formUrl = `https://docs.google.com/forms/d/${formId}/viewform?embedded=true`;
                const embedCode = [
                    '',
                    '---',
                    '',
                    `> [!info] ${this.formSettings.formType === 'quiz' ? 'Quiz' : 'Form'}: ${this.analysis.forms.suggestedTitle}`,
                    `> [Open Form](https://docs.google.com/forms/d/${formId}/viewform)`,
                    `> [Edit Form](https://docs.google.com/forms/d/${formId}/edit)`,
                    `> [View Responses](https://docs.google.com/forms/d/${formId}/edit#responses)`,
                    '',
                    `\`\`\`embed`,
                    formUrl,
                    `\`\`\``,
                ].join('\n');

                const currentContent = await this.app.vault.read(this.noteFile);
                await this.app.vault.modify(this.noteFile, currentContent + embedCode);
                new Notice('Form created and embedded in note!');
            } else {
                new Notice(`Created: ${this.analysis.forms.suggestedTitle}`);
            }

            if (openInBrowser) {
                window.open(`https://docs.google.com/forms/d/${formId}/edit`);
            }

            this.close();
        } catch (e: any) {
            new Notice(`Failed: ${e.message}`);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
