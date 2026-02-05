import { requestUrl, RequestUrlResponse } from 'obsidian';
import WorkspaceConnectPlugin from '../../main';

export interface ApiRequestOptions {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: any;
    headers?: Record<string, string>;
}

export class GoogleApiService {
    plugin: WorkspaceConnectPlugin;

    constructor(plugin: WorkspaceConnectPlugin) {
        this.plugin = plugin;
    }

    async request(options: ApiRequestOptions): Promise<any> {
        const accessToken = await this.plugin.oauthManager.getValidAccessToken();

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...options.headers
        };

        const requestOptions: any = {
            url: options.url,
            method: options.method || 'GET',
            headers
        };

        if (options.body) {
            requestOptions.body = JSON.stringify(options.body);
        }

        let response: RequestUrlResponse;
        let retries = 0;
        const maxRetries = 3;

        while (retries < maxRetries) {
            try {
                response = await requestUrl(requestOptions);

                if (response.status === 401) {
                    // Token expired, refresh and retry
                    const newToken = await this.plugin.oauthManager.refreshAccessToken();
                    requestOptions.headers['Authorization'] = `Bearer ${newToken}`;
                    retries++;
                    continue;
                }

                if (response.status >= 200 && response.status < 300) {
                    return response.json;
                }

                throw new Error(`API Error ${response.status}: ${response.text}`);

            } catch (e: any) {
                if (e.message?.includes('401') && retries < maxRetries - 1) {
                    const newToken = await this.plugin.oauthManager.refreshAccessToken();
                    requestOptions.headers['Authorization'] = `Bearer ${newToken}`;
                    retries++;
                    continue;
                }
                throw e;
            }
        }

        throw new Error('Max retries exceeded');
    }

    async get(url: string): Promise<any> {
        return this.request({ url, method: 'GET' });
    }

    async post(url: string, body?: any): Promise<any> {
        return this.request({ url, method: 'POST', body });
    }

    async patch(url: string, body?: any): Promise<any> {
        return this.request({ url, method: 'PATCH', body });
    }

    async put(url: string, body?: any): Promise<any> {
        return this.request({ url, method: 'PUT', body });
    }

    async delete(url: string): Promise<any> {
        return this.request({ url, method: 'DELETE' });
    }
}
