// iFlow cookie import flow (preferred)

function startIFlowCookieFlow() {
    showIFlowCookieDialog();
}

function showIFlowCookieDialog() {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'iflow-cookie-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title">${window.t('settings.auth.iflow_cookie_title')}</h3>
                <button class="modal-close" id="iflow-cookie-modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="codex-auth-content">
                    <p>${window.t('settings.auth.iflow_cookie_desc')}</p>
                    <div class="form-group">
                        <label for="iflow-cookie-input">${window.t('settings.auth.iflow_cookie_label')} <span class="required">*</span></label>
                        <textarea id="iflow-cookie-input" class="form-input" rows="4" placeholder="${window.t('settings.auth.iflow_cookie_placeholder')}"></textarea>
                        <small class="form-help">${window.t('settings.auth.iflow_cookie_help')}</small>
                    </div>
                    <div class="auth-actions">
                        <button type="button" id="iflow-cookie-save-btn" class="btn-primary">${window.t('settings.auth.save')}</button>
                        <button type="button" id="iflow-cookie-cancel-btn" class="btn-cancel">${window.t('login.cancelBtn')}</button>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    const input = document.getElementById('iflow-cookie-input');
    const saveBtn = document.getElementById('iflow-cookie-save-btn');
    document.getElementById('iflow-cookie-modal-close').addEventListener('click', closeIFlowCookieDialog);
    document.getElementById('iflow-cookie-cancel-btn').addEventListener('click', closeIFlowCookieDialog);
    saveBtn.addEventListener('click', () => handleIFlowCookieSubmit(input, saveBtn));
    document.addEventListener('keydown', handleIFlowCookieEscapeKey);
    if (input) {
        input.focus();
    }
}

async function handleIFlowCookieSubmit(inputEl, saveBtn) {
    try {
        const cookie = inputEl && inputEl.value ? inputEl.value.trim() : '';
        if (!cookie) {
            showError(window.t('settings.operation_failed', { error: window.t('settings.auth.iflow_cookie_label') }));
            return;
        }
        saveBtn.disabled = true;
        saveBtn.textContent = window.t('settings.saving');

        const result = await configManager.saveIFlowCookie(cookie);
        if (result && result.success) {
            const emailLabel = result.data?.email ? result.data.email : '';
            showSuccessMessage(window.t('settings.auth.iflow_cookie_success') + `${emailLabel ? ` for ${emailLabel}` : ''}`);
            closeIFlowCookieDialog();
            if (typeof loadAuthFiles === 'function') {
                await loadAuthFiles();
            }
        } else {
            showError(result?.error ? window.t('settings.operation_failed', { error: result.error }) : window.t('settings.failed'));
        }
    } catch (error) {
        console.error('Error saving iFlow cookie:', error);
        showError(window.t('settings.operation_failed', { error: error.message }));
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = window.t('settings.auth.save');
        }
    }
}

function closeIFlowCookieDialog() {
    document.removeEventListener('keydown', handleIFlowCookieEscapeKey);
    const modal = document.getElementById('iflow-cookie-modal');
    if (modal) {
        modal.remove();
    }
}

function handleIFlowCookieEscapeKey(e) {
    if (e.key === 'Escape') {
        closeIFlowCookieDialog();
    }
}

// Legacy iFlow authentication flow (kept for fallback)
// iFlow authentication flow (Electron-based local callback server)

let iflowLocalServer = null;
let iflowAuthUrl = null;
let iflowAuthState = null;
let iflowPollingInterval = null;
let iflowAbortController = null;

async function startIFlowAuthFlow() {
    try {
        console.log('Starting iFlow authentication flow...');

        // iFlow authentication requires starting HTTP server in both Local and Remote modes
        await startIFlowLocalServer();

        await getIFlowAuthUrl();
        showIFlowAuthDialog();
    } catch (error) {
        console.error('Error starting iFlow auth flow:', error);
        const msg = (error && (error.message || String(error))) || 'Unknown error';
        showError(window.t('settings.operation_failed', { error: msg }));
        if (iflowLocalServer) {
            await stopIFlowLocalServer();
        }
    }
}

async function startIFlowLocalServer() {
    try {
        const currentMode = localStorage.getItem('type') || 'local';
        let localPort = null, baseUrl = null;
        if (currentMode === 'local') {
            const config = await configManager.getConfig();
            localPort = config.port || 8317;
        } else {
            baseUrl = localStorage.getItem('base-url');
            if (!baseUrl) throw new Error('Missing base-url configuration');
        }
        await window.__TAURI__.core.invoke('start_callback_server', {
            provider: 'iflow',
            listenPort: 11451,
            mode: currentMode,
            baseUrl: baseUrl,
            localPort: localPort
        });
    } catch (error) { throw error; }
}

async function handleIFlowCallback(req, res) {
    try {
        console.log('Received callback from iFlow:', req.url);
        const url = new URL(req.url, `http://localhost:11451`);
        const currentMode = localStorage.getItem('type') || 'local';

        let redirectUrl;
        if (currentMode === 'local') {
            // Local mode: redirect to http://127.0.0.1:{port}/iflow/callback
            const config = await configManager.getConfig();
            const port = config.port || 8317; // Default port
            redirectUrl = `http://127.0.0.1:${port}/iflow/callback${url.search}`;
        } else {
            // Remote mode: redirect to base-url/iflow/callback
            const baseUrl = localStorage.getItem('base-url');
            if (!baseUrl) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Missing base-url configuration');
                return;
            }
            redirectUrl = baseUrl.endsWith('/') ? `${baseUrl}iflow/callback${url.search}` : `${baseUrl}/iflow/callback${url.search}`;
        }

        console.log('Redirecting to:', redirectUrl);
        res.writeHead(302, { 'Location': redirectUrl });
        res.end();
        setTimeout(async () => { await stopIFlowLocalServer(); showSuccessMessage(window.t('settings.success')); }, 1000);
    } catch (error) {
        console.error('Error handling iFlow callback:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal server error');
    }
}

async function stopIFlowLocalServer() { try { await window.__TAURI__.core.invoke('stop_callback_server', { listenPort: 11451 }); } catch (_) { } }

async function getIFlowAuthUrl() {
    try {
        const currentMode = localStorage.getItem('type') || 'local';
        let baseUrl, password;

        if (currentMode === 'local') {
            // Read configuration from config.yaml in Local mode
            const config = await configManager.getConfig();
            const port = config.port || 8317; // Default port
            baseUrl = `http://127.0.0.1:${port}`;
            password = localStorage.getItem('local-management-key') || '';
        } else {
            // Read configuration from localStorage in Remote mode
            baseUrl = localStorage.getItem('base-url');
            password = localStorage.getItem('password');
            if (!baseUrl || !password) throw new Error('Missing connection information');
        }

        const apiUrl = baseUrl.endsWith('/') ? `${baseUrl}v0/management/iflow-auth-url` : `${baseUrl}/v0/management/iflow-auth-url`;
        const headers = currentMode === 'local'
            ? { 'X-Management-Key': password, 'Content-Type': 'application/json' }
            : { 'Authorization': `Bearer ${password}`, 'Content-Type': 'application/json' };
        const response = await fetch(apiUrl, { method: 'GET', headers: headers });
        if (!response.ok) throw new Error(`Failed to get iFlow authentication URL: ${response.status}`);
        const data = await response.json();
        iflowAuthUrl = data.url;
        iflowAuthState = data.state;
        if (!iflowAuthUrl) throw new Error('No valid authentication URL received');
        if (!iflowAuthState) throw new Error('No valid authentication state received');
        console.log('Got iFlow auth URL:', iflowAuthUrl);
        console.log('Got iFlow auth state:', iflowAuthState);
    } catch (error) { console.error('Error getting iFlow auth URL:', error); throw error; }
}

function showIFlowAuthDialog() {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'iflow-auth-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title">${window.t('settings.auth.iflow_auth_title')}</h3>
                <button class="modal-close" id="iflow-modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="iflow-auth-content">
                    <p>${window.t('settings.auth.desc_generic')}</p>
                    <div class="auth-url-container">
                        <input type="text" id="iflow-auth-url-input" class="form-input" value="${iflowAuthUrl}" readonly>
                        <button type="button" id="iflow-copy-btn" class="copy-btn">${window.t('settings.auth.copy_link')}</button>
                    </div>
                    <div class="auth-status" id="iflow-auth-status" style="display: none;">
                        <div class="auth-status-text">${window.t('settings.auth.waiting')}</div>
                        <div class="auth-status-spinner"></div>
                    </div>
                    <div class="auth-actions">
                        <button type="button" id="iflow-open-btn" class="btn-primary">${window.t('settings.auth.open_link')}</button>
                        <button type="button" id="iflow-cancel-btn" class="btn-cancel">${window.t('login.cancelBtn')}</button>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('iflow-modal-close').addEventListener('click', cancelIFlowAuth);
    document.getElementById('iflow-copy-btn').addEventListener('click', copyIFlowUrl);
    document.getElementById('iflow-open-btn').addEventListener('click', openIFlowUrl);
    document.getElementById('iflow-cancel-btn').addEventListener('click', cancelIFlowAuth);
    // Disable backdrop click-to-close to avoid accidental dismiss
    document.addEventListener('keydown', handleIFlowEscapeKey);
    const input = document.getElementById('iflow-auth-url-input');
    input.focus(); input.select();

    // Start polling authentication status
    startIFlowAuthPolling();
}

async function copyIFlowUrl() {
    try { await navigator.clipboard.writeText(iflowAuthUrl); showSuccessMessage(window.t('settings.auth.link_copied')); }
    catch (error) { console.error('Error copying iFlow URL:', error); showError(window.t('settings.operation_failed', { error: error.message })); }
}

function openIFlowUrl() {
    try {
        if (window.__TAURI__?.shell?.open) { window.__TAURI__.shell.open(iflowAuthUrl); }
        else { window.open(iflowAuthUrl, '_blank'); }
        showSuccessMessage(window.t('settings.auth.link_opened'));

        // Show polling status
        const statusDiv = document.getElementById('iflow-auth-status');
        if (statusDiv) {
            statusDiv.style.display = 'block';
        }
    } catch (error) { console.error('Error opening iFlow URL:', error); showError(window.t('settings.operation_failed', { error: error.message })); }
}

// Start iFlow authentication status polling
async function startIFlowAuthPolling() {
    if (!iflowAuthState) {
        console.error('No auth state available for polling');
        return;
    }

    try {
        await pollIFlowAuthStatus(
            'iFlow',
            iflowAuthState,
            () => {
                // Authentication successful
                console.log('iFlow Authentication successful');
                showSuccessMessage(window.t('settings.success'));
                cancelIFlowAuth();
                // Refresh auth files list
                if (typeof loadAuthFiles === 'function') {
                    loadAuthFiles();
                }
            },
            (error) => {
                // Authentication failed
                console.error('iFlow Authentication failed:', error);
                showError(window.t('settings.operation_failed', { error: error }));
                cancelIFlowAuth();
            }
        );
    } catch (error) {
        console.error('iFlow Authentication polling error:', error);
        showError(window.t('settings.operation_failed', { error: error.message }));
        cancelIFlowAuth();
    }
}

async function cancelIFlowAuth() {
    try {
        console.log('Canceling iFlow authentication, current polling interval ID:', iflowPollingInterval);
        document.removeEventListener('keydown', handleIFlowEscapeKey);
        const modal = document.getElementById('iflow-auth-modal');
        if (modal) modal.remove();
        // Always stop local callback server to free the port
        await stopIFlowLocalServer();

        // Cancel ongoing requests
        if (iflowAbortController) {
            console.log('Canceling iFlow polling request');
            iflowAbortController.abort();
            iflowAbortController = null;
        }

        if (iflowPollingInterval) {
            console.log('Stopping iFlow polling, interval ID:', iflowPollingInterval);
            clearInterval(iflowPollingInterval);
            iflowPollingInterval = null;
            console.log('iFlow polling stopped');
        } else {
            console.log('No active iFlow polling to stop');
        }
        iflowAuthUrl = null;
        iflowAuthState = null;
    } catch (error) { console.error('Error canceling iFlow auth:', error); }
}

function handleIFlowEscapeKey(e) { if (e.key === 'Escape') cancelIFlowAuth(); }

// iFlow authentication status polling function
async function pollIFlowAuthStatus(authType, state, onSuccess, onError) {
    return new Promise((resolve, reject) => {
        // Create AbortController for canceling requests
        iflowAbortController = new AbortController();

        const pollInterval = setInterval(async () => {
            try {
                // Check if already canceled
                if (iflowAbortController.signal.aborted) {
                    console.log('iFlow polling has been canceled, stopping polling');
                    clearInterval(pollInterval);
                    iflowPollingInterval = null;
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
                    baseUrl = localStorage.getItem('base-url');
                    password = localStorage.getItem('password');
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
                    signal: iflowAbortController.signal
                });

                if (!response.ok) {
                    throw new Error(`Failed to get authentication status: ${response.status}`);
                }

                const data = await response.json();
                console.log(`${authType} authentication status:`, data);

                if (data.status === 'ok') {
                    clearInterval(pollInterval);
                    iflowPollingInterval = null;
                    iflowAbortController = null;
                    onSuccess();
                    resolve(data);
                } else if (data.status === 'error') {
                    clearInterval(pollInterval);
                    iflowPollingInterval = null;
                    iflowAbortController = null;
                    onError(data.error || 'Error occurred during authentication');
                    reject(new Error(data.error || 'Error occurred during authentication'));
                }
                // If status is 'wait', continue polling
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.log('iFlow polling request canceled');
                    clearInterval(pollInterval);
                    iflowPollingInterval = null;
                    iflowAbortController = null;
                    return;
                }
                console.error(`Error polling ${authType} authentication status:`, error);
                clearInterval(pollInterval);
                iflowPollingInterval = null;
                iflowAbortController = null;
                onError(error.message);
                reject(error);
            }
        }, 2000); // Poll every 2 seconds

        // Store polling interval ID in global variable for cancellation
        iflowPollingInterval = pollInterval;
        console.log('iFlow polling started, interval ID:', pollInterval);

        // Set timeout (5 minutes)
        setTimeout(() => {
            clearInterval(pollInterval);
            iflowPollingInterval = null;
            if (iflowAbortController) {
                iflowAbortController.abort();
                iflowAbortController = null;
            }
            onError(window.t('settings.auth.timeout'));
            reject(new Error('Authentication timeout'));
        }, 300000);
    });
}
