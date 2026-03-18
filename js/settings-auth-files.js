// Authentication files management: list, selection, upload/download, and actions

// Elements
const selectAllBtn = document.getElementById('select-all-btn');
const deleteBtn = document.getElementById('delete-btn');
const authFilesList = document.getElementById('auth-files-list');
const authLoading = document.getElementById('auth-loading');

// New dropdown elements
const newDropdown = document.getElementById('new-dropdown');
const newBtn = document.getElementById('new-btn');
const dropdownMenu = document.getElementById('dropdown-menu');
const downloadBtn = document.getElementById('download-btn');

// State
let selectedAuthFiles = new Set();
let authFiles = [];

// Load auth files from server
async function loadAuthFiles() {
    try {
        authFiles = await configManager.getAuthFiles();
        renderAuthFiles();
        updateActionButtons();
    } catch (error) {
        console.error('Error loading auth files:', error);
        showError(window.t('settings.failed'));
        showEmptyAuthFiles();
        updateActionButtons();
    }
}

// Render auth files list
function renderAuthFiles() {
    authLoading.style.display = 'none';
    if (authFiles.length === 0) {
        showEmptyAuthFiles();
        return;
    }
    authFilesList.innerHTML = '';
    authFiles.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'auth-file-item';
        fileItem.dataset.filename = file.name;

        const fileSize = formatFileSize(file.size);
        const modTime = formatDate(file.modtime);

        fileItem.innerHTML = `
            <div class="auth-file-info">
                <div class="auth-file-name">${file.name}</div>
                <div class="auth-file-details">
                    <span class="auth-file-type">${window.t('settings.auth.type')}: ${file.type || window.t('settings.status_unknown').toLowerCase()}</span>
                    <span class="auth-file-size">${fileSize}</span>
                    <span>${window.t('settings.auth.modified')}: ${modTime}</span>
                </div>
            </div>
        `;

        fileItem.addEventListener('click', () => toggleAuthFileSelection(file.name, fileItem));
        authFilesList.appendChild(fileItem);
    });
}

// Empty state for auth files
function showEmptyAuthFiles() {
    authLoading.style.display = 'none';
    authFilesList.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">📁</div>
            <div class="empty-state-text">${window.t('settings.auth.files_empty')}</div>
            <div class="empty-state-subtitle">${window.t('settings.auth.files_empty_subtitle')}</div>
        </div>
    `;
    updateActionButtons();
}

// Toggle selection of an auth file
function toggleAuthFileSelection(filename, fileItem) {
    if (selectedAuthFiles.has(filename)) {
        selectedAuthFiles.delete(filename);
        fileItem.classList.remove('selected');
    } else {
        selectedAuthFiles.add(filename);
        fileItem.classList.add('selected');
    }
    updateActionButtons();
}

// Update action buttons based on current tab/state
function updateActionButtons() {
    const hasSelection = selectedAuthFiles.size > 0;
    const allSelected = selectedAuthFiles.size === authFiles.length && authFiles.length > 0;
    const currentTab = document.querySelector('.tab.active').getAttribute('data-tab');
    if (currentTab === 'auth') {
        resetBtn.style.display = 'none';
        applyBtn.style.display = 'none';
        selectAllBtn.style.display = 'block';
        deleteBtn.style.display = 'block';
        newDropdown.style.display = 'block';
        downloadBtn.style.display = 'block';
        selectAllBtn.textContent = allSelected ? window.t('settings.auth.unselect_all') : window.t('settings.auth.select_all');
        deleteBtn.disabled = !hasSelection;
        downloadBtn.disabled = !hasSelection;
    } else if (currentTab === 'access-token' || currentTab === 'api' || currentTab === 'openai' || currentTab === 'basic') {
        resetBtn.style.display = 'block';
        applyBtn.style.display = 'block';
        selectAllBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
        newDropdown.style.display = 'none';
        downloadBtn.style.display = 'none';
    }
}

// Toggle select all auth files
function toggleSelectAllAuthFiles() {
    const allSelected = selectedAuthFiles.size === authFiles.length;
    if (allSelected) {
        selectedAuthFiles.clear();
        document.querySelectorAll('.auth-file-item').forEach(item => item.classList.remove('selected'));
    } else {
        selectedAuthFiles.clear();
        authFiles.forEach(file => selectedAuthFiles.add(file.name));
        document.querySelectorAll('.auth-file-item').forEach(item => item.classList.add('selected'));
    }
    updateActionButtons();
}

// Delete selected auth files
async function deleteSelectedAuthFiles() {
    if (selectedAuthFiles.size === 0 || deleteBtn.disabled) return;
    const fileCount = selectedAuthFiles.size;
    const fileText = fileCount === 1 ? 'file' : 'files';
    showConfirmDialog(
        window.t('settings.confirm_delete_title'),
        `${window.t('settings.confirm_delete_message')} (${fileCount} ${fileCount === 1 ? window.t('settings.auth.file') : window.t('settings.auth.files')})`,
        async () => {
            deleteBtn.disabled = true;
            deleteBtn.textContent = window.t('settings.auth.deleting');
            try {
                const result = await configManager.deleteAuthFiles(Array.from(selectedAuthFiles));
                if (result.success) {
                    showSuccessMessage(window.t('settings.success'));
                    selectedAuthFiles.clear();
                    await loadAuthFiles();
                } else {
                    if (result.error) {
                        showError(window.t('settings.operation_failed', { error: result.error }));
                    } else {
                        const fileText = result.errorCount === 1 ? window.t('settings.auth.file') : window.t('settings.auth.files');
                        showError(window.t('settings.auth.delete_failed_count', { count: result.errorCount, fileText: fileText }));
                    }
                }
            } catch (error) {
                console.error('Error deleting auth files:', error);
                showError(window.t('settings.failed'));
            } finally {
                deleteBtn.disabled = false;
                deleteBtn.textContent = window.t('settings.auth.delete');
                updateActionButtons();
            }
        }
    );
}

// Toggle dropdown menu visibility
function toggleDropdown() {
    dropdownMenu.classList.toggle('show');
}

// Close dropdown menu
function closeDropdown() {
    dropdownMenu.classList.remove('show');
}

// Create a new auth file by type
function createNewAuthFile(type) {
    const typeNames = {
        'gemini': 'Gemini CLI',
        'gemini-web': 'Gemini WEB',
        'claude': 'Claude Code',
        'codex': 'Codex',
        'qwen': 'Qwen Code',
        'vertex': 'Vertex',
        'iflow': 'iFlow',
        'antigravity': 'Antigravity',
        'local': 'Local File'
    };

    if (type === 'local') {
        uploadLocalFile();
    } else if (type === 'codex') {
        startCodexAuthFlow();
    } else if (type === 'claude') {
        startClaudeAuthFlow();
    } else if (type === 'gemini') {
        showGeminiProjectIdDialog();
    } else if (type === 'gemini-web') {
        showGeminiWebDialog();
    } else if (type === 'qwen') {
        startQwenAuthFlow();
    } else if (type === 'vertex') {
        showVertexImportDialog();
    } else if (type === 'antigravity') {
        startAntigravityAuthFlow();
    } else if (type === 'iflow') {
        startIFlowCookieFlow();
    } else {
        console.log(`Creating new ${typeNames[type]} auth file`);
        showSuccessMessage(window.t('settings.success'));
    }
}

// Show Gemini Web dialog
function showGeminiWebDialog() {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'gemini-web-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title">${window.t('settings.auth.gemini_web_title')}</h3>
                <button class="modal-close" id="gemini-web-modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="codex-auth-content">
                    <p>${window.t('settings.auth.gemini_web_desc')}</p>
                    <div class="form-group">
                        <label for="gemini-web-secure-1psid-input">${window.t('settings.auth.gemini_web_1psid_label')}:</label>
                        <input type="text" id="gemini-web-secure-1psid-input" class="form-input" placeholder="${window.t('settings.auth.gemini_web_1psid_placeholder')}">
                    </div>
                    <div class="form-group">
                        <label for="gemini-web-secure-1psidts-input">${window.t('settings.auth.gemini_web_1psidts_label')}:</label>
                        <input type="text" id="gemini-web-secure-1psidts-input" class="form-input" placeholder="${window.t('settings.auth.gemini_web_1psidts_placeholder')}">
                    </div>
                    <div class="form-group">
                        <label for="gemini-web-email-input" style="text-align: left;">${window.t('settings.auth.gemini_web_email_label')}:</label>
                        <input type="email" id="gemini-web-email-input" class="form-input" placeholder="${window.t('settings.auth.gemini_web_email_placeholder')}">
                    </div>
                    <div class="auth-actions">
                        <button type="button" id="gemini-web-confirm-btn" class="btn-primary">${window.t('settings.auth.confirm')}</button>
                        <button type="button" id="gemini-web-cancel-btn" class="btn-cancel">${window.t('settings.auth.cancel')}</button>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('gemini-web-modal-close').addEventListener('click', cancelGeminiWebDialog);
    document.getElementById('gemini-web-confirm-btn').addEventListener('click', confirmGeminiWebTokens);
    document.getElementById('gemini-web-cancel-btn').addEventListener('click', cancelGeminiWebDialog);
    document.addEventListener('keydown', handleGeminiWebEscapeKey);
    document.getElementById('gemini-web-secure-1psid-input').focus();
}

// Handle Gemini Web dialog escape key
function handleGeminiWebEscapeKey(e) {
    if (e.key === 'Escape') {
        cancelGeminiWebDialog();
    }
}

// Cancel Gemini Web dialog
function cancelGeminiWebDialog() {
    document.removeEventListener('keydown', handleGeminiWebEscapeKey);
    const modal = document.getElementById('gemini-web-modal');
    if (modal) modal.remove();
}

// Confirm Gemini Web tokens
async function confirmGeminiWebTokens() {
    try {
        const emailInput = document.getElementById('gemini-web-email-input');
        const secure1psidInput = document.getElementById('gemini-web-secure-1psid-input');
        const secure1psidtsInput = document.getElementById('gemini-web-secure-1psidts-input');

        const email = emailInput.value.trim();
        const secure1psid = secure1psidInput.value.trim();
        const secure1psidts = secure1psidtsInput.value.trim();

        if (!email || !secure1psid || !secure1psidts) {
            showError(window.t('settings.operation_failed', { error: window.t('settings.auth.gemini_web_error_missing') }));
            return;
        }

        cancelGeminiWebDialog();

        // Call Management API to save Gemini Web tokens
        const result = await configManager.saveGeminiWebTokens(secure1psid, secure1psidts, email);

        if (result.success) {
            showSuccessMessage(window.t('settings.success'));
            // Refresh the auth files list
            await loadAuthFiles();
        } else {
            showError(result.error ? window.t('settings.operation_failed', { error: result.error }) : window.t('settings.failed'));
        }
    } catch (error) {
        console.error('Error saving Gemini Web tokens:', error);
        showError(window.t('settings.operation_failed', { error: error.message }));
    }
}

// Upload local JSON files
function uploadLocalFile() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.click();
    fileInput.addEventListener('change', async (event) => {
        const files = Array.from(event.target.files);
        if (files.length === 0) {
            document.body.removeChild(fileInput);
            return;
        }
        const invalidFiles = files.filter(file => !file.name.toLowerCase().endsWith('.json'));
        if (invalidFiles.length > 0) {
            const fileList = invalidFiles.map(f => f.name).join(', ');
            showError(window.t('settings.auth.upload_invalid_type', { files: fileList }));
            document.body.removeChild(fileInput);
            return;
        }
        try {
            await uploadFilesToServer(files);
            await loadAuthFiles();
        } catch (error) {
            console.error('Error uploading files:', error);
            showError(window.t('settings.failed'));
        } finally {
            document.body.removeChild(fileInput);
        }
    });
}

// Upload multiple files via config manager
async function uploadFilesToServer(files) {
    try {
        const result = await configManager.uploadAuthFiles(files);
        if (result.success && result.successCount > 0) {
            const fileText = result.successCount === 1 ? window.t('settings.auth.file') : window.t('settings.auth.files');
            showSuccessMessage(window.t('settings.auth.upload_success_count', { count: result.successCount, fileText: fileText }));
        }
        if (result.errorCount > 0) {
            const fileText = result.errorCount === 1 ? window.t('settings.auth.file') : window.t('settings.auth.files');
            if (result.errors && result.errors.length <= 3) {
                showError(window.t('settings.auth.upload_failed_details', { count: result.errorCount, fileText: fileText, details: result.errors.join(', ') }));
            } else {
                showError(window.t('settings.auth.upload_failed_count', { count: result.errorCount, fileText: fileText }));
            }
        }
        if (result.error) {
            showError(window.t('settings.operation_failed', { error: result.error }));
        }
    } catch (error) {
        console.error('Error uploading files:', error);
        showError(window.t('settings.failed'));
    }
}

// Legacy single-file upload (kept for compatibility)
async function uploadSingleFile(file, apiUrl, password) {
    console.warn('uploadSingleFile is deprecated, use configManager.uploadAuthFiles() instead');
}

// Download selected auth files
async function downloadSelectedAuthFiles() {
    if (selectedAuthFiles.size === 0 || downloadBtn.disabled) return;
    downloadBtn.disabled = true;
    downloadBtn.textContent = window.t('settings.auth.downloading');
    try {
        const result = await configManager.downloadAuthFiles(Array.from(selectedAuthFiles));
        if (result.success && result.successCount > 0) {
            const fileText = result.successCount === 1 ? window.t('settings.auth.file') : window.t('settings.auth.files');
            showSuccessMessage(window.t('settings.auth.download_success_count', { count: result.successCount, fileText: fileText }));
        }
        if (result.errorCount > 0) {
            const fileText = result.errorCount === 1 ? window.t('settings.auth.file') : window.t('settings.auth.files');
            showError(window.t('settings.auth.download_failed_count', { count: result.errorCount, fileText: fileText }));
        }
        if (result.error) {
            showError(window.t('settings.operation_failed', { error: result.error }));
        }
    } catch (error) {
        console.error('Error downloading files:', error);
        showError(window.t('settings.failed'));
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = window.t('settings.auth.download');
    }
}

// Legacy single-file download (kept for compatibility)
async function downloadFileToDirectory(filename, directoryHandle, baseUrl, password) {
    console.warn('downloadFileToDirectory is deprecated, use configManager.downloadAuthFiles() instead');
}

// Event wiring for auth files UI
selectAllBtn.addEventListener('click', toggleSelectAllAuthFiles);
deleteBtn.addEventListener('click', deleteSelectedAuthFiles);
downloadBtn.addEventListener('click', downloadSelectedAuthFiles);

newBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
});

document.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = item.getAttribute('data-type');
        createNewAuthFile(type);
        closeDropdown();
    });
});

document.addEventListener('click', (e) => {
    if (!newDropdown.contains(e.target)) {
        closeDropdown();
    }
});
