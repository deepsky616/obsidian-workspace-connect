/**
 * NoteAnalyzer - AI-powered content analysis engine
 * Analyzes Obsidian note content and generates structured suggestions
 * for Docs, Sheets, Slides, and Forms.
 */

// ─── Shared Types ─────────────────────────────────────────────

export interface NoteAnalysis {
    title: string;
    wordCount: number;
    lineCount: number;
    docs: DocsAnalysis;
    sheets: SheetsAnalysis;
    slides: SlidesAnalysis;
    forms: FormsAnalysis;
}

// ─── Docs ─────────────────────────────────────────────────────

export interface DocsAnalysis {
    suggestedTitle: string;
    headings: { level: number; text: string }[];
    paragraphCount: number;
    hasImages: boolean;
    hasLinks: boolean;
    hasTables: boolean;
    estimatedPages: number;
    contentType: 'article' | 'report' | 'notes' | 'letter' | 'general';
    summary: string;
}

// ─── Sheets ───────────────────────────────────────────────────

export interface SheetsAnalysis {
    tables: ExtractedTable[];
    lists: ExtractedList[];
    numericalData: { label: string; value: number }[];
    suggestedChartType: 'bar' | 'line' | 'pie' | 'table' | 'none';
    hasTabulableContent: boolean;
}

export interface ExtractedTable {
    headers: string[];
    rows: string[][];
    startLine: number;
}

export interface ExtractedList {
    title: string;
    items: string[];
    isNumbered: boolean;
}

// ─── Slides ───────────────────────────────────────────────────

export interface SlidesAnalysis {
    suggestedTitle: string;
    slides: SlideProposal[];
    estimatedDuration: string;
    theme: 'professional' | 'academic' | 'creative' | 'minimal';
}

export interface SlideProposal {
    title: string;
    bulletPoints: string[];
    layout: 'title' | 'title_body' | 'two_column' | 'image_text' | 'blank';
    speakerNotes: string;
}

// ─── Forms ────────────────────────────────────────────────────

export interface FormsAnalysis {
    formType: 'quiz' | 'survey' | 'feedback' | 'registration' | 'general';
    suggestedTitle: string;
    description: string;
    questions: DetectedQuestion[];
    hasAnswerKey: boolean;
    isQuizLikely: boolean;
    isSurveyLikely: boolean;
}

export interface DetectedQuestion {
    text: string;
    type: 'multiple_choice' | 'checkbox' | 'short_answer' | 'paragraph' | 'scale' | 'dropdown';
    options: string[];
    required: boolean;
    correctAnswer?: string;
    points?: number;
}

// ─── Analyzer ─────────────────────────────────────────────────

export class NoteAnalyzer {

    /**
     * Main analysis entry point
     */
    static analyze(content: string, fileName: string): NoteAnalysis {
        const lines = content.split('\n');
        const title = this.extractTitle(content, fileName);

        return {
            title,
            wordCount: this.countWords(content),
            lineCount: lines.length,
            docs: this.analyzeDocs(content, title),
            sheets: this.analyzeSheets(content),
            slides: this.analyzeSlides(content, title),
            forms: this.analyzeForms(content, title),
        };
    }

    // ─── Title Extraction ─────────────────────────────────────

    private static extractTitle(content: string, fileName: string): string {
        const h1Match = content.match(/^#\s+(.+)$/m);
        if (h1Match) return h1Match[1].trim();

        const yamlTitleMatch = content.match(/^title:\s*(.+)$/m);
        if (yamlTitleMatch) return yamlTitleMatch[1].trim().replace(/^["']|["']$/g, '');

        return fileName.replace(/\.md$/, '');
    }

    private static countWords(content: string): number {
        // Remove frontmatter
        const cleaned = content.replace(/^---[\s\S]*?---\n?/, '');
        return cleaned.split(/\s+/).filter(w => w.length > 0).length;
    }

    // ═══════════════════════════════════════════════════════════
    // DOCS ANALYSIS
    // ═══════════════════════════════════════════════════════════

    private static analyzeDocs(content: string, title: string): DocsAnalysis {
        const headings = this.extractHeadings(content);
        const paragraphCount = this.countParagraphs(content);
        const wordCount = this.countWords(content);

        let contentType: DocsAnalysis['contentType'] = 'general';
        if (headings.length >= 3 && paragraphCount >= 5) contentType = 'article';
        if (content.match(/^(abstract|introduction|conclusion|references)/im)) contentType = 'report';
        if (content.match(/^(dear|sincerely|regards)/im)) contentType = 'letter';
        if (headings.length <= 2 && paragraphCount <= 3) contentType = 'notes';

        const summary = this.generateDocsSummary(headings, paragraphCount, wordCount);

        return {
            suggestedTitle: title,
            headings,
            paragraphCount,
            hasImages: /!\[.*?\]\(.*?\)/.test(content),
            hasLinks: /\[.*?\]\(.*?\)/.test(content),
            hasTables: /\|.*\|.*\|/.test(content),
            estimatedPages: Math.max(1, Math.ceil(wordCount / 250)),
            contentType,
            summary,
        };
    }

    private static extractHeadings(content: string): { level: number; text: string }[] {
        const headings: { level: number; text: string }[] = [];
        const regex = /^(#{1,6})\s+(.+)$/gm;
        let match;
        while ((match = regex.exec(content)) !== null) {
            headings.push({ level: match[1].length, text: match[2].trim() });
        }
        return headings;
    }

    private static countParagraphs(content: string): number {
        const cleaned = content.replace(/^---[\s\S]*?---\n?/, '');
        const blocks = cleaned.split(/\n\n+/).filter(b => {
            const trimmed = b.trim();
            return trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.startsWith('|') && !trimmed.startsWith('-');
        });
        return blocks.length;
    }

    private static generateDocsSummary(headings: { level: number; text: string }[], paragraphCount: number, wordCount: number): string {
        const parts: string[] = [];
        parts.push(`${wordCount} words, ~${Math.max(1, Math.ceil(wordCount / 250))} pages`);
        if (headings.length > 0) {
            parts.push(`${headings.length} sections`);
        }
        parts.push(`${paragraphCount} paragraphs`);
        return parts.join(' | ');
    }

    // ═══════════════════════════════════════════════════════════
    // SHEETS ANALYSIS
    // ═══════════════════════════════════════════════════════════

    private static analyzeSheets(content: string): SheetsAnalysis {
        const tables = this.extractTables(content);
        const lists = this.extractLists(content);
        const numericalData = this.extractNumericalData(content);

        let suggestedChartType: SheetsAnalysis['suggestedChartType'] = 'none';
        if (numericalData.length >= 2) {
            if (numericalData.length <= 6) suggestedChartType = 'pie';
            else suggestedChartType = 'bar';
        }
        if (tables.length > 0 && tables[0].rows.length > 5) {
            suggestedChartType = 'bar';
        }

        return {
            tables,
            lists,
            numericalData,
            suggestedChartType,
            hasTabulableContent: tables.length > 0 || lists.length > 0 || numericalData.length > 0,
        };
    }

    private static extractTables(content: string): ExtractedTable[] {
        const tables: ExtractedTable[] = [];
        const lines = content.split('\n');

        let currentHeaders: string[] = [];
        let currentRows: string[][] = [];
        let startLine = -1;
        let inTable = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('|') && line.endsWith('|')) {
                // Skip separator lines
                if (/^\|[\s\-:|]+\|$/.test(line)) continue;

                const cells = line.slice(1, -1).split('|').map(c => c.trim());

                if (!inTable) {
                    currentHeaders = cells;
                    startLine = i;
                    inTable = true;
                } else {
                    currentRows.push(cells);
                }
            } else {
                if (inTable && currentHeaders.length > 0) {
                    tables.push({ headers: currentHeaders, rows: currentRows, startLine });
                    currentHeaders = [];
                    currentRows = [];
                    inTable = false;
                }
            }
        }
        if (inTable && currentHeaders.length > 0) {
            tables.push({ headers: currentHeaders, rows: currentRows, startLine });
        }

        return tables;
    }

    private static extractLists(content: string): ExtractedList[] {
        const lists: ExtractedList[] = [];
        const lines = content.split('\n');

        let currentItems: string[] = [];
        let currentTitle = '';
        let isNumbered = false;
        let inList = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const ulMatch = line.match(/^[\-\*]\s+(.+)$/);
            const olMatch = line.match(/^\d+\.\s+(.+)$/);

            if (ulMatch || olMatch) {
                if (!inList) {
                    // Check if previous non-empty line is a heading or text
                    for (let j = i - 1; j >= 0; j--) {
                        const prevLine = lines[j].trim();
                        if (prevLine) {
                            currentTitle = prevLine.replace(/^#{1,6}\s+/, '').replace(/:$/, '');
                            break;
                        }
                    }
                    isNumbered = !!olMatch;
                    inList = true;
                }
                currentItems.push((ulMatch || olMatch)![1]);
            } else {
                if (inList && currentItems.length > 0) {
                    lists.push({ title: currentTitle, items: currentItems, isNumbered });
                    currentItems = [];
                    currentTitle = '';
                    inList = false;
                }
            }
        }
        if (inList && currentItems.length > 0) {
            lists.push({ title: currentTitle, items: currentItems, isNumbered });
        }

        return lists;
    }

    private static extractNumericalData(content: string): { label: string; value: number }[] {
        const data: { label: string; value: number }[] = [];
        const lines = content.split('\n');

        for (const line of lines) {
            // Pattern: "Label: 123" or "Label - 123" or "Label = 123"
            const match = line.match(/^[\-\*]?\s*(.+?)[\s]*[:=\-–—]\s*([\d,]+\.?\d*)\s*(%|명|개|원|달러|건)?$/);
            if (match) {
                const label = match[1].trim();
                const value = parseFloat(match[2].replace(/,/g, ''));
                if (!isNaN(value) && label.length > 0 && label.length < 50) {
                    data.push({ label, value });
                }
            }
        }

        return data;
    }

    // ═══════════════════════════════════════════════════════════
    // SLIDES ANALYSIS
    // ═══════════════════════════════════════════════════════════

    private static analyzeSlides(content: string, title: string): SlidesAnalysis {
        const headings = this.extractHeadings(content);
        const slides: SlideProposal[] = [];

        // Title slide
        slides.push({
            title,
            bulletPoints: [],
            layout: 'title',
            speakerNotes: 'Introduction',
        });

        // Generate slides from content sections
        const sections = this.splitIntoSections(content);
        for (const section of sections) {
            const bullets = this.extractBulletPoints(section.content);
            slides.push({
                title: section.heading,
                bulletPoints: bullets.slice(0, 6), // Max 6 bullets per slide
                layout: bullets.length > 0 ? 'title_body' : 'title',
                speakerNotes: this.generateSpeakerNotes(section.content),
            });
        }

        // Determine theme
        let theme: SlidesAnalysis['theme'] = 'professional';
        if (content.match(/^(abstract|introduction|methodology|results|conclusion|references)/im)) {
            theme = 'academic';
        }

        const slideCount = slides.length;
        const minutes = Math.max(1, Math.ceil(slideCount * 1.5));

        return {
            suggestedTitle: title,
            slides,
            estimatedDuration: `~${minutes} min`,
            theme,
        };
    }

    private static splitIntoSections(content: string): { heading: string; content: string }[] {
        const sections: { heading: string; content: string }[] = [];
        const lines = content.split('\n');

        let currentHeading = '';
        let currentContent: string[] = [];

        for (const line of lines) {
            const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
            if (headingMatch) {
                if (currentHeading || currentContent.length > 0) {
                    sections.push({ heading: currentHeading, content: currentContent.join('\n') });
                }
                currentHeading = headingMatch[2].trim();
                currentContent = [];
            } else {
                currentContent.push(line);
            }
        }
        if (currentHeading || currentContent.length > 0) {
            sections.push({ heading: currentHeading, content: currentContent.join('\n') });
        }

        // Filter out empty/frontmatter sections
        return sections.filter(s => s.heading && s.content.trim().length > 0);
    }

    private static extractBulletPoints(content: string): string[] {
        const bullets: string[] = [];
        const lines = content.split('\n');

        for (const line of lines) {
            const match = line.match(/^[\-\*]\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/);
            if (match) {
                bullets.push(match[1].trim());
            }
        }

        // If no bullets, extract key sentences
        if (bullets.length === 0) {
            const sentences = content.split(/[.!?]\s+/).filter(s => s.trim().length > 10 && s.trim().length < 120);
            return sentences.slice(0, 4).map(s => s.trim());
        }

        return bullets;
    }

    private static generateSpeakerNotes(content: string): string {
        const cleaned = content.replace(/^[\-\*]\s+.+$/gm, '').replace(/^\d+\.\s+.+$/gm, '').trim();
        const sentences = cleaned.split(/[.!?]\s+/).filter(s => s.trim().length > 10);
        return sentences.slice(0, 2).join('. ').trim();
    }

    // ═══════════════════════════════════════════════════════════
    // FORMS ANALYSIS
    // ═══════════════════════════════════════════════════════════

    private static analyzeForms(content: string, title: string): FormsAnalysis {
        const questions = this.detectQuestions(content);
        const hasAnswerKey = this.detectAnswerKey(content);

        // Determine form type
        let formType: FormsAnalysis['formType'] = 'general';
        const isQuizLikely = hasAnswerKey ||
            questions.some(q => q.correctAnswer !== undefined) ||
            /quiz|test|exam|시험|퀴즈/i.test(content);
        const isSurveyLikely = /survey|feedback|opinion|rating|satisfaction|설문|조사|의견/i.test(content) ||
            questions.some(q => q.type === 'scale');

        if (isQuizLikely) formType = 'quiz';
        else if (isSurveyLikely) formType = 'survey';
        else if (/feedback|피드백/i.test(content)) formType = 'feedback';
        else if (/register|sign.?up|등록|신청/i.test(content)) formType = 'registration';

        // Generate description
        let description = '';
        if (formType === 'quiz') description = `Quiz with ${questions.length} questions generated from note content`;
        else if (formType === 'survey') description = `Survey with ${questions.length} questions to gather responses`;
        else description = `Form with ${questions.length} questions based on note content`;

        return {
            formType,
            suggestedTitle: title,
            description,
            questions,
            hasAnswerKey,
            isQuizLikely,
            isSurveyLikely,
        };
    }

    private static detectQuestions(content: string): DetectedQuestion[] {
        const questions: DetectedQuestion[] = [];
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Detect explicit question patterns
            // Pattern 1: Line ending with "?"
            if (line.endsWith('?') && line.length > 5) {
                const questionText = line.replace(/^[\-\*\d.#]+\s*/, '').trim();
                const options = this.collectOptions(lines, i + 1);
                const correctAnswer = this.detectCorrectOption(lines, i + 1);

                let type: DetectedQuestion['type'] = 'short_answer';
                if (options.length >= 2) {
                    type = options.length <= 5 ? 'multiple_choice' : 'dropdown';
                }

                questions.push({
                    text: questionText,
                    type,
                    options,
                    required: true,
                    correctAnswer: correctAnswer || undefined,
                });
            }

            // Pattern 2: "Q:" or "Question:" prefix
            const qPrefixMatch = line.match(/^(?:Q\d*|Question\s*\d*|질문\s*\d*)[:.)]\s*(.+)/i);
            if (qPrefixMatch && !line.endsWith('?')) {
                const questionText = qPrefixMatch[1].trim();
                const options = this.collectOptions(lines, i + 1);

                questions.push({
                    text: questionText,
                    type: options.length >= 2 ? 'multiple_choice' : 'short_answer',
                    options,
                    required: true,
                });
            }

            // Pattern 3: Rating/Scale pattern "Rate X (1-5)" or "On a scale of 1 to 10"
            if (/rate|scale|평가|척도/i.test(line) && /\d/.test(line)) {
                const questionText = line.replace(/^[\-\*\d.#]+\s*/, '').trim();
                questions.push({
                    text: questionText,
                    type: 'scale',
                    options: [],
                    required: true,
                });
            }

            // Pattern 4: "Describe" or "Explain" → paragraph answer
            if (/^(?:describe|explain|elaborate|서술|설명)/i.test(line.replace(/^[\-\*\d.#]+\s*/, ''))) {
                const questionText = line.replace(/^[\-\*\d.#]+\s*/, '').trim();
                questions.push({
                    text: questionText,
                    type: 'paragraph',
                    options: [],
                    required: false,
                });
            }
        }

        // Deduplicate
        const seen = new Set<string>();
        return questions.filter(q => {
            const key = q.text.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    private static collectOptions(lines: string[], startIndex: number): string[] {
        const options: string[] = [];
        for (let j = startIndex; j < lines.length && j < startIndex + 15; j++) {
            const optLine = lines[j].trim();
            // a) b) c) or A. B. C. patterns
            const letterMatch = optLine.match(/^[a-eA-E][.)]\s*(.+)/);
            // - [ ] or - [x] patterns (checkbox)
            const checkMatch = optLine.match(/^[\-\*]\s*\[[ xX]?\]\s*(.+)/);
            // Simple bullet patterns under a question
            const bulletMatch = optLine.match(/^[\-\*]\s+(.+)$/);

            if (letterMatch) {
                options.push(letterMatch[1].trim());
            } else if (checkMatch) {
                options.push(checkMatch[1].trim());
            } else if (bulletMatch && options.length < 10) {
                // Only collect bullets if they look like answer options (short text)
                const text = bulletMatch[1].trim();
                if (text.length < 80) {
                    options.push(text);
                }
            } else if (optLine === '' && options.length > 0) {
                break; // Empty line ends option collection
            } else if (!optLine.startsWith('-') && !optLine.startsWith('*') && optLine.length > 0 && options.length > 0) {
                break; // Non-list line ends collection
            }
        }
        return options;
    }

    private static detectCorrectOption(lines: string[], startIndex: number): string | null {
        for (let j = startIndex; j < lines.length && j < startIndex + 15; j++) {
            const line = lines[j].trim();
            // Detect marked correct answers: **option** or [x] option or (correct) or ✓
            if (/\[x\]/i.test(line)) {
                const match = line.match(/\[x\]\s*(.+)/i);
                return match ? match[1].trim() : null;
            }
            if (/✓|✅|correct|정답/i.test(line)) {
                const cleaned = line.replace(/[✓✅]|(correct|정답)/gi, '').replace(/^[\-\*a-eA-E.)\s]+/, '').trim();
                return cleaned || null;
            }
        }
        return null;
    }

    private static detectAnswerKey(content: string): boolean {
        return /answer\s*key|answers?:|정답|해답/i.test(content) ||
            /\[x\]/i.test(content) ||
            /✓|✅/.test(content);
    }
}
