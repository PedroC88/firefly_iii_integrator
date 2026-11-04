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
      <nav class="tabs" aria-label="Main">${tab('file', 'Post file')}${tab('pdfs', 'Post PDFs')}</nav>
      <span class="spacer"></span>
      ${themeBtn()}
      <div class="menu">
        <button class="icon-btn" type="button" id="user-btn" aria-haspopup="true" aria-expanded="false">👤 Account ▾</button>
        <div class="menu-list" role="menu">
          <div class="menu-label">${esc(me.email)}</div><hr>
          <a href="#/templates" role="menuitem">Templates</a>
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

async function filePage(params = new URLSearchParams()) {
  const M = window.TxModel;
  shell('file', `<h1>Post file</h1>
    <form id="f">
      <div class="row between toolbar">
        <div class="row">
          <div class="seg" role="group" aria-label="Editor mode">
            <button type="button" class="seg-btn" data-mode="ui" aria-pressed="false">Easy</button>
            <button type="button" class="seg-btn" data-mode="json" aria-pressed="true">Expert</button>
          </div>
          <select name="format" aria-label="File format"><option value="json">json</option><option value="yaml">yaml</option></select>
        </div>
        <div class="menu split-btn">
          <button class="btn" type="submit">Post</button>
          <button class="btn split-arrow" type="button" id="post-more" aria-haspopup="menu" aria-expanded="false" aria-label="More post options">&#9662;</button>
          <div class="menu-list" role="menu">
            <button type="button" role="menuitem" id="load-template">Load template</button>
            <button type="button" role="menuitem" id="update-template" hidden>Update template</button>
            <button type="button" role="menuitem" id="save-template">Save as template</button>
          </div>
        </div>
      </div>
      <textarea class="editor" name="content" aria-label="File content" spellcheck="false" placeholder="Paste or type your JSON or YAML here"></textarea>
      <div id="ui" class="tx-ui" hidden></div>
    </form>`);
  const postMenu = $('.split-btn');
  $('#post-more').onclick = (e) => { e.stopPropagation(); const o = postMenu.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o); };
  let template = null;
  const ta = $('textarea');
  const ui = $('#ui');
  const fmt = $('select[name=format]');
  let mode = 'json';
  let model = [];
  let syntaxError = null;
  let repaired = false;
  let pristine = false;
  let lookups = null;
  let lookupError = null;

  async function loadLookups() {
    try { lookups = await api('GET', '/api/files/lookups'); lookupError = null; }
    catch (err) { lookups = null; lookupError = err.message; }
    if (mode === 'ui') renderUi();
  }

  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); }
  });

  const syncJson = () => { ta.value = JSON.stringify(model, null, 2); syntaxError = null; repaired = false; };

  function loadModel() {
    const r = M.parseText(ta.value);
    pristine = !!r.empty;
    if (r.ok) { model = r.value; syntaxError = null; repaired = !!r.repaired; } else syntaxError = r.message;
  }

  const fieldHtml = (path, f, v) => {
    const wrong = v !== undefined && (f.kind === 'number' ? typeof v !== 'number' : typeof v !== 'string');
    const val = v === undefined ? '' : (wrong && typeof v !== 'number' ? JSON.stringify(v) : String(v));
    const id = `fld-${path.replace(/\./g, '-')}`;
    let input;
    if (f.kind === 'select') {
      const opts = [''].concat(f.options);
      if (val && !f.options.includes(val)) opts.push(val);
      input = `<select id="${id}" data-p="${path}">${opts.map((o) => `<option value="${esc(o)}"${o === val ? ' selected' : ''}>${esc(o || '— select —')}</option>`).join('')}</select>`;
    } else {
      const ph = f.kind === 'date' ? 'YYYY-MM-DD' : '';
      input = `<input id="${id}" data-p="${path}" data-kind="${f.kind}" type="text" ${f.kind === 'number' ? 'inputmode="decimal"' : ''} placeholder="${ph}" value="${esc(val)}" autocomplete="off">`;
    }
    return `<div class="uf"><label for="${id}">${f.label}${f.required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>${input}<p class="uf-err" data-err="${path}"></p></div>`;
  };

  // Dropdown fed by FireFly III; keeps a value that is not in the list so nothing is silently lost.
  function lookupField(path, label, v, options) {
    const val = typeof v === 'string' ? v : (v === undefined ? '' : JSON.stringify(v));
    const known = options.some((o) => o.value === val);
    const opts = [{ value: '', label: '— select —' }].concat(options);
    if (val && !known) opts.push({ value: val, label: `${val} (not found in FireFly III)` });
    const id = `fld-${path.replace(/\./g, '-')}`;
    return `<div class="uf"><label for="${id}">${label} <span class="req" aria-hidden="true">*</span></label><select id="${id}" data-p="${path}" data-orphan="${val && !known ? '1' : ''}">${opts.map((o) => `<option value="${esc(o.value)}"${o.value === val ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select><p class="uf-err" data-err="${path}"></p></div>`;
  }

  const sourceField = (path, v) => (lookups
    ? lookupField(path, 'Source account', v, lookups.accounts.map((a) => ({ value: a.name, label: a.currency ? `${a.name} (${a.currency})` : a.name })))
    : fieldHtml(path, { key: path, label: 'Source account', kind: 'text', required: true }, v));
  const currencyField = (path, v) => (lookups
    ? lookupField(path, 'Currency', v, lookups.currencies.map((c) => ({ value: c.code, label: c.name ? `${c.code} — ${c.name}` : c.code })))
    : fieldHtml(path, { key: path, label: 'Currency', kind: 'text', required: true }, v));

  function renderUi() {
    const groups = M.groupsOf(model);
    const knownG = ['source_account', 'currency', 'transactions'];
    const knownT = M.TX_FIELDS.map((f) => f.key);
    const extras = (obj, known, base) => M.isObj(obj) ? Object.keys(obj).filter((k) => !known.includes(k))
      .map((k) => `<div class="uf-extra" data-err-row="${base}.${esc(k)}"><code>${esc(k)}: ${esc(JSON.stringify(obj[k]))}</code><span class="uf-err" data-err="${base}.${esc(k)}"></span><button type="button" class="btn danger small" data-act="del" data-p="${base}.${esc(k)}">Remove</button></div>`).join('') : '';
    const body = groups.map((g, i) => {
      const o = M.isObj(g) ? g : {};
      const txs = Array.isArray(o.transactions) ? o.transactions : [];
      return `<section class="card tx-group" data-card="${i}">
        <div class="row between"><h2>Account ${i + 1}</h2><button type="button" class="btn danger small" data-act="del" data-p="${i}">Remove account</button></div>
        <p class="uf-err" data-err="${i}"></p>
        <div class="grid2">${sourceField(`${i}.source_account`, o.source_account)}${currencyField(`${i}.currency`, o.currency)}</div>
        ${extras(o, knownG, String(i))}
        <h3>Transactions</h3>
        <p class="uf-err" data-err="${i}.transactions"></p>
        ${txs.map((t, j) => {
          const p = `${i}.transactions.${j}`; const tt = M.isObj(t) ? t : {};
          return `<div class="tx-item" data-card="${p}">
            <div class="row between"><strong>Transaction ${j + 1}</strong><button type="button" class="btn danger small" data-act="del" data-p="${p}">Remove</button></div>
            <p class="uf-err" data-err="${p}"></p>
            <div class="grid2">${M.TX_FIELDS.map((f) => fieldHtml(`${p}.${f.key}`, f, tt[f.key])).join('')}</div>
            ${extras(tt, knownT, p)}
          </div>`;
        }).join('')}
        <button type="button" class="btn secondary small" data-act="add-tx" data-p="${i}">+ Add transaction</button>
      </section>`;
    }).join('');
    ui.innerHTML = `<div id="ui-status"></div><p class="uf-err" data-err=""></p>${body}<button type="button" class="btn secondary" data-act="add-group">+ Add account</button>`;
    refreshErrors();
  }

  function refreshErrors() {
    const errs = pristine ? {} : M.validate(model);
    ui.querySelectorAll('select[data-orphan="1"]').forEach((el) => { if (!errs[el.dataset.p]) errs[el.dataset.p] = 'Not found in FireFly III. Pick one from the list.'; });
    ui.querySelectorAll('[data-err]').forEach((el) => {
      const m = errs[el.dataset.err];
      el.textContent = m || '';
      el.hidden = !m;
      const input = el.previousElementSibling;
      if (input && input.matches('[data-p]')) { input.classList.toggle('invalid', !!m); input.setAttribute('aria-invalid', m ? 'true' : 'false'); }
    });
    ui.querySelectorAll('[data-card]').forEach((c) => c.classList.toggle('has-error', Object.keys(errs).some((k) => k === c.dataset.card || k.startsWith(`${c.dataset.card}.`))));
    const n = Object.keys(errs).length;
    const notes = [];
    if (syntaxError) notes.push(`<div class="banner err" role="alert">The JSON has a syntax error (${esc(syntaxError)}). Showing the last readable values; the first change here replaces the JSON with this form's content. Switch to JSON to fix it by hand.</div>`);
    else if (repaired) notes.push('<div class="banner" role="status">The JSON had comments or trailing commas; they will be removed on the next change.</div>');
    if (n) notes.push(`<div class="banner ${syntaxError ? '' : 'err'}" role="status">${n} issue${n === 1 ? '' : 's'} to fix. Highlighted fields need attention.</div>`);
    if (lookupError) notes.push(`<div class="banner" role="status">Could not load accounts and currencies from FireFly III (${esc(lookupError)}). Source account and currency are plain text boxes until this is fixed in Settings.</div>`);
    $('#ui-status').innerHTML = notes.join('');
    return errs;
  }

  function apply(path, value) {
    model = M.setPath(model, path, value);
    pristine = false;
    syncJson();
  }

  ui.addEventListener('input', (e) => {
    const el = e.target.closest('[data-p]');
    if (!el || el.dataset.act) return;
    const v = el.dataset.kind === 'number' ? M.coerceNumber(el.value) : (el.value === '' ? undefined : el.value);
    if (el.dataset.orphan) el.dataset.orphan = '';
    apply(el.dataset.p, v);
    refreshErrors();
  });
  ui.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const p = b.dataset.p;
    if (b.dataset.act === 'del') apply(p, undefined);
    else if (b.dataset.act === 'add-tx') { const list = M.groupsOf(model)[Number(p)]; if (!Array.isArray(list?.transactions)) apply(`${p}.transactions`, []); apply(`${p}.transactions.${M.groupsOf(model)[Number(p)].transactions.length}`, M.newTransaction()); }
    else if (b.dataset.act === 'add-group') apply(`${M.groupsOf(model).length}`, M.newGroup());
    renderUi();
  });

  let currentFmt = fmt.value;
  fmt.addEventListener('change', async () => {
    const to = fmt.value;
    const from = currentFmt;
    fmt.disabled = true;
    try {
      const r = await api('POST', '/api/files/convert', { from, to, content: ta.value });
      ta.value = r.content;
      currentFmt = to;
    } catch (err) {
      fmt.value = from;
      notify.error(err.message);
    } finally {
      fmt.disabled = mode === 'ui';
    }
  });

  async function setMode(next) {
    if (next === mode) return;
    if (next === 'ui' && currentFmt !== 'json') {
      try { ta.value = (await api('POST', '/api/files/convert', { from: currentFmt, to: 'json', content: ta.value })).content; }
      catch (err) { notify.error(err.message); return; }
      fmt.value = 'json'; currentFmt = 'json';
    }
    mode = next;
    document.querySelectorAll('.seg-btn').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mode === mode)));
    if (mode === 'ui') {
      loadModel();
      ta.hidden = true; ui.hidden = false; fmt.disabled = true; fmt.hidden = true;
      renderUi();
      loadLookups();
    } else {
      ta.hidden = false; ui.hidden = true; fmt.disabled = false; fmt.hidden = false;
    }
  }
  document.querySelectorAll('.seg-btn').forEach((x) => x.addEventListener('click', () => setMode(x.dataset.mode)));

  const templatePayload = (name) => ({ name, format: mode === 'ui' ? 'json' : fmt.value, content: ta.value });
  const requireContent = () => { if (ta.value.trim()) return true; notify.warning('Enter some content first.'); return false; };

  $('#save-template').onclick = () => {
    postMenu.classList.remove('open');
    if (!requireContent()) return;
    const dlg = dialog(`<form id="tn" method="dialog"><h2>Save as template</h2>
      <label for="tname">Template name</label><input id="tname" name="name" required maxlength="100" autocomplete="off" value="${esc(template?.name ?? '')}">
      <div class="actions"><button class="btn" type="submit">Save</button><button class="btn secondary" type="button" id="cancel">Cancel</button></div></form>`);
    $('#cancel', dlg).onclick = () => dlg.close();
    $('#tn', dlg).addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', dlg);
      btn.disabled = true;
      try {
        template = await api('POST', '/api/templates', templatePayload($('#tname', dlg).value));
        $('#update-template').hidden = false;
        dlg.close();
        notify.success('Template saved.');
      } catch (err) { notify.error(err.message); btn.disabled = false; }
    });
  };

  $('#update-template').onclick = async () => {
    postMenu.classList.remove('open');
    if (!template || !requireContent()) return;
    try {
      template = await api('PUT', `/api/templates/${template.id}`, templatePayload(template.name));
      notify.success(`Template "${template.name}" updated.`);
    } catch (err) { notify.error(err.message); }
  };

  async function applyTemplate(t) {
    let { content, format } = t;
    if (mode === 'ui' && format !== 'json') {
      content = (await api('POST', '/api/files/convert', { from: format, to: 'json', content })).content;
      format = 'json';
    }
    template = t;
    ta.value = content;
    fmt.value = format;
    currentFmt = format;
    $('#update-template').hidden = false;
    $('h1').textContent = `Post file — ${t.name}`;
    if (mode === 'ui') { loadModel(); renderUi(); }
  }

  $('#load-template').onclick = async () => {
    postMenu.classList.remove('open');
    let list;
    try { list = await api('GET', '/api/templates'); } catch (err) { notify.error(err.message); return; }
    if (!list.length) { notify.info('You have no templates yet.'); return; }
    const dlg = dialog(`<form id="lt" method="dialog"><h2>Load template</h2>
      <label for="tsel">Template</label>
      <select id="tsel">${list.map((t) => `<option value="${t.id}"${template?.id === t.id ? ' selected' : ''}>${esc(t.name)} (${esc(t.format)})</option>`).join('')}</select>
      <p class="hint">This replaces the current content.</p>
      <div class="actions"><button class="btn" type="submit">Load</button><button class="btn secondary" type="button" id="cancel">Cancel</button></div></form>`);
    $('#cancel', dlg).onclick = () => dlg.close();
    $('#lt', dlg).addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await applyTemplate(await api('GET', `/api/templates/${$('#tsel', dlg).value}`));
        dlg.close();
      } catch (err) { notify.error(err.message); }
    });
  };

  await setMode('ui');
  const templateId = params.get('template');
  if (templateId) {
    try { await applyTemplate(await api('GET', `/api/templates/${encodeURIComponent(templateId)}`)); }
    catch (err) { notify.error(err.message); }
  }

  onSubmit($('#f'), async (d) => {
    if (!d.content.trim()) { notify.warning('Enter some content first.'); return; }
    if (mode === 'ui' && (Object.keys(M.validate(model)).length || ui.querySelector('[data-orphan="1"]'))) { notify.warning('Fix the highlighted fields first.'); return; }
    const response = await api('POST', '/api/files/post', { content: d.content, format: mode === 'ui' ? 'json' : d.format });
    showTransactionResults(response.results);
  });
}

async function templatesPage() {
  const list = await api('GET', '/api/templates');
  shell('', `<h1>Templates</h1>
    ${list.length ? `<div class="card table-wrap"><table><thead><tr><th>Name</th><th>Format</th><th>Last updated</th><th></th></tr></thead><tbody>
    ${list.map((t) => `<tr data-id="${t.id}"><td>${esc(t.name)}</td><td><span class="badge">${esc(t.format)}</span></td><td>${new Date(t.updatedAt).toLocaleString()}</td>
      <td class="row"><a class="btn small secondary" href="#/file?template=${t.id}">Edit</a>
      <button class="btn small secondary" type="button" data-act="rename">Rename</button>
      <button class="btn small danger" type="button" data-act="del">Delete</button></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="banner" role="status">No templates yet. Use "Save as template" from the Post file page.</div>'}`);
  root.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
    const row = btn.closest('[data-id]');
    const id = row.dataset.id;
    const t = list.find((x) => x.id === id);
    if (btn.dataset.act === 'del') {
      if (!(await confirmDialog(`Delete template "${t.name}"?`))) return;
      try { await api('DELETE', `/api/templates/${id}`); notify.success('Template deleted.'); await templatesPage(); } catch (err) { notify.error(err.message); }
    } else {
      const dlg = dialog(`<form id="rn" method="dialog"><h2>Rename template</h2><label for="rname">Template name</label>
        <input id="rname" required maxlength="100" autocomplete="off" value="${esc(t.name)}">
        <div class="actions"><button class="btn" type="submit">Save</button><button class="btn secondary" type="button" id="cancel">Cancel</button></div></form>`);
      $('#cancel', dlg).onclick = () => dlg.close();
      $('#rn', dlg).addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const full = await api('GET', `/api/templates/${id}`);
          await api('PUT', `/api/templates/${id}`, { name: $('#rname', dlg).value, format: full.format, content: full.content });
          dlg.close();
          notify.success('Template renamed.');
          await templatesPage();
        } catch (err) { notify.error(err.message); }
      });
    }
  }));
}

function settingsPage() {
  shell('', `<h1>Settings</h1>
    <form id="prefs" class="card"><h2>Preferences &amp; FireFly III</h2>
      <label for="defaultTab">Default tab on landing page</label>
      <select id="defaultTab" name="defaultTab"><option value="file">Post file</option><option value="pdfs">Post PDFs</option></select>
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
  '/pdfs': pdfsPage, '/file': filePage, '/templates': templatesPage, '/settings': settingsPage, '/profile': profilePage,
  '/admin/users': adminUsersPage, '/admin/settings': adminSettingsPage,
};
const publicRoutes = { '/login': loginPage, '/register': registerPage };

async function route() {
  const [path, query = ''] = (location.hash.slice(1) || '/').split('?');
  try {
    if (!me) {
      if (publicRoutes[path]) return await publicRoutes[path]();
      location.hash = '#/login';
      return;
    }
    if (path === '/' || publicRoutes[path]) { location.replace('#/' + me.defaultTab); return; }
    await (routes[path] || (() => { location.replace('#/' + me.defaultTab); }))(new URLSearchParams(query));
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
