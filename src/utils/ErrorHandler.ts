import { Notice } from 'obsidian';

export class ErrorHandler {
    /**
     * Handle API errors and display appropriate notices
     */
    static handleApiError(error: any, context: string): void {
        console.error(`[Workspace Connect] ${context}:`, error);

        let message = 'An error occurred';

        if (error.message) {
            // Parse common error types
            if (error.message.includes('401')) {
                message = 'Authentication expired. Please reconnect to Google.';
            } else if (error.message.includes('403')) {
                message = 'Access denied. Check your Google API permissions.';
            } else if (error.message.includes('404')) {
                message = 'File not found. It may have been deleted.';
            } else if (error.message.includes('429')) {
                message = 'Too many requests. Please wait a moment and try again.';
            } else if (error.message.includes('500') || error.message.includes('503')) {
                message = 'Google servers are temporarily unavailable. Try again later.';
            } else if (error.message.includes('EADDRINUSE')) {
                message = 'OAuth port is in use. Close other applications using port 51895.';
            } else if (error.message.includes('Network') || error.message.includes('fetch')) {
                message = 'Network error. Check your internet connection.';
            } else {
                message = error.message;
            }
        }

        new Notice(`${context}: ${message}`);
    }

    /**
     * Wrap an async function with error handling
     */
    static async wrapAsync<T>(
        fn: () => Promise<T>,
        context: string,
        showSuccess?: string
    ): Promise<T | null> {
        try {
            const result = await fn();
            if (showSuccess) {
                new Notice(showSuccess);
            }
            return result;
        } catch (error) {
            this.handleApiError(error, context);
            return null;
        }
    }

    /**
     * Validate that the plugin is authenticated
     */
    static requireAuth(isAuthenticated: boolean): boolean {
        if (!isAuthenticated) {
            new Notice('Please connect to Google first in settings');
            return false;
        }
        return true;
    }

    /**
     * Validate that required settings are configured
     */
    static validateSettings(clientId: string, clientSecret: string): boolean {
        if (!clientId || !clientSecret) {
            new Notice('Please configure Client ID and Client Secret in settings');
            return false;
        }
        return true;
    }

    /**
     * Parse Google API error response
     */
    static parseGoogleError(response: any): string {
        if (response.error) {
            if (typeof response.error === 'string') {
                return response.error;
            }
            if (response.error.message) {
                return response.error.message;
            }
            if (response.error.errors && response.error.errors.length > 0) {
                return response.error.errors[0].message;
            }
        }
        return 'Unknown error';
    }

    /**
     * Create a retry wrapper for flaky operations
     */
    static async withRetry<T>(
        fn: () => Promise<T>,
        maxRetries: number = 3,
        delayMs: number = 1000
    ): Promise<T> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error: any) {
                lastError = error;

                // Don't retry on auth errors
                if (error.message?.includes('401') || error.message?.includes('403')) {
                    throw error;
                }

                // Wait before retrying
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
                }
            }
        }

        throw lastError || new Error('Max retries exceeded');
    }
}
