import { requestUrl, Notice } from 'obsidian';
import * as http from 'http';
import WorkspaceConnectPlugin from '../../main';

const OAUTH_PORT = 51895;
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback`;

const SCOPES = [
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/presentations',
    'https://www.googleapis.com/auth/forms.body',
    'https://www.googleapis.com/auth/forms.responses.readonly',
    'https://www.googleapis.com/auth/drive.file'
];

export class OAuthManager {
    plugin: WorkspaceConnectPlugin;
    private server: http.Server | null = null;

    constructor(plugin: WorkspaceConnectPlugin) {
        this.plugin = plugin;
    }

    async authenticate(): Promise<void> {
        const { clientId, clientSecret } = this.plugin.settings;

        if (!clientId || !clientSecret) {
            throw new Error('Client ID and Client Secret are required');
        }

        return new Promise((resolve, reject) => {
            // Start local HTTP server
            this.server = http.createServer(async (req, res) => {
                const url = new URL(req.url || '', `http://localhost:${OAUTH_PORT}`);

                if (url.pathname === '/callback') {
                    const code = url.searchParams.get('code');
                    const error = url.searchParams.get('error');

                    if (error) {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        res.end(`
                            <html>
                                <body style="font-family: -apple-system, system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1e1e1e; color: #fff;">
                                    <div style="text-align: center;">
                                        <h1 style="color: #e74c3c;">Authentication Failed</h1>
                                        <p>Error: ${error}</p>
                                        <p>You can close this window.</p>
                                    </div>
                                </body>
                            </html>
                        `);
                        this.closeServer();
                        reject(new Error(error));
                        return;
                    }

                    if (code) {
                        try {
                            // Exchange code for tokens
                            await this.exchangeCodeForTokens(code);

                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end(`
                                <html>
                                    <body style="font-family: -apple-system, system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1e1e1e; color: #fff;">
                                        <div style="text-align: center;">
                                            <h1 style="color: #2ecc71;">Authentication Successful!</h1>
                                            <p>You can close this window and return to Obsidian.</p>
                                        </div>
                                    </body>
                                </html>
                            `);

                            this.closeServer();
                            new Notice('Successfully connected to Google!');
                            resolve();

                        } catch (e: any) {
                            res.writeHead(500, { 'Content-Type': 'text/html' });
                            res.end(`
                                <html>
                                    <body style="font-family: -apple-system, system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1e1e1e; color: #fff;">
                                        <div style="text-align: center;">
                                            <h1 style="color: #e74c3c;">Token Exchange Failed</h1>
                                            <p>${e.message}</p>
                                            <p>You can close this window.</p>
                                        </div>
                                    </body>
                                </html>
                            `);
                            this.closeServer();
                            reject(e);
                        }
                    }
                } else {
                    res.writeHead(404);
                    res.end('Not Found');
                }
            });

            this.server.listen(OAUTH_PORT, () => {
                // Open Google OAuth page
                const authUrl = this.buildAuthUrl();
                window.open(authUrl);
                new Notice('Please complete authentication in your browser');
            });

            this.server.on('error', (e: any) => {
                if (e.code === 'EADDRINUSE') {
                    reject(new Error(`Port ${OAUTH_PORT} is already in use. Please close other applications using this port.`));
                } else {
                    reject(e);
                }
            });

            // Timeout after 5 minutes
            setTimeout(() => {
                if (this.server) {
                    this.closeServer();
                    reject(new Error('Authentication timed out'));
                }
            }, 5 * 60 * 1000);
        });
    }

    private buildAuthUrl(): string {
        const { clientId } = this.plugin.settings;

        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: REDIRECT_URI,
            response_type: 'code',
            scope: SCOPES.join(' '),
            access_type: 'offline',
            prompt: 'consent'
        });

        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    private async exchangeCodeForTokens(code: string): Promise<void> {
        const { clientId, clientSecret } = this.plugin.settings;

        const response = await requestUrl({
            url: 'https://oauth2.googleapis.com/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code'
            }).toString()
        });

        if (response.status !== 200) {
            throw new Error(`Token exchange failed: ${response.text}`);
        }

        const tokens = response.json;

        this.plugin.settings.accessToken = tokens.access_token;
        this.plugin.settings.refreshToken = tokens.refresh_token || this.plugin.settings.refreshToken;
        this.plugin.settings.tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

        await this.plugin.saveSettings();
    }

    async refreshAccessToken(): Promise<string> {
        const { clientId, clientSecret, refreshToken } = this.plugin.settings;

        if (!refreshToken) {
            throw new Error('No refresh token available. Please re-authenticate.');
        }

        const response = await requestUrl({
            url: 'https://oauth2.googleapis.com/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            }).toString()
        });

        if (response.status !== 200) {
            throw new Error(`Token refresh failed: ${response.text}`);
        }

        const tokens = response.json;

        this.plugin.settings.accessToken = tokens.access_token;
        this.plugin.settings.tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

        await this.plugin.saveSettings();

        return tokens.access_token;
    }

    async getValidAccessToken(): Promise<string> {
        const { accessToken, tokenExpiry } = this.plugin.settings;

        if (!accessToken) {
            throw new Error('Not authenticated. Please connect to Google first.');
        }

        // Check if token is expired (with 5 minute buffer)
        const expiryTime = new Date(tokenExpiry).getTime();
        const now = Date.now();
        const bufferMs = 5 * 60 * 1000;

        if (now >= expiryTime - bufferMs) {
            return await this.refreshAccessToken();
        }

        return accessToken;
    }

    private closeServer(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
}
