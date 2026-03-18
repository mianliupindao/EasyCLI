// Antigravity authentication flow using management API

let antigravityAuthUrl = null;
let antigravityAuthState = null;
let antigravityPollingInterval = null;
let antigravityAbortController = null;
let antigravityPollingActive = false;
let antigravityLocalServerStarted = false;

async function startAntigravityAuthFlow() {
    try {
        console.log('Starting Antigravity authentication flow...');
        await startAntigravityLocalServer();
        await getAntigravityAuthUrl();
        showAntigravityAuthDialog();
    } catch (error) {
        console.error('Error starting Antigravity auth flow:', error);
        const msg = (error && (error.message || String(error))) || 'Unknown error';
        showError(window.t('settings.operation_failed', { error: msg }));
        if (antigravityLocalServerStarted) {
            await stopAntigravityLocalServer();
        }
    }
}

async function startAntigravityLocalServer() {
    const currentMode = localStorage.getItem('type') || 'local';
    let localPort = null, baseUrl = null;
    if (currentMode === 'local') {
        const config = await configManager.getConfig();
        localPort = config.port || 8317;
    } else {
        configManager.refreshConnection();
        baseUrl = configManager.baseUrl;
        if (!baseUrl) throw new Error('Missing base-url configuration');
    }
    await window.__TAURI__.core.invoke('start_callback_server', {
        provider: 'antigravity',
        listenPort: 51121,
        mode: currentMode,
        baseUrl: baseUrl,
        localPort: localPort
    });
    antigravityLocalServerStarted = true;
}

async function stopAntigravityLocalServer() {
    try { await window.__TAURI__.core.invoke('stop_callback_server', { listenPort: 51121 }); } catch (_) { }
    antigravityLocalServerStarted = false;
}

async function getAntigravityAuthUrl() {
    try {
        const currentMode = localStorage.getItem('type') || 'local';
        let baseUrl, password;

        if (currentMode === 'local') {
            const config = await configManager.getConfig();
            const port = config.port || 8317;
            baseUrl = `http://127.0.0.1:${port}`;
            password = localStorage.getItem('local-management-key') || '';
        } else {
            configManager.refreshConnection();
            baseUrl = configManager.baseUrl;
            password = configManager.password;
            if (!baseUrl || !password) throw new Error('Missing connection information');
        }

        // Add is_webui=true to let backend start web UI friendly callback forwarder
        const baseApiUrl = baseUrl.endsWith('/')
            ? `${baseUrl}v0/management/antigravity-auth-url`
            : `${baseUrl}/v0/management/antigravity-auth-url`;
        const apiUrl = `${baseApiUrl}?is_webui=true`;

        const headers = currentMode === 'local'
            ? { 'X-Management-Key': password, 'Content-Type': 'application/json' }
            : { 'Authorization': `Bearer ${password}`, 'Content-Type': 'application/json' };
        const response = await fetch(apiUrl, { method: 'GET', headers });
        if (!response.ok) throw new Error(`Failed to get Antigravity authentication URL: ${response.status}`);
        const data = await response.json();
        antigravityAuthUrl = data.url;
        antigravityAuthState = data.state;
        if (!antigravityAuthUrl) throw new Error('No valid authentication URL received');
        if (!antigravityAuthState) throw new Error('No valid authentication state received');
        console.log('Got Antigravity auth URL:', antigravityAuthUrl);
        console.log('Got Antigravity auth state:', antigravityAuthState);
    } catch (error) { console.error('Error getting Antigravity auth URL:', error); throw error; }
}

function showAntigravityAuthDialog() {
    const modal = document.createElement('div');
    modal.id = 'antigravity-auth-modal';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title">${window.t('settings.auth.antigravity_title')}</h3>
                <button class="modal-close" id="antigravity-auth-modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="codex-auth-content">
                    <p>${window.t('settings.auth.antigravity_desc')}</p>
                    <div class="auth-url-container">
                        <input type="text" id="antigravity-auth-url-input" class="form-input" value="${antigravityAuthUrl}" readonly>
                        <button type="button" id="antigravity-copy-btn" class="copy-btn">${window.t('settings.auth.copy_link')}</button>
                    </div>
                    <div class="auth-status" id="antigravity-auth-status" style="display: none;">
                        <div class="auth-status-text">${window.t('settings.auth.waiting')}</div>
                        <div class="auth-status-spinner"></div>
                    </div>
                    <div class="auth-actions">
                        <button type="button" id="antigravity-open-btn" class="btn-primary">${window.t('settings.auth.open_link')}</button>
                        <button type="button" id="antigravity-cancel-btn" class="btn-cancel">${window.t('login.cancelBtn')}</button>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('antigravity-auth-modal-close').addEventListener('click', cancelAntigravityAuth);
    document.getElementById('antigravity-copy-btn').addEventListener('click', copyAntigravityUrl);
    document.getElementById('antigravity-open-btn').addEventListener('click', openAntigravityUrl);
    document.getElementById('antigravity-cancel-btn').addEventListener('click', cancelAntigravityAuth);
    document.addEventListener('keydown', handleAntigravityEscapeKey);
    const input = document.getElementById('antigravity-auth-url-input');
    input.focus(); input.select();

    // Start polling authentication status
    startAntigravityAuthPolling();
}

async function copyAntigravityUrl() {
    try { await navigator.clipboard.writeText(antigravityAuthUrl); showSuccessMessage(window.t('settings.auth.link_copied')); }
    catch (error) { console.error('Error copying Antigravity URL:', error); showError(window.t('settings.failed')); }
}

function openAntigravityUrl() {
    try {
        if (window.__TAURI__?.shell?.open) { window.__TAURI__.shell.open(antigravityAuthUrl); }
        else { window.open(antigravityAuthUrl, '_blank'); }
        showSuccessMessage(window.t('settings.auth.link_opened'));

        // Show polling status
        const statusDiv = document.getElementById('antigravity-auth-status');
        if (statusDiv) {
            statusDiv.style.display = 'block';
        }
    } catch (error) { console.error('Error opening Antigravity URL:', error); showError(window.t('settings.failed')); }
}

// Start Antigravity authentication status polling
async function startAntigravityAuthPolling() {
    if (!antigravityAuthState) {
        console.error('No auth state available for polling');
        return;
    }

    try {
        console.log('Starting Antigravity authentication polling, state:', antigravityAuthState);
        antigravityPollingActive = true;
        await pollAntigravityAuthStatus(
            'Antigravity',
            antigravityAuthState,
            () => {
                console.log('Antigravity Authentication successful');
                showSuccessMessage(window.t('settings.auth.antigravity_success'));
                cancelAntigravityAuth();
                if (typeof loadAuthFiles === 'function') {
                    loadAuthFiles();
                }
            },
            (error) => {
                console.error('Antigravity Authentication failed:', error);
                showError(window.t('settings.operation_failed', { error: error }));
                cancelAntigravityAuth();
            }
        );
    } catch (error) {
        console.error('Antigravity Authentication polling error:', error);
        showError(window.t('settings.operation_failed', { error: error.message }));
        cancelAntigravityAuth();
    }
}

async function cancelAntigravityAuth() {
    try {
        antigravityPollingActive = false;
        document.removeEventListener('keydown', handleAntigravityEscapeKey);
        const modal = document.getElementById('antigravity-auth-modal');
        if (modal) modal.remove();

        if (antigravityAbortController) {
            antigravityAbortController.abort();
            antigravityAbortController = null;
        }

        if (antigravityPollingInterval) {
            clearInterval(antigravityPollingInterval);
            antigravityPollingInterval = null;
        }

        antigravityAuthUrl = null;
        antigravityAuthState = null;
        if (antigravityLocalServerStarted) {
            await stopAntigravityLocalServer();
        }
    } catch (error) {
        console.error('Error canceling Antigravity auth:', error);
    }
}

function handleAntigravityEscapeKey(e) { if (e.key === 'Escape') cancelAntigravityAuth(); }

// Antigravity authentication status polling function
async function pollAntigravityAuthStatus(authType, state, onSuccess, onError) {
    return new Promise((resolve, reject) => {
        antigravityAbortController = new AbortController();

        const pollInterval = setInterval(async () => {
            try {
                if (!antigravityPollingActive || antigravityAbortController.signal.aborted) {
                    clearInterval(pollInterval);
                    antigravityPollingInterval = null;
                    antigravityAbortController = null;
                    return;
                }

                const currentMode = localStorage.getItem('type') || 'local';
                let baseUrl, password;

                if (currentMode === 'local') {
                    const config = await configManager.getConfig();
                    const port = config.port || 8317;
                    baseUrl = `http://127.0.0.1:${port}`;
                    password = localStorage.getItem('local-management-key') || '';
                } else {
                    configManager.refreshConnection();
                    baseUrl = configManager.baseUrl;
                    password = configManager.password;
                    if (!baseUrl || !password) throw new Error('Missing connection information');
                }

                const apiUrl = baseUrl.endsWith('/')
                    ? `${baseUrl}v0/management/get-auth-status?state=${encodeURIComponent(state)}`
                    : `${baseUrl}/v0/management/get-auth-status?state=${encodeURIComponent(state)}`;

                const headers = currentMode === 'local'
                    ? { 'X-Management-Key': password, 'Content-Type': 'application/json' }
                    : { 'Authorization': `Bearer ${password}`, 'Content-Type': 'application/json' };

                const response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: headers,
                    signal: antigravityAbortController.signal
                });

                if (!response.ok) {
                    throw new Error(`Failed to get authentication status: ${response.status}`);
                }

                const data = await response.json();
                console.log(`${authType} authentication status:`, data);

                if (data.status === 'ok') {
                    clearInterval(pollInterval);
                    antigravityPollingInterval = null;
                    antigravityAbortController = null;
                    onSuccess();
                    resolve(data);
                } else if (data.status === 'error') {
                    clearInterval(pollInterval);
                    antigravityPollingInterval = null;
                    const errMsg = data.error || 'Error occurred during authentication';
                    antigravityAbortController = null;
                    onError(errMsg);
                    reject(new Error(errMsg));
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    clearInterval(pollInterval);
                    antigravityPollingInterval = null;
                    antigravityAbortController = null;
                    return;
                }
                console.error(`Error polling ${authType} authentication status:`, error);
                clearInterval(pollInterval);
                antigravityPollingInterval = null;
                antigravityAbortController = null;
                onError(error.message);
                reject(error);
            }
        }, 2000);

        antigravityPollingInterval = pollInterval;
        console.log('Antigravity polling started, interval ID:', pollInterval);

        // Timeout after 5 minutes
        setTimeout(() => {
            clearInterval(pollInterval);
            antigravityPollingInterval = null;
            if (antigravityAbortController) {
                antigravityAbortController.abort();
                antigravityAbortController = null;
            }
            onError(window.t('settings.auth.timeout'));
            reject(new Error('Authentication timeout'));
        }, 300000);
    });
}
