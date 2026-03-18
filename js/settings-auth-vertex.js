// Vertex credential import flow

function showVertexImportDialog() {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'vertex-import-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title">${window.t('settings.auth.vertex_title')}</h3>
                <button class="modal-close" id="vertex-modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="codex-auth-content">
                    <p>${window.t('settings.auth.vertex_desc')}</p>
                    <div class="form-group">
                        <label for="vertex-file-input">${window.t('settings.auth.vertex_json_label')} <span class="required">*</span></label>
                        <input type="file" id="vertex-file-input" class="form-input" accept=".json">
                        <small class="form-help">${window.t('settings.auth.vertex_json_help')}</small>
                    </div>
                    <div class="form-group">
                        <label for="vertex-location-input">${window.t('settings.auth.vertex_location_label')}</label>
                        <input type="text" id="vertex-location-input" class="form-input" placeholder="us-central1" value="us-central1">
                        <small class="form-help">${window.t('settings.auth.vertex_location_help')}</small>
                    </div>
                    <div class="auth-actions">
                        <button type="button" id="vertex-import-btn" class="btn-primary">${window.t('settings.auth.import')}</button>
                        <button type="button" id="vertex-cancel-btn" class="btn-cancel">${window.t('login.cancelBtn')}</button>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const fileInput = document.getElementById('vertex-file-input');
    const locationInput = document.getElementById('vertex-location-input');
    const importBtn = document.getElementById('vertex-import-btn');

    document.getElementById('vertex-modal-close').addEventListener('click', closeVertexImportDialog);
    document.getElementById('vertex-cancel-btn').addEventListener('click', closeVertexImportDialog);
    importBtn.addEventListener('click', () => handleVertexImport(fileInput, locationInput, importBtn));
    document.addEventListener('keydown', handleVertexEscapeKey);

    if (fileInput) {
        fileInput.focus();
    }
}

function handleVertexEscapeKey(e) {
    if (e.key === 'Escape') {
        closeVertexImportDialog();
    }
}

async function handleVertexImport(fileInput, locationInput, importBtn) {
    try {
        const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
        if (files.length === 0) {
            showError(window.t('settings.operation_failed', { error: window.t('settings.auth.vertex_json_label') }));
            return;
        }

        const file = files[0];
        if (!file.name.toLowerCase().endsWith('.json')) {
            showError(window.t('settings.operation_failed', { error: window.t('settings.auth.vertex_json_help') }));
            return;
        }

        const location = locationInput && locationInput.value ? locationInput.value.trim() : '';
        const resolvedLocation = location || 'us-central1';

        importBtn.disabled = true;
        importBtn.textContent = window.t('settings.auth.importing');

        const result = await configManager.importVertexCredential(file, resolvedLocation);

        if (result && result.success) {
            const project = result.data?.project_id ? ` for ${result.data.project_id}` : '';
            const locText = result.data?.location ? ` (${result.data.location})` : '';
            showSuccessMessage(window.t('settings.auth.vertex_success') + `${project}${locText}`);
            closeVertexImportDialog();
            if (typeof loadAuthFiles === 'function') {
                await loadAuthFiles();
            }
        } else {
            showError(result?.error ? window.t('settings.operation_failed', { error: result.error }) : window.t('settings.failed'));
        }
    } catch (error) {
        console.error('Error importing Vertex credential:', error);
        showError(window.t('settings.operation_failed', { error: error.message }));
    } finally {
        if (importBtn) {
            importBtn.disabled = false;
            importBtn.textContent = window.t('settings.auth.import');
        }
    }
}

function closeVertexImportDialog() {
    document.removeEventListener('keydown', handleVertexEscapeKey);
    const modal = document.getElementById('vertex-import-modal');
    if (modal) {
        modal.remove();
    }
}
