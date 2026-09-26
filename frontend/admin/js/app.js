(function () {
  'use strict';

  var contentEl, sidebarNavEl, topbarTitleEl;

  // ---------------------------------------------------------------------
  // Field rendering (generic form engine)
  // ---------------------------------------------------------------------

  function fieldWrapper(field) {
    var wrap = document.createElement('div');
    wrap.className = 'form-field';
    wrap.dataset.field = field.name;
    var label = document.createElement('label');
    label.textContent = field.label + (field.required ? ' *' : '');
    wrap.appendChild(label);
    return wrap;
  }

  function renderField(field, value) {
    var wrap = fieldWrapper(field);
    var getValue;

    if (field.type === 'textarea') {
      var ta = document.createElement('textarea');
      ta.value = value || '';
      if (field.placeholder) ta.placeholder = field.placeholder;
      wrap.appendChild(ta);
      getValue = function () { return ta.value; };
    } else if (field.type === 'boolean') {
      var cwrap = document.createElement('div');
      cwrap.className = 'checkbox-field';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!value;
      var span = document.createElement('span');
      span.textContent = field.label;
      cwrap.appendChild(cb);
      cwrap.appendChild(span);
      wrap.innerHTML = '';
      wrap.appendChild(cwrap);
      getValue = function () { return cb.checked; };
    } else if (field.type === 'number') {
      var num = document.createElement('input');
      num.type = 'number';
      if (field.min !== undefined) num.min = field.min;
      if (field.max !== undefined) num.max = field.max;
      num.value = value === undefined || value === null ? '' : value;
      wrap.appendChild(num);
      getValue = function () { return num.value === '' ? 0 : Number(num.value); };
    } else if (field.type === 'richtext') {
      var rteHost = document.createElement('div');
      wrap.appendChild(rteHost);
      var rte = RTE.create(rteHost, value || '');
      getValue = function () { return rte.getHtml(); };
    } else if (field.type === 'image') {
      var previewWrap = document.createElement('div');
      previewWrap.className = 'image-field-preview';
      var currentUrl = value || '';
      function renderPreview() {
        previewWrap.innerHTML = currentUrl
          ? '<img src="' + UI.escapeHtml(currentUrl) + '">'
          : '<div class="no-image"><i class="fas fa-image"></i></div>';
        var btnWrap = document.createElement('div');
        var pickBtn = document.createElement('button');
        pickBtn.type = 'button';
        pickBtn.className = 'btn btn-sm';
        pickBtn.innerHTML = '<i class="fas fa-upload"></i> Choose / Upload';
        pickBtn.addEventListener('click', function () {
          Media.openPicker(function (url) { currentUrl = url; renderPreview(); });
        });
        btnWrap.appendChild(pickBtn);
        if (currentUrl) {
          var clearBtn = document.createElement('button');
          clearBtn.type = 'button';
          clearBtn.className = 'btn btn-sm';
          clearBtn.style.marginLeft = '6px';
          clearBtn.textContent = 'Remove';
          clearBtn.addEventListener('click', function () { currentUrl = ''; renderPreview(); });
          btnWrap.appendChild(clearBtn);
        }
        previewWrap.appendChild(btnWrap);
      }
      renderPreview();
      wrap.appendChild(previewWrap);
      getValue = function () { return currentUrl; };
    } else if (field.type === 'json-tags') {
      var chips = Array.isArray(value) ? value.slice() : [];
      var tagWrap = document.createElement('div');
      tagWrap.className = 'tag-input-wrap';
      var tagInput = document.createElement('input');
      tagInput.type = 'text';
      tagInput.placeholder = 'Type and press Enter';
      function renderChips() {
        tagWrap.querySelectorAll('.tag-chip').forEach(function (c) { c.remove(); });
        chips.forEach(function (chip, i) {
          var el = document.createElement('span');
          el.className = 'tag-chip';
          el.innerHTML = '<span></span><button type="button">&times;</button>';
          el.querySelector('span').textContent = chip;
          el.querySelector('button').addEventListener('click', function () {
            chips.splice(i, 1);
            renderChips();
          });
          tagWrap.insertBefore(el, tagInput);
        });
      }
      tagInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          var v = tagInput.value.trim();
          if (v) { chips.push(v); tagInput.value = ''; renderChips(); }
        } else if (e.key === 'Backspace' && !tagInput.value && chips.length) {
          chips.pop();
          renderChips();
        }
      });
      tagWrap.appendChild(tagInput);
      renderChips();
      wrap.appendChild(tagWrap);
      var hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = 'Press Enter or comma to add.';
      wrap.appendChild(hint);
      getValue = function () { return chips; };
    } else if (field.type === 'json-list') {
      var listTa = document.createElement('textarea');
      listTa.style.minHeight = '120px';
      listTa.value = Array.isArray(value) ? value.join('\n\n') : '';
      wrap.appendChild(listTa);
      var hint2 = document.createElement('div');
      hint2.className = 'hint';
      hint2.textContent = 'One paragraph per blank-line-separated block. Basic HTML like <strong> is allowed.';
      wrap.appendChild(hint2);
      getValue = function () {
        return listTa.value.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      };
    } else if (field.type === 'json-tags-obj') {
      // Array of {icon, label} — used for About "highlight tags".
      var objs = Array.isArray(value) ? value.slice() : [];
      var objWrap = document.createElement('div');
      function renderObjRows() {
        objWrap.innerHTML = '';
        objs.forEach(function (o, i) {
          var row = document.createElement('div');
          row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
          row.innerHTML =
            '<input type="text" placeholder="fas fa-star" style="width:140px;" value="' + UI.escapeHtml(o.icon || '') + '">' +
            '<input type="text" placeholder="Label" style="flex:1;" value="' + UI.escapeHtml(o.label || '') + '">' +
            '<button type="button" class="btn btn-sm btn-danger"><i class="fas fa-trash"></i></button>';
          var inputs = row.querySelectorAll('input');
          inputs[0].addEventListener('input', function () { objs[i].icon = inputs[0].value; });
          inputs[1].addEventListener('input', function () { objs[i].label = inputs[1].value; });
          row.querySelector('button').addEventListener('click', function () { objs.splice(i, 1); renderObjRows(); });
          objWrap.appendChild(row);
        });
        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn btn-sm';
        addBtn.innerHTML = '<i class="fas fa-plus"></i> Add tag';
        addBtn.addEventListener('click', function () { objs.push({ icon: '', label: '' }); renderObjRows(); });
        objWrap.appendChild(addBtn);
      }
      renderObjRows();
      wrap.appendChild(objWrap);
      getValue = function () { return objs; };
    } else {
      // text, url, email
      var input = document.createElement('input');
      input.type = field.type === 'email' ? 'email' : (field.type === 'url' ? 'url' : 'text');
      input.value = value === undefined || value === null ? '' : value;
      if (field.placeholder) input.placeholder = field.placeholder;
      wrap.appendChild(input);
      getValue = function () { return input.value; };
    }

    wrap._getValue = getValue;
    return wrap;
  }

  function renderForm(fields, values, onSubmit, submitLabel) {
    var form = document.createElement('form');
    form.className = 'form-grid';
    var fieldEls = fields.map(function (f) { return renderField(f, values[f.name]); });
    fieldEls.forEach(function (el) { form.appendChild(el); });

    var errorBox = document.createElement('div');
    form.appendChild(errorBox);

    var actions = document.createElement('div');
    actions.className = 'form-actions';
    var submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'btn btn-primary';
    submitBtn.textContent = submitLabel || 'Save';
    actions.appendChild(submitBtn);
    form.appendChild(actions);

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      errorBox.innerHTML = '';
      fieldEls.forEach(function (el) { el.classList.remove('error'); });

      var payload = {};
      fieldEls.forEach(function (el) {
        payload[el.dataset.field] = el._getValue();
      });

      // Client-side required check for quick feedback (server re-validates too).
      var missing = fields.filter(function (f) {
        return f.required && (payload[f.name] === undefined || payload[f.name] === null || String(payload[f.name]).trim() === '');
      });
      if (missing.length) {
        missing.forEach(function (f) {
          var el = form.querySelector('[data-field="' + f.name + '"]');
          if (el) el.classList.add('error');
        });
        errorBox.innerHTML = '<div class="field-error">Please fill in: ' + missing.map(function (f) { return f.label; }).join(', ') + '</div>';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Saving...';
      try {
        await onSubmit(payload);
      } catch (err) {
        errorBox.innerHTML = '<div class="field-error">' + UI.escapeHtml(err.message) + '</div>';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel || 'Save';
      }
    });

    return form;
  }

  // ---------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------

  async function renderDashboard() {
    topbarTitleEl.textContent = 'Dashboard';
    contentEl.innerHTML = '<div class="loading-row"><span class="spinner"></span></div>';
    try {
      var stats = await AdminAPI.get('/api/admin/stats');
      var cards = Object.keys(stats.resources).map(function (key) {
        var s = stats.resources[key];
        return '<div class="stat-card">' +
          '<div class="num">' + s.total + '</div>' +
          '<div class="label">' + UI.escapeHtml(s.label) + '</div>' +
          '<div class="sub">' + s.published + ' published' + (s.draft ? ', <span class="draft">' + s.draft + ' hidden</span>' : '') + '</div>' +
          '</div>';
      }).join('');
      cards += '<div class="stat-card"><div class="num">' + stats.mediaCount + '</div><div class="label">Media Files</div></div>';

      contentEl.innerHTML =
        '<div class="stat-grid">' + cards + '</div>' +
        '<div class="panel"><div class="panel-header"><h2>Quick actions</h2></div><div class="panel-body" style="display:flex;gap:10px;flex-wrap:wrap;">' +
        '<a class="btn btn-primary" href="#/collection/projects/new"><i class="fas fa-plus"></i> Add Project</a>' +
        '<a class="btn btn-primary" href="#/collection/certificates/new"><i class="fas fa-plus"></i> Add Certificate</a>' +
        '<a class="btn" href="#/singleton/about"><i class="fas fa-user"></i> Edit About</a>' +
        '<a class="btn" href="#/singleton/seo"><i class="fas fa-magnifying-glass-chart"></i> Edit SEO</a>' +
        '<a class="btn" href="/api/admin/export" target="_blank"><i class="fas fa-download"></i> Export Backup</a>' +
        '</div></div>';
    } catch (err) {
      contentEl.innerHTML = '<div class="panel"><div class="panel-body">Failed to load dashboard: ' + UI.escapeHtml(err.message) + '</div></div>';
    }
  }

  async function renderCollectionList(key) {
    var def = window.CMS_COLLECTIONS[key];
    if (!def) { contentEl.innerHTML = '<div class="panel-body">Unknown resource.</div>'; return; }
    topbarTitleEl.textContent = def.label;
    contentEl.innerHTML = '<div class="loading-row"><span class="spinner"></span></div>';

    var items;
    try {
      items = await AdminAPI.get('/api/admin/' + key);
    } catch (err) {
      contentEl.innerHTML = '<div class="panel-body">Failed to load: ' + UI.escapeHtml(err.message) + '</div>';
      return;
    }

    var panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML =
      '<div class="panel-header"><h2>' + def.label + ' <span style="color:var(--text-muted);font-weight:400;">(' + items.length + ')</span></h2>' +
      '<a class="btn btn-primary" href="#/collection/' + key + '/new"><i class="fas fa-plus"></i> Add ' + def.label.replace(/s$/, '') + '</a></div>';

    var body = document.createElement('div');
    body.className = 'panel-body';

    if (!items.length) {
      body.innerHTML = '<div class="empty-state"><i class="' + (def.icon || 'fas fa-inbox') + '"></i>Nothing here yet. Click "Add ' + def.label.replace(/s$/, '') + '" to create your first one.</div>';
      panel.appendChild(body);
      contentEl.innerHTML = '';
      contentEl.appendChild(panel);
      return;
    }

    var table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML =
      '<thead><tr>' +
      (def.orderable ? '<th></th>' : '') +
      (def.imageField ? '<th></th>' : '') +
      '<th>' + def.fields[0].label + '</th><th>Status</th><th></th>' +
      '</tr></thead><tbody></tbody>';
    var tbody = table.querySelector('tbody');

    function row(item) {
      var tr = document.createElement('tr');
      tr.draggable = !!def.orderable;
      tr.dataset.id = item.id;
      var published = def.publishField ? item[def.publishField] : true;
      var titleVal = item[def.titleField] || '(untitled)';
      tr.innerHTML =
        (def.orderable ? '<td class="drag-handle"><i class="fas fa-grip-vertical"></i></td>' : '') +
        (def.imageField ? '<td>' + (item[def.imageField] ? '<img class="thumb" src="' + UI.escapeHtml(item[def.imageField]) + '">' : '<div class="thumb" style="background:#eee;"></div>') + '</td>' : '') +
        '<td><a href="#/collection/' + key + '/' + item.id + '">' + UI.escapeHtml(titleVal) + '</a>' +
        (def.featuredField && item[def.featuredField] ? '<span class="badge badge-featured">Featured</span>' : '') + '</td>' +
        '<td><span class="badge ' + (published ? 'badge-published' : 'badge-draft') + '">' + (published ? 'Published' : 'Hidden') + '</span></td>' +
        '<td class="row-actions">' +
        (def.publishField ? '<button class="btn btn-sm toggle-publish" title="Toggle visibility"><i class="fas fa-eye' + (published ? '-slash' : '') + '"></i></button>' : '') +
        '<a class="btn btn-sm" href="#/collection/' + key + '/' + item.id + '"><i class="fas fa-pen"></i></a>' +
        '<button class="btn btn-sm btn-danger delete-item"><i class="fas fa-trash"></i></button>' +
        '</td>';

      if (def.publishField) {
        tr.querySelector('.toggle-publish').addEventListener('click', async function () {
          try {
            await AdminAPI.patch('/api/admin/' + key + '/' + item.id, { [def.publishField]: !published });
            UI.toast(published ? 'Hidden.' : 'Published.', 'success');
            renderCollectionList(key);
          } catch (err) { UI.toast(err.message, 'error'); }
        });
      }
      tr.querySelector('.delete-item').addEventListener('click', async function () {
        var ok = await UI.confirmDialog({
          title: 'Delete "' + titleVal + '"?',
          message: 'This action cannot be undone.',
          danger: true, confirmLabel: 'Delete',
        });
        if (!ok) return;
        try {
          await AdminAPI.del('/api/admin/' + key + '/' + item.id);
          UI.toast('Deleted.', 'success');
          renderCollectionList(key);
        } catch (err) { UI.toast(err.message, 'error'); }
      });
      return tr;
    }

    items.forEach(function (item) { tbody.appendChild(row(item)); });

    if (def.orderable) {
      var dragEl = null;
      tbody.addEventListener('dragstart', function (e) {
        dragEl = e.target.closest('tr');
        dragEl.classList.add('dragging');
      });
      tbody.addEventListener('dragend', async function () {
        if (!dragEl) return;
        dragEl.classList.remove('dragging');
        dragEl = null;
        var orderedIds = Array.from(tbody.querySelectorAll('tr')).map(function (tr) { return tr.dataset.id; });
        try {
          await AdminAPI.post('/api/admin/reorder', { resource: key, orderedIds: orderedIds });
          UI.toast('Order saved.', 'success');
        } catch (err) { UI.toast(err.message, 'error'); }
      });
      tbody.addEventListener('dragover', function (e) {
        e.preventDefault();
        var target = e.target.closest('tr');
        if (!target || target === dragEl) return;
        var rect = target.getBoundingClientRect();
        var next = (e.clientY - rect.top) / rect.height > 0.5;
        tbody.insertBefore(dragEl, next ? target.nextSibling : target);
      });
    }

    body.appendChild(table);
    panel.appendChild(body);
    contentEl.innerHTML = '';
    contentEl.appendChild(panel);
  }

  async function renderCollectionForm(key, id) {
    var def = window.CMS_COLLECTIONS[key];
    if (!def) { contentEl.innerHTML = '<div class="panel-body">Unknown resource.</div>'; return; }
    var isNew = id === 'new';
    topbarTitleEl.textContent = (isNew ? 'New ' : 'Edit ') + def.label.replace(/s$/, '');
    contentEl.innerHTML = '<div class="loading-row"><span class="spinner"></span></div>';

    var values = {};
    if (!isNew) {
      try {
        values = await AdminAPI.get('/api/admin/' + key + '/' + id);
      } catch (err) {
        contentEl.innerHTML = '<div class="panel-body">Failed to load: ' + UI.escapeHtml(err.message) + '</div>';
        return;
      }
    }

    var extraFields = [];
    if (def.publishField) extraFields.push({ name: def.publishField, label: def.publishField === 'published' ? 'Published' : 'Visible', type: 'boolean' });
    if (def.featuredField) extraFields.push({ name: def.featuredField, label: 'Featured', type: 'boolean' });

    var panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = '<div class="panel-header"><h2>' + (isNew ? 'New ' : 'Edit ') + def.label.replace(/s$/, '') + '</h2>' +
      '<a class="btn" href="#/collection/' + key + '"><i class="fas fa-arrow-left"></i> Back to list</a></div>';
    var body = document.createElement('div');
    body.className = 'panel-body';

    var form = renderForm(def.fields.concat(extraFields), values, async function (payload) {
      if (isNew) {
        await AdminAPI.post('/api/admin/' + key, payload);
        UI.toast(def.label.replace(/s$/, '') + ' created.', 'success');
      } else {
        await AdminAPI.put('/api/admin/' + key + '/' + id, payload);
        UI.toast('Saved.', 'success');
      }
      location.hash = '#/collection/' + key;
    }, isNew ? 'Create' : 'Save Changes');

    body.appendChild(form);
    panel.appendChild(body);
    contentEl.innerHTML = '';
    contentEl.appendChild(panel);
  }

  async function renderSingletonForm(key) {
    var def = window.CMS_SINGLETONS[key];
    if (!def) { contentEl.innerHTML = '<div class="panel-body">Unknown settings page.</div>'; return; }
    topbarTitleEl.textContent = def.label;
    contentEl.innerHTML = '<div class="loading-row"><span class="spinner"></span></div>';

    var values;
    try {
      values = await AdminAPI.get('/api/admin/singleton/' + key);
    } catch (err) {
      contentEl.innerHTML = '<div class="panel-body">Failed to load: ' + UI.escapeHtml(err.message) + '</div>';
      return;
    }

    var panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = '<div class="panel-header"><h2>' + def.label + '</h2></div>';
    var body = document.createElement('div');
    body.className = 'panel-body';

    var form = renderForm(def.fields, values, async function (payload) {
      await AdminAPI.put('/api/admin/singleton/' + key, payload);
      UI.toast('Saved. Changes are live on the public site immediately.', 'success');
    }, 'Save Changes');

    body.appendChild(form);
    panel.appendChild(body);
    contentEl.innerHTML = '';
    contentEl.appendChild(panel);
  }

  function renderAccount() {
    topbarTitleEl.textContent = 'My Account';
    var panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = '<div class="panel-header"><h2>Change Password</h2></div>';
    var body = document.createElement('div');
    body.className = 'panel-body';
    var fields = [
      { name: 'currentPassword', label: 'Current Password', type: 'text' },
      { name: 'newPassword', label: 'New Password (min 8 characters)', type: 'text' },
    ];
    var form = renderForm(fields, {}, async function (payload) {
      await AdminAPI.post('/api/auth/change-password', payload);
      UI.toast('Password updated.', 'success');
    }, 'Update Password');
    form.querySelectorAll('input[type=text]').forEach(function (i) { i.type = 'password'; });
    body.appendChild(form);
    panel.appendChild(body);
    contentEl.innerHTML = '';
    contentEl.appendChild(panel);
  }

  // ---------------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------------

  function setActiveNav(hash) {
    document.querySelectorAll('.sidebar-nav a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === hash);
    });
  }

  function route() {
    var hash = location.hash || '#/dashboard';
    setActiveNav(hash);
    document.getElementById('sidebar').classList.remove('open');

    var parts = hash.replace('#/', '').split('/');
    if (parts[0] === 'dashboard' || !parts[0]) return renderDashboard();
    if (parts[0] === 'collection' && parts[1]) return renderCollectionForm2(parts[1], parts[2]);
    if (parts[0] === 'singleton' && parts[1]) return renderSingletonForm(parts[1]);
    if (parts[0] === 'media') { topbarTitleEl.textContent = 'Media Library'; contentEl.innerHTML = ''; return Media.renderPage(contentEl); }
    if (parts[0] === 'account') return renderAccount();
    return renderDashboard();
  }

  function renderCollectionForm2(key, id) {
    if (id) return renderCollectionForm(key, id);
    return renderCollectionList(key);
  }

  // ---------------------------------------------------------------------
  // Sidebar
  // ---------------------------------------------------------------------

  function buildSidebar() {
    var groups = [
      { label: 'Overview', items: [{ key: 'dashboard', label: 'Dashboard', icon: 'fas fa-gauge-high', href: '#/dashboard' }] },
      { label: 'Site Content', items: [
        { label: 'Profile', icon: 'fas fa-id-badge', href: '#/singleton/profile' },
        { label: 'Hero', icon: 'fas fa-house', href: '#/singleton/hero' },
        { label: 'About', icon: 'fas fa-user', href: '#/singleton/about' },
      ]},
      { label: 'Collections', items: Object.keys(window.CMS_COLLECTIONS).map(function (key) {
        var d = window.CMS_COLLECTIONS[key];
        return { label: d.label, icon: d.icon, href: '#/collection/' + key };
      })},
      { label: 'Settings', items: [
        { label: 'Contact Information', icon: 'fas fa-envelope', href: '#/singleton/contact' },
        { label: 'SEO', icon: 'fas fa-magnifying-glass-chart', href: '#/singleton/seo' },
        { label: 'Media', icon: 'fas fa-images', href: '#/media' },
        { label: 'Site Settings', icon: 'fas fa-sliders', href: '#/singleton/site-settings' },
        { label: 'My Account', icon: 'fas fa-lock', href: '#/account' },
      ]},
    ];

    sidebarNavEl.innerHTML = groups.map(function (g) {
      var items = g.items.map(function (item) {
        return '<a href="' + item.href + '"><i class="' + item.icon + '" aria-hidden="true"></i> ' + item.label + '</a>';
      }).join('');
      return '<div class="nav-group-label">' + g.label + '</div>' + items;
    }).join('');
  }

  // ---------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', async function () {
    contentEl = document.getElementById('content');
    sidebarNavEl = document.getElementById('sidebarNav');
    topbarTitleEl = document.getElementById('topbarTitle');

    try {
      var me = await AdminAPI.get('/api/auth/me');
      document.getElementById('adminEmail').textContent = me.email;
    } catch (err) {
      location.href = 'index.html';
      return;
    }

    buildSidebar();
    window.addEventListener('hashchange', route);
    route();

    document.getElementById('logoutBtn').addEventListener('click', async function () {
      await AdminAPI.post('/api/auth/logout');
      location.href = 'index.html';
    });

    var toggle = document.getElementById('mobileNavToggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        document.getElementById('sidebar').classList.toggle('open');
      });
    }
  });
})();
