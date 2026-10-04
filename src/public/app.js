'use strict';
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const root = document.getElementById('app');
let me = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = root) => el.querySelector(sel);

// ---- Notifications: notify.success|warning|error|info(message) ----
const notify = {};
for (const type of ['success', 'warning', 'error', 'info']) {
  notify[type] = (message, ms = type === 'error' ? 8000 : 5000) => {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');
    const text = document.createElement('span');
    text.textContent = message;
    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    close.onclick = () => el.remove();
    el.append(text, close);
    document.getElementById('toasts').append(el);
    setTimeout(() => el.remove(), ms);
  };
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'X-Requested-With': 'fetch', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Wraps a submit handler: disables the button, reports errors as notifications.
function onSubmit(form, fn) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', form);
    btn && (btn.disabled = true);
    try { await fn(Object.fromEntries(new FormData(form))); }
    catch (err) {
      if (err.status === 401 && me) { me = null; notify.warning('Your session expired. Please sign in again.'); location.hash = '#/login'; }
      else notify.error(err.message);
    }
    finally { btn && (btn.disabled = false); }
  });
}

// ---- Theme ----
function toggleTheme() {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  localStorage.setItem('theme', t);
  document.querySelectorAll('[data-theme-btn]').forEach((b) => (b.textContent = t === 'dark' ? '☀️' : '🌙'));
}
const themeBtn = () => `<button class="icon-btn" type="button" data-theme-btn aria-label="Toggle light/dark theme">${document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙'}</button>`;

// ---- Layout ----
function shell(active, content) {
  const tab = (id, label) => `<a class="tab" href="#/${id}" ${active === id ? 'aria-current="page"' : ''}>${label}</a>`;
  root.innerHTML = `
    <header class="navbar">
      <span class="brand">FireFly III integrator</span>
      <nav class="tabs" aria-label="Main">${tab('pdfs', 'Post PDFs')}${tab('file', 'Post file')}</nav>
      <span class="spacer"></span>
      ${themeBtn()}
      <div class="menu">
        <button class="icon-btn" type="button" id="user-btn" aria-haspopup="true" aria-expanded="false">👤 Account ▾</button>
        <div class="menu-list" role="menu">
          <div class="menu-label">${esc(me.email)}</div><hr>
          <a href="#/settings" role="menuitem">Settings</a>
          <a href="#/profile" role="menuitem">Profile</a>
          ${me.isAdmin ? '<hr><a href="#/admin/users" role="menuitem">Manage users</a><a href="#/admin/settings" role="menuitem">System settings</a>' : ''}
          <hr><button type="button" id="logout" role="menuitem">Log out</button>
        </div>
      </div>
    </header>
    <main>${content}</main>`;
  const menu = $('.menu');
  $('#user-btn').onclick = (e) => { e.stopPropagation(); const o = menu.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o); };
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => menu.classList.remove('open')));
  $('#logout').onclick = async () => {
    try {
      await api('POST', '/api/auth/logout');
      me = null;
      location.hash = '#/login';
      notify.success('You have been logged out.');
    } catch (err) {
      notify.error(err.message);
    }
  };
  $('[data-theme-btn]').onclick = toggleTheme;
}
document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')); });

function authShell(title, form, footer) {
  root.innerHTML = `<div class="auth"><div class="row between"><h1>${title}</h1>${themeBtn()}</div><div class="card">${form}</div><p>${footer}</p></div>`;
  $('[data-theme-btn]').onclick = toggleTheme;
}

const emailInput = '<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required maxlength="254">';
function checkEmail(email) { if (!EMAIL_RE.test(String(email).trim()) || email.length > 254) throw new Error('Enter a valid email address.'); }

// ---- Pages ----
async function loginPage() {
  const cfg = await api('GET', '/api/public-config');
  authShell('Sign in',
    `<form id="f" novalidate>${emailInput}
      <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
      <div class="actions"><button class="btn" type="submit">Sign in</button></div></form>`,
    cfg.registrationOpen ? 'No account? <a href="#/register">Register</a>' : 'Registration is currently closed.');
  onSubmit($('#f'), async (d) => {
    checkEmail(d.email);
    await api('POST', '/api/auth/login', d);
    await boot('#/');
  });
}

async function registerPage() {
  const cfg = await api('GET', '/api/public-config');
  if (!cfg.registrationOpen) { notify.warning('Registration is currently disabled.'); location.hash = '#/login'; return; }
  authShell('Create account',
    `<form id="f" novalidate>${emailInput}
      <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="128">
      <p class="hint">At least 10 characters.</p>
      <label for="password2">Confirm password</label><input id="password2" name="password2" type="password" autocomplete="new-password" required>
      <div class="actions"><button class="btn" type="submit">Register</button></div></form>`,
    'Already registered? <a href="#/login">Sign in</a>');
  onSubmit($('#f'), async (d) => {
    checkEmail(d.email);
    if (d.password.length < 10) throw new Error('Password must be at least 10 characters.');
    if (d.password !== d.password2) throw new Error('Passwords do not match.');
    await api('POST', '/api/auth/register', { email: d.email, password: d.password });
    notify.success('Account created.');
    await boot('#/');
  });
}

function pdfsPage() {
  shell('pdfs', '<h1>Post PDFs</h1><div class="banner" role="status">Not implemented</div>');
}

function filePage() {
  shell('file', `<h1>Post file</h1>
    <form id="f">
      <div class="row between toolbar">
        <select name="format" aria-label="File format"><option value="json">json</option><option value="yaml">yaml</option></select>
        <button class="btn" type="submit">Post</button>
      </div>
      <textarea class="editor" name="content" aria-label="File content" spellcheck="false" placeholder="Paste or type your JSON or YAML here"></textarea>
    </form>`);
  const ta = $('textarea');
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); }
  });
  onSubmit($('#f'), async (d) => {
    if (!d.content.trim()) { notify.warning('Enter some content first.'); return; }
    const response = await api('POST', '/api/files/post', d);
    showTransactionResults(response.results);
  });
}

function settingsPage() {
  shell('', `<h1>Settings</h1>
    <form id="prefs" class="card"><h2>Preferences &amp; FireFly III</h2>
      <label for="defaultTab">Default tab on landing page</label>
      <select id="defaultTab" name="defaultTab"><option value="pdfs">Post PDFs</option><option value="file">Post file</option></select>
      <label for="fireflyUrl">FireFly III endpoint</label>
      <input id="fireflyUrl" name="fireflyUrl" type="url" placeholder="https://firefly.example.com" maxlength="500">
      <p class="hint">Use the base URL reachable from the app container (do not add /api/v1/transactions). For FireFly III running on the Docker host, use http://host.docker.internal:PORT; localhost refers to this app container.</p>
      <label for="fireflyApiKey">FireFly III API key</label>
      <input id="fireflyApiKey" name="fireflyApiKey" type="password" autocomplete="off" placeholder="${me.hasFireflyApiKey ? '•••••••• (saved, leave blank to keep)' : ''}">
      <p class="hint">The key is stored encrypted and is never shown again.</p>
      ${me.hasFireflyApiKey ? '<label class="switch"><input type="checkbox" name="clearApiKey" value="1"> Remove the saved API key</label>' : ''}
      <div class="actions"><button class="btn" type="submit">Save</button></div></form>
    <form id="pw" class="card"><h2>Change password</h2>
      <input type="text" name="username" value="${esc(me.email)}" autocomplete="username" hidden>
      <label for="cur">Current password</label><input id="cur" name="currentPassword" type="password" autocomplete="current-password" required>
      <label for="new">New password</label><input id="new" name="newPassword" type="password" autocomplete="new-password" required minlength="10" maxlength="128">
      <label for="new2">Confirm new password</label><input id="new2" name="confirm" type="password" autocomplete="new-password" required>
      <p class="hint">Changing your password signs you out of other devices.</p>
      <div class="actions"><button class="btn" type="submit">Change password</button></div></form>`);
  $('#defaultTab').value = me.defaultTab;
  $('#fireflyUrl').value = me.fireflyUrl || '';
  onSubmit($('#prefs'), async (d) => {
    me = { ...me, ...(await api('PUT', '/api/me/settings', { defaultTab: d.defaultTab, fireflyUrl: d.fireflyUrl, fireflyApiKey: d.fireflyApiKey, clearApiKey: d.clearApiKey === '1' })) };
    notify.success('Settings saved.');
    settingsPage();
  });
  onSubmit($('#pw'), async (d) => {
    if (d.newPassword.length < 10) throw new Error('Password must be at least 10 characters.');
    if (d.newPassword !== d.confirm) throw new Error('Passwords do not match.');
    await api('PUT', '/api/me/password', { currentPassword: d.currentPassword, newPassword: d.newPassword });
    $('#pw').reset();
    notify.success('Password changed.');
  });
}

function profilePage() {
  shell('', `<h1>Profile</h1>
    <form id="f" class="card">
      <label for="email">Email</label><input id="email" value="${esc(me.email)}" disabled>
      <div class="grid2"><div><label for="firstName">First name</label><input id="firstName" name="firstName" maxlength="100" autocomplete="given-name"></div>
      <div><label for="lastName">Last name</label><input id="lastName" name="lastName" maxlength="100" autocomplete="family-name"></div>
      <div><label for="birthDate">Date of birth</label><input id="birthDate" name="birthDate" type="date" autocomplete="bday"></div>
      <div><label for="gender">Gender</label><select id="gender" name="gender"><option value="">—</option><option value="female">Female</option><option value="male">Male</option><option value="non-binary">Non-binary</option><option value="other">Other</option><option value="prefer-not-to-say">Prefer not to say</option></select></div></div>
      <p class="hint">All fields are optional.</p>
      <div class="actions"><button class="btn" type="submit">Save profile</button></div></form>`);
  for (const k of ['firstName', 'lastName', 'birthDate', 'gender']) $('#' + k).value = me[k] || '';
  onSubmit($('#f'), async (d) => {
    me = { ...me, ...(await api('PUT', '/api/me/profile', d)) };
    notify.success('Profile saved.');
  });
}

function dialog(html) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = html;
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  return dlg;
}

function showTransactionResults(results) {
  const succeeded = results.filter((result) => result.status === 'succeeded').length;
  const failed = results.length - succeeded;
  const dlg = dialog(`<div class="result-heading"><div><h2 id="result-title">Transaction results</h2>
    <p>${succeeded} succeeded · ${failed} failed</p></div>
    <button class="icon-btn" type="button" id="close-results" aria-label="Close results">×</button></div>
    <ul class="result-list">${results.map((result) => `
      <li class="transaction-result ${result.status === 'succeeded' ? 'succeeded' : 'failed'}">
        <div class="row between"><strong>#${result.index} · ${esc(result.description)}</strong>
          <span class="result-status">${result.status === 'succeeded' ? 'Succeeded' : 'Failed'}</span></div>
        <p>${esc(result.sourceAccount)} → ${esc(result.destinationAccount)}</p>
        <p>${esc(result.amount)} ${esc(result.currency)}${result.foreignAmount === undefined ? '' : ` → ${esc(result.foreignAmount)} ${esc(result.foreignCurrency)}`} · ${esc(result.date)}</p>
        <p class="result-message">${esc(result.message)}</p>
      </li>`).join('')}</ul>`);
  dlg.classList.add('result-dialog');
  dlg.setAttribute('aria-labelledby', 'result-title');
  $('#close-results', dlg).onclick = () => dlg.close();
}

const confirmDialog = (msg) => new Promise((resolve) => {
  const dlg = dialog(`<form method="dialog"><p>${esc(msg)}</p><div class="actions"><button class="btn danger" value="ok">Confirm</button><button class="btn secondary" value="cancel">Cancel</button></div></form>`);
  dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'));
});

async function adminUsersPage() {
  if (!me.isAdmin) return forbidden();
  const users = await api('GET', '/api/admin/users');
  const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');
  shell('', `<div class="row between"><h1>Manage users</h1><button class="btn" id="add" type="button">Add user</button></div>
    <div class="card table-wrap"><table><thead><tr><th>Email</th><th>Role</th><th>Last login</th><th></th></tr></thead><tbody>
    ${users.map((u) => `<tr><td>${esc(u.email)}</td><td><span class="badge">${u.isAdmin ? 'Global admin' : 'User'}</span></td><td>${fmt(u.lastLoginAt)}</td>
      <td class="row" data-id="${u.id}"><button class="btn small secondary" data-act="role" data-admin="${!u.isAdmin}">${u.isAdmin ? 'Remove admin' : 'Make admin'}</button>
      <button class="btn small secondary" data-act="pw">Reset password</button><button class="btn small danger" data-act="del">Delete</button></td></tr>`).join('')}
    </tbody></table></div>`);
  const guard = async (fn) => { try { await fn(); await adminUsersPage(); } catch (err) { notify.error(err.message); } };
  $('#add').onclick = () => {
    const dlg = dialog(`<form id="nu" method="dialog"><h2>Add user</h2>${emailInput}
      <label for="npw">Password</label><input id="npw" name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="128">
      <label class="switch"><input type="checkbox" name="isAdmin"> Global admin</label>
      <div class="actions"><button class="btn" type="submit">Create</button><button class="btn secondary" type="button" id="cancel">Cancel</button></div></form>`);
    $('#cancel', dlg).onclick = () => dlg.close();
    $('#nu', dlg).addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      guard(async () => {
        checkEmail(f.email.value);
        await api('POST', '/api/admin/users', { email: f.email.value, password: f.password.value, isAdmin: f.isAdmin.checked });
        dlg.close();
        notify.success('User created.');
      });
    });
  };
  root.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => {
    const id = btn.closest('[data-id]').dataset.id;
    const act = btn.dataset.act;
    if (act === 'role') guard(async () => { await api('PATCH', `/api/admin/users/${id}`, { isAdmin: btn.dataset.admin === 'true' }); notify.success('Role updated.'); });
    if (act === 'del') confirmDialog('Delete this user permanently?').then((ok) => ok && guard(async () => { await api('DELETE', `/api/admin/users/${id}`); notify.success('User deleted.'); }));
    if (act === 'pw') {
      const dlg = dialog(`<form id="rp" method="dialog"><h2>Reset password</h2><label for="rpw">New password</label><input id="rpw" type="password" autocomplete="new-password" required minlength="10" maxlength="128">
        <p class="hint">The user will be signed out everywhere.</p><div class="actions"><button class="btn" type="submit">Reset</button><button class="btn secondary" type="button" id="cancel">Cancel</button></div></form>`);
      $('#cancel', dlg).onclick = () => dlg.close();
      $('#rp', dlg).addEventListener('submit', (e) => { e.preventDefault(); guard(async () => { await api('POST', `/api/admin/users/${id}/password`, { password: $('#rpw', dlg).value }); dlg.close(); notify.success('Password reset.'); }); });
    }
  }));
}

async function adminSettingsPage() {
  if (!me.isAdmin) return forbidden();
  const s = await api('GET', '/api/admin/settings');
  shell('', `<h1>System settings</h1><div class="card"><label class="switch"><input type="checkbox" id="reg" ${s.allowRegistration ? 'checked' : ''}> Allow new user registration</label>
    <p class="hint">Disabled by default. When off, only global admins can create users.</p></div>`);
  $('#reg').onchange = async (e) => {
    try { const r = await api('PUT', '/api/admin/settings', { allowRegistration: e.target.checked }); notify.success(`Registration ${r.allowRegistration ? 'enabled' : 'disabled'}.`); }
    catch (err) { e.target.checked = !e.target.checked; notify.error(err.message); }
  };
}

function forbidden() { notify.error('Global admin access required.'); location.hash = '#/'; }

// ---- Router ----
const routes = {
  '/pdfs': pdfsPage, '/file': filePage, '/settings': settingsPage, '/profile': profilePage,
  '/admin/users': adminUsersPage, '/admin/settings': adminSettingsPage,
};
const publicRoutes = { '/login': loginPage, '/register': registerPage };

async function route() {
  const path = location.hash.slice(1) || '/';
  try {
    if (!me) {
      if (publicRoutes[path]) return await publicRoutes[path]();
      location.hash = '#/login';
      return;
    }
    if (path === '/' || publicRoutes[path]) { location.replace('#/' + me.defaultTab); return; }
    await (routes[path] || (() => { location.replace('#/' + me.defaultTab); }))();
  } catch (err) {
    if (err.status === 401) { me = null; location.hash = '#/login'; } else notify.error(err.message);
  }
}

async function boot(hash) {
  try {
    me = await api('GET', '/api/me');
  } catch (err) {
    if (err.status === 401) me = null;
    else {
      me = null;
      notify.error(`Unable to load your account: ${err.message}`);
      return;
    }
  }
  if (hash) { if (location.hash === hash) await route(); else location.hash = hash; }
  else await route();
}

addEventListener('hashchange', route);
boot();
