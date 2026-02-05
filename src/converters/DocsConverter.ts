import { GoogleDocsDocument, DocumentContent, ParagraphElement, TableRow } from '../services/DocsService';

export class DocsConverter {
    /**
     * Convert Google Docs document to Markdown
     */
    static toMarkdown(doc: GoogleDocsDocument): string {
        const lines: string[] = [];
        const title = doc.title;

        // Add title as H1
        lines.push(`# ${title}`);
        lines.push('');

        if (!doc.body?.content) {
            return lines.join('\n');
        }

        for (const content of doc.body.content) {
            if (content.paragraph) {
                const paragraphMd = this.convertParagraph(content);
                if (paragraphMd) {
                    lines.push(paragraphMd);
                }
            } else if (content.table) {
                const tableMd = this.convertTable(content.table);
                if (tableMd) {
                    lines.push(tableMd);
                    lines.push('');
                }
            }
        }

        return lines.join('\n');
    }

    private static convertParagraph(content: DocumentContent): string {
        if (!content.paragraph?.elements) return '';

        const style = content.paragraph.paragraphStyle?.namedStyleType;
        let text = '';

        for (const element of content.paragraph.elements) {
            if (element.textRun) {
                let elementText = element.textRun.content || '';

                // Apply text formatting
                const textStyle = element.textRun.textStyle;
                if (textStyle) {
                    if (textStyle.bold) {
                        elementText = `**${elementText.trim()}**`;
                    }
                    if (textStyle.italic) {
                        elementText = `*${elementText.trim()}*`;
                    }
                    if (textStyle.strikethrough) {
                        elementText = `~~${elementText.trim()}~~`;
                    }
                    if (textStyle.link?.url) {
                        elementText = `[${elementText.trim()}](${textStyle.link.url})`;
                    }
                }

                text += elementText;
            }
        }

        // Remove trailing newline
        text = text.replace(/\n$/, '');

        if (!text.trim()) return '';

        // Apply heading style
        switch (style) {
            case 'HEADING_1':
                return `# ${text}`;
            case 'HEADING_2':
                return `## ${text}`;
            case 'HEADING_3':
                return `### ${text}`;
            case 'HEADING_4':
                return `#### ${text}`;
            case 'HEADING_5':
                return `##### ${text}`;
            case 'HEADING_6':
                return `###### ${text}`;
            case 'TITLE':
                return `# ${text}`;
            case 'SUBTITLE':
                return `*${text}*`;
            default:
                return text;
        }
    }

    private static convertTable(table: { rows: number; columns: number; tableRows: TableRow[] }): string {
        const rows: string[] = [];

        for (let i = 0; i < table.tableRows.length; i++) {
            const tableRow = table.tableRows[i];
            const cells: string[] = [];

            for (const cell of tableRow.tableCells) {
                let cellText = '';
                if (cell.content) {
                    for (const content of cell.content) {
                        if (content.paragraph?.elements) {
                            for (const el of content.paragraph.elements) {
                                if (el.textRun?.content) {
                                    cellText += el.textRun.content.replace(/\n/g, ' ').trim();
                                }
                            }
                        }
                    }
                }
                // Escape pipe characters in cell content
                cells.push(cellText.replace(/\|/g, '\\|'));
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
     * Convert Markdown to Google Docs batch update requests
     */
    static markdownToDocsRequests(markdown: string): any[] {
        const requests: any[] = [];
        const lines = markdown.split('\n');
        let insertIndex = 1; // Start after the document's initial newline

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const { text, style, isList, listType } = this.parseLine(line);

            if (!text && !isList) {
                // Empty line
                requests.push({
                    insertText: {
                        location: { index: insertIndex },
                        text: '\n'
                    }
                });
                insertIndex += 1;
                continue;
            }

            // Insert the text
            const textToInsert = text + '\n';
            requests.push({
                insertText: {
                    location: { index: insertIndex },
                    text: textToInsert
                }
            });

            // Apply paragraph style if it's a heading
            if (style) {
                requests.push({
                    updateParagraphStyle: {
                        range: {
                            startIndex: insertIndex,
                            endIndex: insertIndex + textToInsert.length
                        },
                        paragraphStyle: {
                            namedStyleType: style
                        },
                        fields: 'namedStyleType'
                    }
                });
            }

            // Apply text formatting (bold, italic, etc.)
            const formattingRequests = this.createFormattingRequests(text, insertIndex);
            requests.push(...formattingRequests);

            insertIndex += textToInsert.length;
        }

        return requests;
    }

    private static parseLine(line: string): { text: string; style: string | null; isList: boolean; listType: string | null } {
        // Check for headings
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const headingStyles: { [key: number]: string } = {
                1: 'HEADING_1',
                2: 'HEADING_2',
                3: 'HEADING_3',
                4: 'HEADING_4',
                5: 'HEADING_5',
                6: 'HEADING_6'
            };
            return {
                text: headingMatch[2],
                style: headingStyles[level],
                isList: false,
                listType: null
            };
        }

        // Check for unordered list
        const ulMatch = line.match(/^[\-\*]\s+(.+)$/);
        if (ulMatch) {
            return {
                text: '• ' + ulMatch[1],
                style: null,
                isList: true,
                listType: 'BULLET'
            };
        }

        // Check for ordered list
        const olMatch = line.match(/^\d+\.\s+(.+)$/);
        if (olMatch) {
            return {
                text: olMatch[1],
                style: null,
                isList: true,
                listType: 'NUMBER'
            };
        }

        return {
            text: line,
            style: null,
            isList: false,
            listType: null
        };
    }

    private static createFormattingRequests(text: string, startIndex: number): any[] {
        const requests: any[] = [];

        // Find bold text (**text** or __text__)
        const boldRegex = /\*\*([^*]+)\*\*|__([^_]+)__/g;
        let match;
        while ((match = boldRegex.exec(text)) !== null) {
            const boldText = match[1] || match[2];
            const textStartIndex = text.indexOf(match[0]);
            requests.push({
                updateTextStyle: {
                    range: {
                        startIndex: startIndex + textStartIndex,
                        endIndex: startIndex + textStartIndex + boldText.length + 4
                    },
                    textStyle: {
                        bold: true
                    },
                    fields: 'bold'
                }
            });
        }

        // Find italic text (*text* or _text_)
        const italicRegex = /(?<!\*)\*([^*]+)\*(?!\*)|(?<!_)_([^_]+)_(?!_)/g;
        while ((match = italicRegex.exec(text)) !== null) {
            const italicText = match[1] || match[2];
            const textStartIndex = text.indexOf(match[0]);
            requests.push({
                updateTextStyle: {
                    range: {
                        startIndex: startIndex + textStartIndex,
                        endIndex: startIndex + textStartIndex + italicText.length + 2
                    },
                    textStyle: {
                        italic: true
                    },
                    fields: 'italic'
                }
            });
        }

        return requests;
    }

    /**
     * Extract plain text from Google Docs document
     */
    static extractPlainText(doc: GoogleDocsDocument): string {
        const lines: string[] = [];

        if (!doc.body?.content) {
            return '';
        }

        for (const content of doc.body.content) {
            if (content.paragraph?.elements) {
                for (const element of content.paragraph.elements) {
                    if (element.textRun?.content) {
                        lines.push(element.textRun.content);
                    }
                }
            }
        }

        return lines.join('');
    }
}
