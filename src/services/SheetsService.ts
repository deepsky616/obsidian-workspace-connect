import { GoogleApiService } from './GoogleApiService';
import WorkspaceConnectPlugin from '../../main';

export interface GoogleSpreadsheet {
    spreadsheetId: string;
    properties: {
        title: string;
    };
    sheets: Sheet[];
}

export interface Sheet {
    properties: {
        sheetId: number;
        title: string;
        gridProperties: {
            rowCount: number;
            columnCount: number;
        };
    };
    data?: SheetData[];
}

export interface SheetData {
    rowData: RowData[];
}

export interface RowData {
    values: CellData[];
}

export interface CellData {
    userEnteredValue?: {
        stringValue?: string;
        numberValue?: number;
        boolValue?: boolean;
        formulaValue?: string;
    };
    effectiveValue?: {
        stringValue?: string;
        numberValue?: number;
        boolValue?: boolean;
    };
    formattedValue?: string;
}

export class SheetsService extends GoogleApiService {
    constructor(plugin: WorkspaceConnectPlugin) {
        super(plugin);
    }

    async getSpreadsheet(spreadsheetId: string): Promise<GoogleSpreadsheet> {
        const params = new URLSearchParams({
            includeGridData: 'true'
        });

        return await this.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${params.toString()}`);
    }

    async getSheetValues(spreadsheetId: string, range: string = 'Sheet1'): Promise<string[][]> {
        const params = new URLSearchParams({
            valueRenderOption: 'FORMATTED_VALUE'
        });

        const response = await this.get(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?${params.toString()}`
        );

        return response.values || [];
    }

    async createSpreadsheet(title: string, data?: string[][]): Promise<string> {
        const spreadsheet: any = {
            properties: {
                title
            }
        };

        if (data && data.length > 0) {
            spreadsheet.sheets = [{
                properties: {
                    title: 'Sheet1'
                },
                data: [{
                    startRow: 0,
                    startColumn: 0,
                    rowData: data.map(row => ({
                        values: row.map(cell => ({
                            userEnteredValue: { stringValue: cell }
                        }))
                    }))
                }]
            }];
        }

        const response = await this.post('https://sheets.googleapis.com/v4/spreadsheets', spreadsheet);

        return response.spreadsheetId;
    }

    async updateSpreadsheet(spreadsheetId: string, data: string[][], range: string = 'Sheet1'): Promise<void> {
        const params = new URLSearchParams({
            valueInputOption: 'USER_ENTERED'
        });

        await this.put(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?${params.toString()}`,
            {
                range,
                majorDimension: 'ROWS',
                values: data
            }
        );
    }

    async appendToSpreadsheet(spreadsheetId: string, data: string[][], range: string = 'Sheet1'): Promise<void> {
        const params = new URLSearchParams({
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS'
        });

        await this.post(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?${params.toString()}`,
            {
                range,
                majorDimension: 'ROWS',
                values: data
            }
        );
    }

    async clearSpreadsheet(spreadsheetId: string, range: string = 'Sheet1'): Promise<void> {
        await this.post(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
            {}
        );
    }
}
