import { GooglePresentation, Slide, PageElement, TextContent, TextElement } from '../services/SlidesService';

export class SlidesConverter {
    /**
     * Convert Google Slides presentation to Markdown
     */
    static toMarkdown(presentation: GooglePresentation): string {
        const lines: string[] = [];
        const title = presentation.title;

        // Add title
        lines.push(`# ${title}`);
        lines.push('');
        lines.push(`*${presentation.slides.length} slides*`);
        lines.push('');
        lines.push('---');
        lines.push('');

        // Process each slide
        for (let i = 0; i < presentation.slides.length; i++) {
            const slide = presentation.slides[i];
            const slideNum = i + 1;

            const { title: slideTitle, body, notes } = this.extractSlideContent(slide);

            // Slide header
            lines.push(`## Slide ${slideNum}${slideTitle ? ': ' + slideTitle : ''}`);
            lines.push('');

            // Slide body content
            if (body.length > 0) {
                for (const item of body) {
                    if (item.startsWith('|')) {
                        // Table content
                        lines.push(item);
                    } else if (item.trim()) {
                        lines.push(`- ${item}`);
                    }
                }
                lines.push('');
            }

            // Speaker notes (if any)
            if (notes) {
                lines.push('> **Notes:** ' + notes);
                lines.push('');
            }

            // Slide separator
            if (i < presentation.slides.length - 1) {
                lines.push('---');
                lines.push('');
            }
        }

        return lines.join('\n');
    }

    /**
     * Extract content from a single slide
     */
    private static extractSlideContent(slide: Slide): { title: string; body: string[]; notes: string } {
        let title = '';
        const body: string[] = [];
        let notes = '';

        if (!slide.pageElements) {
            return { title, body, notes };
        }

        let isFirstText = true;

        for (const element of slide.pageElements) {
            // Shape with text
            if (element.shape?.text) {
                const text = this.extractTextFromContent(element.shape.text);

                if (isFirstText && text.trim()) {
                    // First text element is typically the title
                    title = text.trim();
                    isFirstText = false;
                } else if (text.trim()) {
                    // Split by newlines and add as separate items
                    const textLines = text.split('\n').filter(l => l.trim());
                    body.push(...textLines);
                }
            }

            // Table
            if (element.table) {
                const tableMarkdown = this.extractTableContent(element.table);
                if (tableMarkdown) {
                    body.push(tableMarkdown);
                }
            }

            // Image
            if (element.image) {
                const imageUrl = element.image.contentUrl || element.image.sourceUrl;
                if (imageUrl) {
                    body.push(`![Image](${imageUrl})`);
                }
            }
        }

        return { title, body, notes };
    }

    /**
     * Extract text from TextContent
     */
    private static extractTextFromContent(textContent: TextContent): string {
        if (!textContent?.textElements) return '';

        const parts: string[] = [];

        for (const element of textContent.textElements) {
            if (element.textRun?.content) {
                let text = element.textRun.content;

                // Apply formatting
                const style = element.textRun.style;
                if (style) {
                    if (style.bold && text.trim()) {
                        text = `**${text.trim()}** `;
                    }
                    if (style.italic && text.trim()) {
                        text = `*${text.trim()}* `;
                    }
                }

                parts.push(text);
            }
        }

        return parts.join('');
    }

    /**
     * Extract table content as Markdown
     */
    private static extractTableContent(table: { rows: number; columns: number; tableRows: any[] }): string {
        const rows: string[] = [];

        for (let i = 0; i < table.tableRows.length; i++) {
            const row = table.tableRows[i];
            const cells: string[] = [];

            for (const cell of row.tableCells) {
                let cellText = '';
                if (cell.text) {
                    cellText = this.extractTextFromContent(cell.text).trim();
                }
                cells.push(cellText.replace(/\|/g, '\\|').replace(/\n/g, ' '));
            }

            rows.push(`| ${cells.join(' | ')} |`);

            // Add header separator after first row
            if (i === 0) {
                rows.push(`| ${Array(cells.length).fill('---').join(' | ')} |`);
            }
        }

        return rows.join('\n');
    }

    /**
     * Parse Markdown back to slide structure (for creating presentations)
     * Returns array of slide objects with title and body
     */
    static parseMarkdownToSlides(markdown: string): { title: string; body: string[] }[] {
        const slides: { title: string; body: string[] }[] = [];
        const sections = markdown.split(/---\n*/);

        for (const section of sections) {
            const lines = section.trim().split('\n').filter(l => l.trim());
            if (lines.length === 0) continue;

            let title = '';
            const body: string[] = [];

            for (const line of lines) {
                // Check for slide heading (## Slide X: Title)
                const slideHeadingMatch = line.match(/^##\s+Slide\s+\d+:?\s*(.*)$/i);
                if (slideHeadingMatch) {
                    title = slideHeadingMatch[1].trim();
                    continue;
                }

                // Regular heading
                const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
                if (headingMatch && !title) {
                    title = headingMatch[1].trim();
                    continue;
                }

                // List item
                const listMatch = line.match(/^[\-\*]\s+(.+)$/);
                if (listMatch) {
                    body.push(listMatch[1].trim());
                    continue;
                }

                // Skip metadata lines
                if (line.startsWith('*') && line.endsWith('*') && line.includes('slide')) {
                    continue;
                }

                // Regular text
                if (line.trim() && !line.startsWith('>')) {
                    body.push(line.trim());
                }
            }

            if (title || body.length > 0) {
                slides.push({ title, body });
            }
        }

        return slides;
    }

    /**
     * Generate a simple slide summary
     */
    static generateSlideSummary(presentation: GooglePresentation): string {
        const lines: string[] = [];
        lines.push(`# ${presentation.title}`);
        lines.push('');
        lines.push(`Total slides: ${presentation.slides.length}`);
        lines.push('');
        lines.push('## Outline');
        lines.push('');

        for (let i = 0; i < presentation.slides.length; i++) {
            const slide = presentation.slides[i];
            const { title } = this.extractSlideContent(slide);
            lines.push(`${i + 1}. ${title || '(Untitled slide)'}`);
        }

        return lines.join('\n');
    }
}
