import { GoogleApiService } from './GoogleApiService';
import WorkspaceConnectPlugin from '../../main';

export interface GoogleFile {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    webViewLink?: string;
}

const MIME_TYPES = {
    docs: 'application/vnd.google-apps.document',
    sheets: 'application/vnd.google-apps.spreadsheet',
    slides: 'application/vnd.google-apps.presentation',
    forms: 'application/vnd.google-apps.form'
};

export class DriveService extends GoogleApiService {
    constructor(plugin: WorkspaceConnectPlugin) {
        super(plugin);
    }

    async listFiles(type?: 'docs' | 'sheets' | 'slides' | 'forms', pageSize: number = 50): Promise<GoogleFile[]> {
        let query = "trashed = false";

        if (type) {
            query += ` and mimeType = '${MIME_TYPES[type]}'`;
        } else {
            const mimeQueries = Object.values(MIME_TYPES).map(m => `mimeType = '${m}'`).join(' or ');
            query += ` and (${mimeQueries})`;
        }

        const params = new URLSearchParams({
            q: query,
            pageSize: pageSize.toString(),
            fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
            orderBy: 'modifiedTime desc'
        });

        const response = await this.get(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);

        return response.files || [];
    }

    async searchFiles(searchTerm: string, type?: 'docs' | 'sheets' | 'slides' | 'forms'): Promise<GoogleFile[]> {
        let query = `trashed = false and name contains '${searchTerm}'`;

        if (type) {
            query += ` and mimeType = '${MIME_TYPES[type]}'`;
        } else {
            const mimeQueries = Object.values(MIME_TYPES).map(m => `mimeType = '${m}'`).join(' or ');
            query += ` and (${mimeQueries})`;
        }

        const params = new URLSearchParams({
            q: query,
            pageSize: '50',
            fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
            orderBy: 'modifiedTime desc'
        });

        const response = await this.get(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);

        return response.files || [];
    }

    async getFileMetadata(fileId: string): Promise<GoogleFile> {
        const params = new URLSearchParams({
            fields: 'id,name,mimeType,modifiedTime,webViewLink'
        });

        return await this.get(`https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}`);
    }

    getFileType(mimeType: string): 'docs' | 'sheets' | 'slides' | 'forms' | null {
        const entries = Object.entries(MIME_TYPES);
        for (const [type, mime] of entries) {
            if (mime === mimeType) {
                return type as 'docs' | 'sheets' | 'slides' | 'forms';
            }
        }
        return null;
    }
}
