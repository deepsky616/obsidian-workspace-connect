import { GoogleApiService } from './GoogleApiService';
import WorkspaceConnectPlugin from '../../main';
import { DocsConverter } from '../converters/DocsConverter';

export interface GoogleDocsDocument {
    documentId: string;
    title: string;
    body: {
        content: DocumentContent[];
    };
}

export interface DocumentContent {
    startIndex: number;
    endIndex: number;
    paragraph?: {
        elements: ParagraphElement[];
        paragraphStyle?: {
            namedStyleType?: string;
            headingId?: string;
        };
    };
    table?: {
        rows: number;
        columns: number;
        tableRows: TableRow[];
    };
    sectionBreak?: any;
}

export interface ParagraphElement {
    startIndex: number;
    endIndex: number;
    textRun?: {
        content: string;
        textStyle?: {
            bold?: boolean;
            italic?: boolean;
            underline?: boolean;
            strikethrough?: boolean;
            link?: { url: string };
        };
    };
    inlineObjectElement?: any;
}

export interface TableRow {
    tableCells: TableCell[];
}

export interface TableCell {
    content: DocumentContent[];
}

export class DocsService extends GoogleApiService {
    constructor(plugin: WorkspaceConnectPlugin) {
        super(plugin);
    }

    async getDocument(documentId: string): Promise<GoogleDocsDocument> {
        return await this.get(`https://docs.googleapis.com/v1/documents/${documentId}`);
    }

    async createDocument(title: string, content?: string): Promise<string> {
        // Create empty document
        const createResponse = await this.post('https://docs.googleapis.com/v1/documents', {
            title
        });

        const documentId = createResponse.documentId;

        // If content provided, add it
        if (content && content.trim()) {
            const requests = DocsConverter.markdownToDocsRequests(content);

            if (requests.length > 0) {
                await this.post(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
                    requests
                });
            }
        }

        return documentId;
    }

    async updateDocument(documentId: string, content: string): Promise<void> {
        // Get current document to find content range
        const doc = await this.getDocument(documentId);

        const requests: any[] = [];

        // Calculate end index (skip the newline at the start)
        let endIndex = 1;
        if (doc.body && doc.body.content) {
            const lastContent = doc.body.content[doc.body.content.length - 1];
            if (lastContent) {
                endIndex = lastContent.endIndex - 1;
            }
        }

        // Delete existing content if there is any
        if (endIndex > 1) {
            requests.push({
                deleteContentRange: {
                    range: {
                        startIndex: 1,
                        endIndex: endIndex
                    }
                }
            });
        }

        // Add new content
        const insertRequests = DocsConverter.markdownToDocsRequests(content);
        requests.push(...insertRequests);

        if (requests.length > 0) {
            await this.post(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
                requests
            });
        }
    }

    async appendContent(documentId: string, content: string): Promise<void> {
        const requests = DocsConverter.markdownToDocsRequests(content);

        if (requests.length > 0) {
            await this.post(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
                requests
            });
        }
    }
}
