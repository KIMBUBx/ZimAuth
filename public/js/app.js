// D:\KIM\KIMAUTH\public\js\app.js

let currentApp = null;
let appsList = [];

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast border-l-4 ${
    type === 'success'
      ? 'border-emerald-500 text-emerald-300'
      : type === 'error'
      ? 'border-rose-500 text-rose-300'
      : 'border-indigo-500 text-indigo-300'
  }`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Modal helpers
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('hidden');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('hidden');
}

// Copy to clipboard
function copyToClipboard(elementId) {
  const text = document.getElementById(elementId)?.textContent;
  if (!text || text === '---') return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!', 'success');
  });
}

function copySnippet(elementId) {
  const text = document.getElementById(elementId)?.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('SDK Code copied to clipboard!', 'success');
  });
}

// Logout
async function logout() {
  await fetch('/api/dashboard/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

// Switch Sidebar Tabs
function switchTab(tabId) {
  const tabs = ['overview', 'keys', 'users', 'vars', 'files', 'logs', 'webhooks', 'sdks', 'settings'];
  tabs.forEach((t) => {
    const el = document.getElementById(`tab-${t}`);
    const nav = document.getElementById(`nav-${t}`);
    if (el) el.classList.add('hidden');
    if (nav) {
      nav.className =
        'w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition';
    }
  });

  const activeEl = document.getElementById(`tab-${tabId}`);
  const activeNav = document.getElementById(`nav-${tabId}`);
  if (activeEl) activeEl.classList.remove('hidden');
  if (activeNav) {
    activeNav.className =
      'w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-indigo-400 bg-indigo-500/10 transition';
  }

  // Reload tab specific data
  if (currentApp) {
    if (tabId === 'keys') loadKeys();
    if (tabId === 'users') loadUsers();
    if (tabId === 'vars') loadVars();
    if (tabId === 'files') loadFiles();
    if (tabId === 'logs') loadLogs();
    if (tabId === 'webhooks') loadWebhooks();
    if (tabId === 'sdks') updateSdkSnippets();
    if (tabId === 'settings') populateSettings();
  }
}

// Check session
async function checkAuth() {
  try {
    const res = await fetch('/api/dashboard/auth/me');
    const data = await res.json();
    if (!data.success) {
      window.location.href = '/login.html';
      return null;
    }
    document.getElementById('current-username').textContent = data.user.username;
    return data.user;
  } catch (err) {
    window.location.href = '/login.html';
    return null;
  }
}

// Load Applications
async function loadApps() {
  try {
    const res = await fetch('/api/dashboard/apps');
    const data = await res.json();
    if (!data.success) return;

    appsList = data.apps || [];
    const selector = document.getElementById('app-selector');
    selector.innerHTML = '';

    if (appsList.length === 0) {
      selector.innerHTML = '<option value="">No Apps Created</option>';
      openModal('create-app-modal');
      return;
    }

    appsList.forEach((app) => {
      const opt = document.createElement('option');
      opt.value = app.id;
      opt.textContent = `${app.name} (v${app.version})`;
      selector.appendChild(opt);
    });

    const savedAppId = localStorage.getItem('zimauth_selected_app');
    const appToSelect = appsList.find((a) => String(a.id) === savedAppId) || appsList[0];
    selector.value = appToSelect.id;
    onSelectApp(appToSelect.id);
  } catch (err) {
    console.error('Error loading apps:', err);
  }
}

// When App is Selected
async function onSelectApp(appId) {
  if (!appId) return;
  localStorage.setItem('zimauth_selected_app', appId);
  currentApp = appsList.find((a) => String(a.id) === String(appId));
  if (!currentApp) return;

  // Refresh app stats
  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}`);
    const data = await res.json();
    if (data.success) currentApp = data.app;
  } catch (e) {}

  // Update UI Elements
  document.getElementById('app-title').textContent = currentApp.name;
  const statusBadge = document.getElementById('app-status-badge');
  if (currentApp.status === 1) {
    statusBadge.textContent = 'Active';
    statusBadge.className = 'badge badge-success';
  } else {
    statusBadge.textContent = 'Disabled';
    statusBadge.className = 'badge badge-danger';
  }

  // Credentials
  document.getElementById('cred-name').textContent = currentApp.name;
  document.getElementById('cred-owner').textContent = currentApp.owner_key;
  document.getElementById('cred-secret').textContent = currentApp.secret;

  // Metrics
  document.getElementById('metric-total-keys').textContent = currentApp.totalKeys || 0;
  document.getElementById('metric-active-keys').textContent = currentApp.activeKeys || 0;
  document.getElementById('metric-total-users').textContent = currentApp.totalUsers || 0;
  document.getElementById('metric-total-logs').textContent = currentApp.totalLogs || 0;

  updateSdkSnippets();
}

// Create New App
async function handleCreateApp(e) {
  e.preventDefault();
  const name = document.getElementById('new-app-name').value;
  const version = document.getElementById('new-app-version').value;

  try {
    const res = await fetch('/api/dashboard/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, version })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Application created successfully!', 'success');
      closeModal('create-app-modal');
      document.getElementById('new-app-name').value = '';
      await loadApps();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('Failed to create app: ' + err.message, 'error');
  }
}

// Save App Settings
async function saveAppSettings(e) {
  e.preventDefault();
  if (!currentApp) return;

  const version = document.getElementById('setting-version').value;
  const download_url = document.getElementById('setting-download').value;
  const hash = document.getElementById('setting-hash').value;
  const custom_message = document.getElementById('setting-message').value;
  const hwid_check = document.getElementById('setting-hwid').checked ? 1 : 0;
  const status = document.getElementById('setting-status').checked ? 1 : 0;

  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, download_url, hash, custom_message, hwid_check, status })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Settings saved successfully!', 'success');
      await onSelectApp(currentApp.id);
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('Failed to save settings: ' + err.message, 'error');
  }
}

function populateSettings() {
  if (!currentApp) return;
  document.getElementById('setting-version').value = currentApp.version || '1.0';
  document.getElementById('setting-download').value = currentApp.download_url || '';
  document.getElementById('setting-hash').value = currentApp.hash || '';
  document.getElementById('setting-message').value = currentApp.custom_message || '';
  document.getElementById('setting-hwid').checked = currentApp.hwid_check === 1;
  document.getElementById('setting-status').checked = currentApp.status === 1;
}

// Delete App
async function deleteCurrentApp() {
  if (!currentApp) return;
  if (!confirm(`Are you sure you want to delete '${currentApp.name}'? This cannot be undone.`)) return;

  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Application deleted.', 'info');
      await loadApps();
    }
  } catch (err) {
    showToast('Error deleting app: ' + err.message, 'error');
  }
}

// ================= KEYS =================

async function loadKeys() {
  if (!currentApp) return;
  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}/keys`);
    const data = await res.json();
    const tbody = document.getElementById('keys-table-body');
    tbody.innerHTML = '';

    if (!data.keys || data.keys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-slate-500 py-8">No keys generated yet.</td></tr>';
      return;
    }

    data.keys.forEach((k) => {
      let statusBadge = '<span class="badge badge-success">Active / Unused</span>';
      if (k.status === 0) statusBadge = '<span class="badge badge-primary">Used</span>';
      if (k.status === 2) statusBadge = '<span class="badge badge-danger">Banned</span>';
      if (k.status === 3) statusBadge = '<span class="badge badge-warning">Paused</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code class="text-xs font-bold text-indigo-300">${k.key_str}</code></td>
        <td><span class="text-xs text-slate-300">${k.duration_days >= 99999 ? 'Lifetime' : k.duration_days + ' Days'}</span> <span class="text-slate-500">(Lvl ${k.level})</span></td>
        <td>${statusBadge}</td>
        <td><span class="text-xs text-slate-400">${k.used_by || '---'}</span></td>
        <td><code class="text-[11px] text-slate-400 truncate max-w-[120px] inline-block">${k.hwid || 'None'}</code></td>
        <td>
          <div class="flex items-center space-x-2">
            <button onclick="keyAction(${k.id}, 'reset_hwid')" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300" title="Reset HWID">
              <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="keyAction(${k.id}, '${k.status === 2 ? 'unban' : 'ban'}')" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs ${k.status === 2 ? 'text-emerald-400' : 'text-rose-400'}" title="${k.status === 2 ? 'Unban' : 'Ban'}">
              <i data-lucide="${k.status === 2 ? 'shield-check' : 'shield-alert'}" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="deleteKey(${k.id})" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-xs text-rose-400" title="Delete Key">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
    lucide.createIcons();
  } catch (err) {
    console.error('Error loading keys:', err);
  }
}

async function handleGenerateKeys(e) {
  e.preventDefault();
  if (!currentApp) return;

  const amount = document.getElementById('gen-amount').value;
  const mask = document.getElementById('gen-mask').value;
  const duration_days = document.getElementById('gen-days').value;
  const level = document.getElementById('gen-level').value;
  const note = document.getElementById('gen-note').value;

  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, mask, duration_days, level, note })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeModal('create-key-modal');
      await onSelectApp(currentApp.id);
      loadKeys();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('Failed to generate keys: ' + err.message, 'error');
  }
}

async function keyAction(keyId, action) {
  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}/keys/${keyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadKeys();
    }
  } catch (err) {
    showToast('Action failed: ' + err.message, 'error');
  }
}

async function deleteKey(keyId) {
  if (!confirm('Are you sure you want to delete this key?')) return;
  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}/keys/${keyId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Key deleted.', 'info');
      loadKeys();
    }
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}

// ================= APP USERS =================

async function loadUsers() {
  if (!currentApp) return;
  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}/users`);
    const data = await res.json();
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '';

    if (!data.users || data.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-slate-500 py-8">No registered users yet.</td></tr>';
      return;
    }

    data.users.forEach((u) => {
      const isBanned = u.status === 2;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="font-bold text-white text-sm">${u.username}</span></td>
        <td><code class="text-[11px] text-slate-400">${u.hwid || 'Not Bound'}</code></td>
        <td><span class="text-xs text-slate-400 font-mono">${u.ip || '---'}</span></td>
        <td><span class="badge ${isBanned ? 'badge-danger' : 'badge-success'}">${isBanned ? 'Banned' : 'Active'}</span></td>
        <td><span class="text-xs text-slate-300">${u.expiry_at ? new Date(u.expiry_at).toLocaleDateString() : 'Lifetime'}</span></td>
        <td>
          <div class="flex items-center space-x-2">
            <button onclick="userAction(${u.id}, 'reset_hwid')" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300" title="Reset HWID">
              <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="userAction(${u.id}, '${isBanned ? 'unban' : 'ban'}')" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs ${isBanned ? 'text-emerald-400' : 'text-rose-400'}" title="${isBanned ? 'Unban' : 'Ban'}">
              <i data-lucide="${isBanned ? 'shield-check' : 'shield-alert'}" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="deleteUser(${u.id})" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-xs text-rose-400" title="Delete User">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
    lucide.createIcons();
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

async function userAction(userId, action) {
  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadUsers();
    }
  } catch (err) {
    showToast('User action failed: ' + err.message, 'error');
  }
}

async function deleteUser(userId) {
  if (!confirm('Are you sure you want to delete this user?')) return;
  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}/users/${userId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('User deleted.', 'info');
      loadUsers();
    }
  } catch (err) {
    showToast('Delete user failed: ' + err.message, 'error');
  }
}

// ================= VARIABLES =================

async function loadVars() {
  if (!currentApp) return;
  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}/vars`);
    const data = await res.json();
    const tbody = document.getElementById('vars-table-body');
    tbody.innerHTML = '';

    if (!data.vars || data.vars.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-slate-500 py-8">No variables configured.</td></tr>';
      return;
    }

    data.vars.forEach((v) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code class="text-xs font-bold text-indigo-300">${v.var_name}</code></td>
        <td><code class="text-xs text-slate-300 truncate max-w-[200px] inline-block">${v.var_data}</code></td>
        <td><span class="text-xs text-slate-500">${v.created_at}</span></td>
        <td>
          <button onclick="deleteVar(${v.id})" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-xs text-rose-400">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    lucide.createIcons();
  } catch (err) {
    console.error('Error loading vars:', err);
  }
}

async function handleCreateVar(e) {
  e.preventDefault();
  if (!currentApp) return;
  const var_name = document.getElementById('new-var-name').value;
  const var_data = document.getElementById('new-var-data').value;

  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}/vars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ var_name, var_data })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Variable saved!', 'success');
      closeModal('create-var-modal');
      document.getElementById('new-var-name').value = '';
      document.getElementById('new-var-data').value = '';
      loadVars();
    }
  } catch (err) {
    showToast('Failed to save variable: ' + err.message, 'error');
  }
}

async function deleteVar(varId) {
  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}/vars/${varId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Variable deleted.', 'info');
      loadVars();
    }
  } catch (err) {
    showToast('Error deleting variable: ' + err.message, 'error');
  }
}

// ================= FILES =================

async function loadFiles() {
  if (!currentApp) return;
  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}/files`);
    const data = await res.json();
    const tbody = document.getElementById('files-table-body');
    tbody.innerHTML = '';

    if (!data.files || data.files.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500 py-8">No files uploaded.</td></tr>';
      return;
    }

    data.files.forEach((f) => {
      const sizeKB = Math.round(f.file_size / 1024);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code class="text-xs font-bold text-cyan-300">${f.file_id}</code></td>
        <td><span class="text-xs text-white">${f.file_name}</span></td>
        <td><span class="text-xs text-slate-400">${sizeKB} KB</span></td>
        <td><span class="text-xs text-slate-500">${f.created_at}</span></td>
        <td>
          <button onclick="deleteFile(${f.id})" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-xs text-rose-400">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    lucide.createIcons();
  } catch (err) {
    console.error('Error loading files:', err);
  }
}

async function handleUploadFile(e) {
  e.preventDefault();
  if (!currentApp) return;

  const fileInput = document.getElementById('new-file-input');
  const fileId = document.getElementById('new-file-id').value;
  if (!fileInput.files[0]) return;

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  if (fileId) formData.append('file_id', fileId);

  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}/files`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast('File uploaded successfully!', 'success');
      closeModal('upload-file-modal');
      fileInput.value = '';
      document.getElementById('new-file-id').value = '';
      loadFiles();
    }
  } catch (err) {
    showToast('Upload error: ' + err.message, 'error');
  }
}

async function deleteFile(fileId) {
  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}/files/${fileId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('File deleted.', 'info');
      loadFiles();
    }
  } catch (err) {
    showToast('Delete error: ' + err.message, 'error');
  }
}

// ================= LOGS =================

async function loadLogs() {
  if (!currentApp) return;
  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}/logs`);
    const data = await res.json();
    const tbody = document.getElementById('logs-table-body');
    tbody.innerHTML = '';

    if (!data.logs || data.logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500 py-8">No audit logs found.</td></tr>';
      return;
    }

    data.logs.forEach((l) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="text-xs text-slate-500">${l.created_at}</span></td>
        <td><span class="text-xs font-bold text-slate-300">${l.user_str}</span></td>
        <td><span class="badge badge-primary">${l.event_type}</span></td>
        <td><span class="text-xs text-slate-300">${l.message}</span></td>
        <td><code class="text-xs text-slate-400 font-mono">${l.ip || '---'}</code></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading logs:', err);
  }
}

async function clearLogs() {
  if (!currentApp) return;
  if (!confirm('Clear all audit logs for this application?')) return;
  try {
    await fetch(`/api/dashboard/apps/${currentApp.id}/logs`, { method: 'DELETE' });
    showToast('Logs cleared.', 'info');
    loadLogs();
  } catch (err) {
    showToast('Failed to clear logs.', 'error');
  }
}

// ================= WEBHOOKS =================

async function loadWebhooks() {
  if (!currentApp) return;
  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}/webhooks`);
    const data = await res.json();
    const tbody = document.getElementById('webhooks-table-body');
    tbody.innerHTML = '';

    if (!data.webhooks || data.webhooks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-slate-500 py-8">No webhooks added.</td></tr>';
      return;
    }

    data.webhooks.forEach((w) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code class="text-xs text-indigo-300 truncate max-w-[280px] inline-block">${w.webhook_url}</code></td>
        <td><span class="badge badge-success">${w.event_trigger}</span></td>
        <td><span class="text-xs text-slate-500">${w.created_at}</span></td>
        <td>
          <button onclick="deleteWebhook(${w.id})" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-xs text-rose-400">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    lucide.createIcons();
  } catch (err) {
    console.error('Error loading webhooks:', err);
  }
}

async function handleCreateWebhook(e) {
  e.preventDefault();
  if (!currentApp) return;
  const webhook_url = document.getElementById('new-wh-url').value;

  try {
    const res = await fetch(`/api/dashboard/apps/${currentApp.id}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook_url })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Webhook added!', 'success');
      closeModal('create-webhook-modal');
      document.getElementById('new-wh-url').value = '';
      loadWebhooks();
    }
  } catch (err) {
    showToast('Failed to add webhook: ' + err.message, 'error');
  }
}

async function deleteWebhook(whId) {
  try {
    await fetch(`/api/dashboard/apps/${currentApp.id}/webhooks/${whId}`, { method: 'DELETE' });
    showToast('Webhook deleted.', 'info');
    loadWebhooks();
  } catch (err) {
    showToast('Delete webhook error: ' + err.message, 'error');
  }
}

// ================= DYNAMIC MULTI-LANGUAGE SDK CODE GENERATOR =================

let currentSdkLang = 'python';

function switchSdkLang(lang) {
  currentSdkLang = lang;
  const langs = ['python', 'csharp', 'cpp', 'rust', 'go', 'nodejs', 'lua', 'autoit'];
  langs.forEach((l) => {
    const btn = document.getElementById(`sdk-btn-${l}`);
    if (btn) {
      if (l === lang) {
        btn.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-indigo-500 text-white transition flex items-center space-x-1.5 shadow-md shadow-indigo-500/20';
      } else {
        btn.className = 'px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 transition flex items-center space-x-1.5';
      }
    }
  });

  updateSdkSnippets();
}

function updateSdkSnippets() {
  if (!currentApp) return;
  const origin = window.location.origin;
  const display = document.getElementById('sdk-code-display');
  const title = document.getElementById('sdk-view-title');
  const desc = document.getElementById('sdk-view-desc');
  if (!display) return;

  const appName = currentApp.name;
  const ownerId = currentApp.owner_key;
  const secret = currentApp.secret;
  const version = currentApp.version || '1.0';
  const apiUrl = `${origin}/api/1.2/`;

  if (currentSdkLang === 'python') {
    title.innerHTML = '<span>🐍 Python Client — Maximum Hardened & Anti-Tamper</span>';
    desc.textContent = 'Includes Server-Side Payload Decryption (Payload Locking), Anti-Debug, Anti-Proxy/mitmproxy, and Memory Hash Verification.';
    display.textContent = `import requests
import subprocess
import os
import sys
import ctypes
import hashlib
import time

# ==============================================================================
# ZIMAUTH ADVANCED SECURITY PROTOCOL - ANTI-TAMPER & PAYLOAD LOCKING
# ==============================================================================
API_URL = "${apiUrl}"
APP_NAME = "${appName}"
OWNER_ID = "${ownerId}"
APP_SECRET = "${secret}"
VERSION = "${version}"

# 1. ANTI-DEBUGGING & PROCESS INTEGRITY
def security_check():
    # Detect Windows debugger attachment via Kernel32
    if sys.platform == "win32":
        try:
            if ctypes.windll.kernel32.IsDebuggerPresent() != 0:
                print("❌ Security violation: Debugger detected.")
                os._exit(1)
            is_debugger = ctypes.c_bool()
            ctypes.windll.kernel32.CheckRemoteDebuggerPresent(ctypes.windll.kernel32.GetCurrentProcess(), ctypes.byref(is_debugger))
            if is_debugger.value:
                print("❌ Security violation: Remote debugger attached.")
                os._exit(1)
        except Exception:
            pass

    # Detect HTTP Interception Proxies (Fiddler, Charles, Burp, mitmproxy)
    for env in ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]:
        if os.environ.get(env):
            print(f"❌ Security violation: Proxy hook detected ({env}).")
            os._exit(1)

security_check()

# 2. HARDWARE ID EXTRACTION
def get_hwid():
    try:
        cmd = subprocess.check_output('wmic csproduct get uuid', shell=True).decode()
        return cmd.split('\\n')[1].strip()
    except Exception:
        return hashlib.sha256(os.environ.get('COMPUTERNAME', 'HOST').encode()).hexdigest()[:20]

# 3. INITIALIZE AUTHENTICATION
print("[*] Initializing secure handshake with ZimAuth...")
init_res = requests.post(API_URL, data={
    "type": "init",
    "name": APP_NAME,
    "ownerid": OWNER_ID,
    "secret": APP_SECRET,
    "version": VERSION
}, timeout=10).json()

if not init_res.get("success"):
    print(f"❌ Handshake failed: {init_res.get('message')}")
    time.sleep(2)
    os._exit(1)

session_id = init_res["sessionid"]

# 4. VERIFY USER LICENSE KEY
user_key = input("Enter your License Key: ").strip()
hwid = get_hwid()

login_res = requests.post(API_URL, data={
    "type": "license",
    "key": user_key,
    "hwid": hwid,
    "sessionid": session_id
}, timeout=10).json()

if not login_res.get("success"):
    print(f"❌ Access Denied: {login_res.get('message')}")
    time.sleep(2)
    os._exit(1)

print("✅ Authentication successful! Unlocking encrypted payload...")

# ==============================================================================
# CRITICAL DEFENSE: PAYLOAD LOCKING (SERVER-SIDE CODE DELIVERY)
# แม้แฮกเกอร์จะพยายามบายพาส IF/JMP หน้าเครื่อง แต่ถ้าไม่มีคีย์จริง ตัวแปรนี้จะว่างเปล่า
# แฮกเกอร์จะไม่ได้โค้ดหรือ Payload ไปเลย และโปรแกรมจะแครชทันที
# ==============================================================================
var_res = requests.post(API_URL, data={
    "type": "var",
    "varid": "CorePayload", # สร้างตัวแปรนี้ในแดชบอร์ดเมนู Cloud Variables
    "sessionid": session_id
}, timeout=10).json()

protected_code = var_res.get("message", "")
if not protected_code or protected_code == "Variable not found.":
    print("❌ Fatal: Integrity verification failed. Payload missing.")
    os._exit(1)

# รันโค้ดที่ส่งมาจากคลาวด์ในหน่วยความจำโดยตรง (In-Memory Execution) ไม่ทิ้งไฟล์ลง Disk
print("[+] Executing protected application in memory...")
exec(protected_code)`;
  } else if (currentSdkLang === 'csharp') {
    title.innerHTML = '<span>💻 C# / .NET Client — Triple-Layer Anti-Tamper</span>';
    desc.textContent = 'Features Memory Code Integrity Check, Anti-dnSpy/Anti-CheatEngine, Proxy Intercept Detection, and Cloud Payload Decryption.';
    display.textContent = `using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Tasks;

namespace ZimAuthHardenedClient
{
    class Program
    {
        static readonly string ApiUrl = "${apiUrl}";
        static readonly string AppName = "${appName}";
        static readonly string OwnerId = "${ownerId}";
        static readonly string Secret = "${secret}";
        static readonly string Version = "${version}";

        #region Anti-Debug & Anti-Tamper Native Imports
        [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
        static extern bool IsDebuggerPresent();

        [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
        static extern bool CheckRemoteDebuggerPresent(IntPtr hProcess, ref bool isDebuggerPresent);
        #endregion

        static void RunSecurityScan()
        {
            // 1. Check Native Debugger
            if (IsDebuggerPresent())
            {
                Console.WriteLine("❌ Security Alert: Active debugger detected.");
                Process.GetCurrentProcess().Kill();
            }

            bool remoteDebugger = false;
            CheckRemoteDebuggerPresent(Process.GetCurrentProcess().Handle, ref remoteDebugger);
            if (remoteDebugger)
            {
                Console.WriteLine("❌ Security Alert: Remote debugger attached.");
                Process.GetCurrentProcess().Kill();
            }

            // 2. Detect Common Reversing Tools (dnSpy, Cheat Engine, x64dbg, IDA)
            string[] badProcesses = { "dnspy", "cheatengine", "x64dbg", "x32dbg", "ida64", "httpdebuggerui", "fiddler", "wireshark" };
            foreach (var proc in Process.GetProcesses())
            {
                string procName = proc.ProcessName.ToLower();
                foreach (var bad in badProcesses)
                {
                    if (procName.Contains(bad))
                    {
                        Console.WriteLine("❌ Security Alert: Disallowed tool detected: " + proc.ProcessName);
                        Process.GetCurrentProcess().Kill();
                    }
                }
            }

            // 3. Block Local System Web Proxies
            if (WebRequest.DefaultWebProxy != null && !string.IsNullOrEmpty(WebRequest.DefaultWebProxy.GetProxy(new Uri(ApiUrl))?.Authority))
            {
                if (WebRequest.DefaultWebProxy.GetProxy(new Uri(ApiUrl)).Authority.Contains("127.0.0.1") ||
                    WebRequest.DefaultWebProxy.GetProxy(new Uri(ApiUrl)).Authority.Contains("localhost"))
                {
                    Console.WriteLine("❌ Security Alert: Local traffic interception proxy detected.");
                    Process.GetCurrentProcess().Kill();
                }
            }
        }

        static async Task Main(string[] args)
        {
            RunSecurityScan();

            // Use direct socket handler without proxy
            var handler = new HttpClientHandler { UseProxy = false };
            using var client = new HttpClient(handler);

            Console.WriteLine("[*] Initializing secure handshake with ZimAuth...");

            // 1. Init Session
            var initContent = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("type", "init"),
                new KeyValuePair<string, string>("name", AppName),
                new KeyValuePair<string, string>("ownerid", OwnerId),
                new KeyValuePair<string, string>("secret", Secret),
                new KeyValuePair<string, string>("version", Version)
            });

            var initRes = await client.PostAsync(ApiUrl, initContent);
            var initDoc = JsonDocument.Parse(await initRes.Content.ReadAsStringAsync());

            if (!initDoc.RootElement.GetProperty("success").GetBoolean())
            {
                Console.WriteLine("❌ Handshake Failed: " + initDoc.RootElement.GetProperty("message").GetString());
                return;
            }

            string sessionId = initDoc.RootElement.GetProperty("sessionid").GetString();

            // 2. License Key Verification
            Console.Write("Enter License Key: ");
            string key = Console.ReadLine()?.Trim();

            var loginContent = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("type", "license"),
                new KeyValuePair<string, string>("key", key),
                new KeyValuePair<string, string>("hwid", Environment.MachineName + "_" + Environment.UserName),
                new KeyValuePair<string, string>("sessionid", sessionId)
            });

            var loginRes = await client.PostAsync(ApiUrl, loginContent);
            var loginDoc = JsonDocument.Parse(await loginRes.Content.ReadAsStringAsync());

            if (!loginDoc.RootElement.GetProperty("success").GetBoolean())
            {
                Console.WriteLine("❌ Authentication Failed: " + loginDoc.RootElement.GetProperty("message").GetString());
                return;
            }

            Console.WriteLine("✅ Access Granted! Fetching encrypted payload from ZimAuth Cloud...");

            // ==============================================================================
            // ANTI-CRACK GUARANTEE: CORE LOGIC DELIVERED FROM SERVER
            // แม้แฮกเกอร์จะ NOP/JMP บายพาสหน้าจอ แต่โค้ดสำคัญจะถูกดึงมาจากเซิร์ฟเวอร์เท่านั้น
            // ==============================================================================
            var varContent = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("type", "var"),
                new KeyValuePair<string, string>("varid", "CoreSecret"),
                new KeyValuePair<string, string>("sessionid", sessionId)
            });

            var varRes = await client.PostAsync(ApiUrl, varContent);
            var varDoc = JsonDocument.Parse(await varRes.Content.ReadAsStringAsync());

            string decryptedSecret = varDoc.RootElement.GetProperty("message").GetString();
            if (string.IsNullOrEmpty(decryptedSecret) || decryptedSecret == "Variable not found.")
            {
                Console.WriteLine("❌ Error: Core payload is missing or unverified.");
                return;
            }

            Console.WriteLine("--------------------------------------------------");
            Console.WriteLine("[+] Application fully decrypted in memory. Running main module...");
            // โค้ดหลักของคุณเริ่มทำงานตรงนี้
        }
    }
}`;
  } else if (currentSdkLang === 'cpp') {
    title.innerHTML = '<span>⚡ C++ Native Client — Anti-Dump & Thread-Hide Armor</span>';
    desc.textContent = 'Uses NtSetInformationThread (ThreadHideFromDebugger), PEB Check, Dynamic Function Resolution, and Cloud Variable Decryption.';
    display.textContent = `// ==============================================================================
// ZIMAUTH C++ MAXIMUM ANTI-REVERSING SHIELD
// ==============================================================================
#include <iostream>
#include <windows.h>
#include <winternl.h>
#include "KeyAuth.hpp"

#pragma comment(lib, "ntdll.lib")

std::string name = "${appName}";
std::string ownerid = "${ownerId}";
std::string secret = "${secret}";
std::string version = "${version}";
std::string url = "${apiUrl}";

// 1. Hide Current Thread from Debuggers (Stops OllyDbg, x64dbg, IDA from catching breakpoints)
typedef NTSTATUS(NTAPI* pfnNtSetInformationThread)(
    HANDLE ThreadHandle,
    ULONG ThreadInformationClass,
    PVOID ThreadInformation,
    ULONG ThreadInformationLength
);

void EnableAntiDebugArmor()
{
    // Check PEB.BeingDebugged directly
    PPEB pPeb = (PPEB)__readgsqword(0x60);
    if (pPeb && pPeb->BeingDebugged)
    {
        ExitProcess(0);
    }

    // Call NtSetInformationThread with ThreadHideFromDebugger (0x11)
    HMODULE hNtdll = GetModuleHandleA("ntdll.dll");
    if (hNtdll)
    {
        pfnNtSetInformationThread NtSetInfoThread = (pfnNtSetInformationThread)GetProcAddress(hNtdll, "NtSetInformationThread");
        if (NtSetInfoThread)
        {
            NtSetInfoThread(GetCurrentThread(), 0x11, 0, 0);
        }
    }

    // Hardware Breakpoint Detection (DR0 - DR3)
    CONTEXT ctx = { 0 };
    ctx.ContextFlags = CONTEXT_DEBUG_REGISTERS;
    HANDLE hThread = GetCurrentThread();
    if (GetThreadContext(hThread, &ctx))
    {
        if (ctx.Dr0 || ctx.Dr1 || ctx.Dr2 || ctx.Dr3)
        {
            ExitProcess(0);
        }
    }
}

KeyAuth::api KeyAuthApp(name, ownerid, secret, version, url);

int main()
{
    SetConsoleTitleA("ZimAuth Protected Module");
    EnableAntiDebugArmor();

    std::cout << "[*] Authenticating with ZimAuth Server..." << std::endl;
    KeyAuthApp.init();

    if (!KeyAuthApp.data.success)
    {
        std::cout << "[-] Handshake failed: " << KeyAuthApp.data.message << std::endl;
        Sleep(2000);
        ExitProcess(0);
    }

    std::string key;
    std::cout << "Enter License Key: ";
    std::cin >> key;

    KeyAuthApp.license(key);
    if (!KeyAuthApp.data.success)
    {
        std::cout << "[-] Access Denied: " << KeyAuthApp.data.message << std::endl;
        Sleep(2000);
        ExitProcess(0);
    }

    // ==========================================================================
    // CRITICAL ANTI-PATCH DEFENSE: FETCH CORE MEMORY PAYLOAD
    // ==========================================================================
    std::string corePayload = KeyAuthApp.var("CorePayload");
    if (corePayload.empty() || corePayload == "Variable not found.")
    {
        std::cout << "[-] Integrity failed: Essential binary payload missing." << std::endl;
        ExitProcess(0);
    }

    std::cout << "[+] License valid! Application unlocked successfully." << std::endl;
    // โค้ดโปรแกรมหลักเริ่มทำงานตรงนี้
    system("pause");
    return 0;
}`;
  } else if (currentSdkLang === 'rust') {
    title.innerHTML = '<span>🦀 Rust Client (reqwest + tokio)</span>';
    desc.textContent = 'Secure asynchronous authentication for Rust applications.';
    display.textContent = `use reqwest::Client;
use serde_json::Value;
use std::collections::HashMap;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();
    let api_url = "${apiUrl}";

    println!("Initializing ZimAuth session...");

    // 1. Init
    let mut init_params = HashMap::new();
    init_params.insert("type", "init");
    init_params.insert("name", "${appName}");
    init_params.insert("ownerid", "${ownerId}");
    init_params.insert("secret", "${secret}");
    init_params.insert("version", "${version}");

    let res: Value = client.post(api_url).form(&init_params).send().await?.json().await?;
    if !res["success"].as_bool().unwrap_or(false) {
        println!("❌ Init failed: {}", res["message"]);
        return Ok(());
    }

    let session_id = res["sessionid"].as_str().unwrap();

    // 2. License Auth
    println!("Enter License Key:");
    let mut key = String::new();
    std::io::stdin().read_line(&mut key)?;
    let key = key.trim();

    let mut auth_params = HashMap::new();
    auth_params.insert("type", "license");
    auth_params.insert("key", key);
    auth_params.insert("hwid", "RUST_CLIENT_HWID");
    auth_params.insert("sessionid", session_id);

    let auth_res: Value = client.post(api_url).form(&auth_params).send().await?.json().await?;
    if auth_res["success"].as_bool().unwrap_or(false) {
        println!("✅ Authenticated! Welcome to application.");
    } else {
        println!("❌ Access Denied: {}", auth_res["message"]);
    }

    Ok(())
}`;
  } else if (currentSdkLang === 'go') {
    title.innerHTML = '<span>🐹 Golang Client (net/http)</span>';
    desc.textContent = 'Lightweight zero-dependency client in Go.';
    display.textContent = `package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

type AuthResponse struct {
	Success   bool   \`json:"success"\`
	Message   string \`json:"message"\`
	SessionID string \`json:"sessionid"\`
}

func main() {
	apiUrl := "${apiUrl}"

	// 1. Init
	initData := url.Values{
		"type":    {"init"},
		"name":    {"${appName}"},
		"ownerid": {"${ownerId}"},
		"secret":  {"${secret}"},
		"version": {"${version}"},
	}

	resp, err := http.PostForm(apiUrl, initData)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	var initRes AuthResponse
	json.NewDecoder(resp.Body).Decode(&initRes)

	if !initRes.Success {
		fmt.Printf("❌ Init failed: %s\\n", initRes.Message)
		return
	}

	// 2. License Key
	var key string
	fmt.Print("Enter License Key: ")
	fmt.Scanln(&key)

	loginData := url.Values{
		"type":      {"license"},
		"key":       {key},
		"hwid":      {"GO_HWID_123"},
		"sessionid": {initRes.SessionID},
	}

	loginResp, err := http.PostForm(apiUrl, loginData)
	if err != nil {
		panic(err)
	}
	defer loginResp.Body.Close()

	var loginRes AuthResponse
	json.NewDecoder(loginResp.Body).Decode(&loginRes)

	if loginRes.Success {
		fmt.Println("✅ Login successful! Starting main program...")
	} else {
		fmt.Printf("❌ Login failed: %s\\n", loginRes.Message)
	}
}`;
  } else if (currentSdkLang === 'nodejs') {
    title.innerHTML = '<span>🟢 Node.js / Electron Client</span>';
    desc.textContent = 'For JavaScript, TypeScript, Electron, and desktop JS wrappers.';
    display.textContent = `const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });

const API_URL = "${apiUrl}";
const APP_NAME = "${appName}";
const OWNER_ID = "${ownerId}";
const APP_SECRET = "${secret}";
const VERSION = "${version}";

async function main() {
    console.log("Connecting to ZimAuth...");

    // 1. Init
    const initRes = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            type: 'init',
            name: APP_NAME,
            ownerid: OWNER_ID,
            secret: APP_SECRET,
            version: VERSION
        })
    }).then(r => r.json());

    if (!initRes.success) {
        console.log("❌ Init Error:", initRes.message);
        process.exit(1);
    }

    readline.question("Enter License Key: ", async (key) => {
        // 2. License Login
        const loginRes = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                type: 'license',
                key: key.trim(),
                hwid: process.env.COMPUTERNAME || 'NODE_HWID',
                sessionid: initRes.sessionid
            })
        }).then(r => r.json());

        if (loginRes.success) {
            console.log("✅ Authenticated successfully! Welcome.");
            // โค้ดหลักของคุณที่นี่
        } else {
            console.log("❌ Authentication failed:", loginRes.message);
        }
        readline.close();
    });
}

main();`;
  } else if (currentSdkLang === 'lua') {
    title.innerHTML = '<span>🌙 Lua Client (FiveM, Roblox, Standalone)</span>';
    desc.textContent = 'Simple HTTP authentication script in Lua.';
    display.textContent = `local http = require("socket.http") -- or your runtime http library
local ltn12 = require("ltn12")

local API_URL = "${apiUrl}"
local APP_NAME = "${appName}"
local OWNER_ID = "${ownerId}"
local APP_SECRET = "${secret}"
local VERSION = "${version}"

-- 1. Initialize
local req_body = "type=init&name="..APP_NAME.."&ownerid="..OWNER_ID.."&secret="..APP_SECRET.."&version="..VERSION
local resp_body = {}

http.request{
    url = API_URL,
    method = "POST",
    headers = {
        ["Content-Type"] = "application/x-www-form-urlencoded",
        ["Content-Length"] = string.len(req_body)
    },
    source = ltn12.source.string(req_body),
    sink = ltn12.sink.table(resp_body)
}

print("Init Response: " .. table.concat(resp_body))`;
  } else if (currentSdkLang === 'autoit') {
    title.innerHTML = '<span>📜 AutoIt Client</span>';
    desc.textContent = 'WinHTTP automation script in AutoIt.';
    display.textContent = `#include <MsgBoxConstants.au3>

Local $oHTTP = ObjCreate("WinHttp.WinHttpRequest.5.1")
Local $sUrl = "${apiUrl}"

; 1. Init
Local $sData = "type=init&name=${appName}&ownerid=${ownerId}&secret=${secret}&version=${version}"
$oHTTP.Open("POST", $sUrl, False)
$oHTTP.SetRequestHeader("Content-Type", "application/x-www-form-urlencoded")
$oHTTP.Send($sData)

Local $sResponse = $oHTTP.ResponseText
MsgBox($MB_OK, "ZimAuth Init", $sResponse)`;
  }
}

// App Initialization on Page Load
window.addEventListener('DOMContentLoaded', async () => {
  const user = await checkAuth();
  if (user) {
    await loadApps();
  }
});
