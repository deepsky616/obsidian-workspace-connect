import { GoogleApiService } from './GoogleApiService';
import WorkspaceConnectPlugin from '../../main';

export interface GooglePresentation {
    presentationId: string;
    title: string;
    slides: Slide[];
    pageSize: {
        width: { magnitude: number; unit: string };
        height: { magnitude: number; unit: string };
    };
}

export interface Slide {
    objectId: string;
    pageElements: PageElement[];
    slideProperties?: {
        layoutObjectId?: string;
        masterObjectId?: string;
    };
}

export interface PageElement {
    objectId: string;
    size?: {
        width: { magnitude: number; unit: string };
        height: { magnitude: number; unit: string };
    };
    transform?: any;
    shape?: {
        shapeType: string;
        text?: TextContent;
    };
    image?: {
        contentUrl: string;
        sourceUrl?: string;
    };
    table?: {
        rows: number;
        columns: number;
        tableRows: TableRow[];
    };
}

export interface TextContent {
    textElements: TextElement[];
}

export interface TextElement {
    startIndex?: number;
    endIndex?: number;
    paragraphMarker?: {
        style?: any;
    };
    textRun?: {
        content: string;
        style?: {
            bold?: boolean;
            italic?: boolean;
            underline?: boolean;
            fontSize?: { magnitude: number; unit: string };
        };
    };
}

export interface TableRow {
    tableCells: TableCell[];
}

export interface TableCell {
    text?: TextContent;
}

export class SlidesService extends GoogleApiService {
    constructor(plugin: WorkspaceConnectPlugin) {
        super(plugin);
    }

    async getPresentation(presentationId: string): Promise<GooglePresentation> {
        return await this.get(`https://slides.googleapis.com/v1/presentations/${presentationId}`);
    }

    async createPresentation(title: string): Promise<string> {
        const response = await this.post('https://slides.googleapis.com/v1/presentations', {
            title
        });

        return response.presentationId;
    }

    async addSlide(presentationId: string, slideContent?: { title?: string; body?: string }): Promise<string> {
        const slideId = `slide_${Date.now()}`;

        const requests: any[] = [
            {
                createSlide: {
                    objectId: slideId,
                    slideLayoutReference: {
                        predefinedLayout: 'TITLE_AND_BODY'
                    }
                }
            }
        ];

        await this.post(`https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`, {
            requests
        });

        // Add content if provided
        if (slideContent) {
            const contentRequests: any[] = [];

            // Get the slide to find placeholder IDs
            const presentation = await this.getPresentation(presentationId);
            const slide = presentation.slides.find(s => s.objectId === slideId);

            if (slide && slideContent.title) {
                const titleShape = slide.pageElements.find(el =>
                    el.shape?.shapeType === 'TEXT_BOX' ||
                    el.shape?.text
                );
                if (titleShape) {
                    contentRequests.push({
                        insertText: {
                            objectId: titleShape.objectId,
                            text: slideContent.title
                        }
                    });
                }
            }

            if (contentRequests.length > 0) {
                await this.post(`https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`, {
                    requests: contentRequests
                });
            }
        }

        return slideId;
    }

    async deleteSlide(presentationId: string, slideObjectId: string): Promise<void> {
        await this.post(`https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`, {
            requests: [{
                deleteObject: {
                    objectId: slideObjectId
                }
            }]
        });
    }

    extractTextFromSlide(slide: Slide): { title: string; body: string[] } {
        let title = '';
        const body: string[] = [];

        for (const element of slide.pageElements) {
            if (element.shape?.text) {
                const text = this.extractTextContent(element.shape.text);

                if (!title && text) {
                    title = text;
                } else if (text) {
                    body.push(text);
                }
            }

            if (element.table) {
                const tableText = this.extractTableText(element.table);
                if (tableText) {
                    body.push(tableText);
                }
            }
        }

        return { title, body };
    }

    private extractTextContent(textContent: TextContent): string {
        if (!textContent?.textElements) return '';

        return textContent.textElements
            .filter(el => el.textRun?.content)
            .map(el => el.textRun!.content)
            .join('')
            .trim();
    }

    private extractTableText(table: { rows: number; columns: number; tableRows: TableRow[] }): string {
        const rows: string[] = [];

        for (const row of table.tableRows) {
            const cells: string[] = [];
            for (const cell of row.tableCells) {
                const cellText = cell.text ? this.extractTextContent(cell.text) : '';
                cells.push(cellText);
            }
            rows.push(`| ${cells.join(' | ')} |`);
        }

        if (rows.length > 0) {
            // Add header separator after first row
            const headerSep = `| ${Array(table.columns).fill('---').join(' | ')} |`;
            rows.splice(1, 0, headerSep);
        }

        return rows.join('\n');
    }
}
