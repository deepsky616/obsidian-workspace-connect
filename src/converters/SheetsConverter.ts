import { GoogleSpreadsheet, CellData } from '../services/SheetsService';

export class SheetsConverter {
    /**
     * Convert Google Spreadsheet to Markdown
     */
    static toMarkdown(spreadsheet: GoogleSpreadsheet): string {
        const lines: string[] = [];
        const title = spreadsheet.properties.title;

        // Add title
        lines.push(`# ${title}`);
        lines.push('');

        // Process each sheet
        for (const sheet of spreadsheet.sheets) {
            const sheetTitle = sheet.properties.title;

            // Add sheet name as heading if multiple sheets
            if (spreadsheet.sheets.length > 1) {
                lines.push(`## ${sheetTitle}`);
                lines.push('');
            }

            // Extract data from sheet
            if (sheet.data && sheet.data.length > 0) {
                const data = sheet.data[0];
                if (data.rowData && data.rowData.length > 0) {
                    const tableLines = this.rowDataToMarkdownTable(data.rowData);
                    lines.push(...tableLines);
                    lines.push('');
                }
            }
        }

        return lines.join('\n');
    }

    /**
     * Convert row data to Markdown table
     */
    private static rowDataToMarkdownTable(rowData: { values: CellData[] }[]): string[] {
        const lines: string[] = [];

        // Find the maximum number of columns
        let maxCols = 0;
        for (const row of rowData) {
            if (row.values) {
                maxCols = Math.max(maxCols, row.values.length);
            }
        }

        if (maxCols === 0) return [];

        // Convert each row
        for (let i = 0; i < rowData.length; i++) {
            const row = rowData[i];
            const cells: string[] = [];

            for (let j = 0; j < maxCols; j++) {
                const cell = row.values?.[j];
                const cellValue = this.getCellValue(cell);
                // Escape pipe characters
                cells.push(cellValue.replace(/\|/g, '\\|'));
            }

            lines.push(`| ${cells.join(' | ')} |`);

            // Add header separator after first row
            if (i === 0) {
                lines.push(`| ${Array(maxCols).fill('---').join(' | ')} |`);
            }
        }

        return lines;
    }

    /**
     * Get cell value as string
     */
    private static getCellValue(cell?: CellData): string {
        if (!cell) return '';

        // Prefer formatted value for display
        if (cell.formattedValue) {
            return cell.formattedValue;
        }

        // Fall back to effective or user entered value
        const value = cell.effectiveValue || cell.userEnteredValue;
        if (!value) return '';

        if (value.stringValue !== undefined) {
            return value.stringValue;
        }
        if (value.numberValue !== undefined) {
            return value.numberValue.toString();
        }
        if (value.boolValue !== undefined) {
            return value.boolValue ? 'TRUE' : 'FALSE';
        }

        return '';
    }

    /**
     * Convert 2D array to Markdown table
     */
    static arrayToMarkdownTable(data: string[][]): string {
        if (data.length === 0) return '';

        const lines: string[] = [];
        const maxCols = Math.max(...data.map(row => row.length));

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const cells: string[] = [];

            for (let j = 0; j < maxCols; j++) {
                const cell = row[j] || '';
                cells.push(cell.replace(/\|/g, '\\|'));
            }

            lines.push(`| ${cells.join(' | ')} |`);

            if (i === 0) {
                lines.push(`| ${Array(maxCols).fill('---').join(' | ')} |`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Extract tables from Markdown content
     * Returns array of 2D string arrays
     */
    static extractTables(markdown: string): string[][][] {
        const tables: string[][][] = [];
        const lines = markdown.split('\n');

        let currentTable: string[][] = [];
        let inTable = false;

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Check if line is a table row
            if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
                // Skip separator lines
                if (trimmedLine.match(/^\|[\s\-:|]+\|$/)) {
                    continue;
                }

                // Parse table row
                const cells = trimmedLine
                    .slice(1, -1) // Remove leading and trailing |
                    .split('|')
                    .map(cell => cell.trim().replace(/\\\|/g, '|')); // Unescape pipes

                currentTable.push(cells);
                inTable = true;
            } else {
                // End of table
                if (inTable && currentTable.length > 0) {
                    tables.push(currentTable);
                    currentTable = [];
                }
                inTable = false;
            }
        }

        // Don't forget the last table
        if (currentTable.length > 0) {
            tables.push(currentTable);
        }

        return tables;
    }

    /**
     * Convert Markdown table to 2D array
     */
    static markdownTableToArray(markdownTable: string): string[][] {
        const lines = markdownTable.split('\n').filter(line => line.trim());
        const data: string[][] = [];

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Skip if not a table row
            if (!trimmedLine.startsWith('|') || !trimmedLine.endsWith('|')) {
                continue;
            }

            // Skip separator lines
            if (trimmedLine.match(/^\|[\s\-:|]+\|$/)) {
                continue;
            }

            // Parse row
            const cells = trimmedLine
                .slice(1, -1)
                .split('|')
                .map(cell => cell.trim().replace(/\\\|/g, '|'));

            data.push(cells);
        }

        return data;
    }

    /**
     * Create a simple table with headers
     */
    static createTable(headers: string[], rows: string[][]): string {
        const allRows = [headers, ...rows];
        return this.arrayToMarkdownTable(allRows);
    }
}
