window.Media = (function () {
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = reader.result;
        var base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function uploadFile(file) {
    if (file.size > 4 * 1024 * 1024) {
      throw new Error('File is too large. Please use an image under 4MB.');
    }
    var dataBase64 = await fileToBase64(file);
    return AdminAPI.post('/api/admin/media', {
      filename: file.name,
      contentType: file.type,
      dataBase64: dataBase64,
    });
  }

  function openPicker(onSelect) {
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML =
      '<div class="modal-box" style="max-width:640px;">' +
      '<h3>Select or upload an image</h3>' +
      '<div class="upload-drop" id="pickerDrop"><i class="fas fa-cloud-arrow-up" style="font-size:1.5rem;"></i><br>Click or drag an image here to upload' +
      '<input type="file" id="pickerFileInput" accept="image/*,application/pdf" style="display:none;"></div>' +
      '<div class="media-grid" id="pickerGrid" style="max-height:320px;overflow:auto;"><div class="loading-row"><span class="spinner"></span></div></div>' +
      '<div class="modal-actions"><button class="btn" data-action="close">Close</button></div>' +
      '</div>';
    document.body.appendChild(backdrop);

    function close() { backdrop.remove(); }
    backdrop.querySelector('[data-action="close"]').addEventListener('click', close);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });

    var drop = backdrop.querySelector('#pickerDrop');
    var input = backdrop.querySelector('#pickerFileInput');
    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('dragover'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      drop.classList.remove('dragover');
      if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', function () {
      if (input.files[0]) handleUpload(input.files[0]);
    });

    async function handleUpload(file) {
      drop.innerHTML = '<span class="spinner"></span> Uploading...';
      try {
        var media = await uploadFile(file);
        UI.toast('Image uploaded.', 'success');
        onSelect(media.url);
        close();
      } catch (err) {
        UI.toast(err.message, 'error');
        drop.innerHTML = '<i class="fas fa-cloud-arrow-up" style="font-size:1.5rem;"></i><br>Click or drag an image here to upload';
      }
    }

    var grid = backdrop.querySelector('#pickerGrid');
    AdminAPI.get('/api/admin/media').then(function (items) {
      if (!items.length) {
        grid.innerHTML = '<div class="empty-state">No uploaded media yet.</div>';
        return;
      }
      grid.innerHTML = items.map(function (m) {
        var isImage = (m.type || '').startsWith('image/');
        return '<div class="media-item" data-url="' + UI.escapeHtml(m.url) + '" style="cursor:pointer;">' +
          (isImage ? '<img src="' + UI.escapeHtml(m.url) + '">' : '<div style="height:100px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-file-pdf" style="font-size:1.6rem;color:#999;"></i></div>') +
          '<div class="media-name">' + UI.escapeHtml(m.filename) + '</div></div>';
      }).join('');
      grid.querySelectorAll('.media-item').forEach(function (el) {
        el.addEventListener('click', function () {
          onSelect(el.getAttribute('data-url'));
          close();
        });
      });
    }).catch(function (err) {
      grid.innerHTML = '<div class="empty-state">Failed to load media: ' + UI.escapeHtml(err.message) + '</div>';
    });
  }

  async function renderPage(container) {
    container.innerHTML =
      '<div class="panel-header"><h2>Media Library</h2></div>' +
      '<div class="panel-body">' +
      '<div class="upload-drop" id="mediaDrop"><i class="fas fa-cloud-arrow-up" style="font-size:1.6rem;"></i><br>Click or drag images here to upload (max 4MB each)' +
      '<input type="file" id="mediaFileInput" accept="image/*,application/pdf" multiple style="display:none;"></div>' +
      '<div class="media-grid" id="mediaGrid"><div class="loading-row"><span class="spinner"></span></div></div>' +
      '</div>';

    var drop = container.querySelector('#mediaDrop');
    var input = container.querySelector('#mediaFileInput');
    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('dragover'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      drop.classList.remove('dragover');
      Array.from(e.dataTransfer.files).forEach(handleUpload);
    });
    input.addEventListener('change', function () {
      Array.from(input.files).forEach(handleUpload);
    });

    async function handleUpload(file) {
      try {
        await uploadFile(file);
        UI.toast('Uploaded ' + file.name, 'success');
        load();
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    }

    async function load() {
      var grid = container.querySelector('#mediaGrid');
      var items = await AdminAPI.get('/api/admin/media');
      if (!items.length) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-images"></i>No media uploaded yet.</div>';
        return;
      }
      grid.innerHTML = items.map(function (m) {
        var isImage = (m.type || '').startsWith('image/');
        return '<div class="media-item" data-id="' + m.id + '">' +
          (isImage ? '<img src="' + UI.escapeHtml(m.url) + '">' : '<div style="height:100px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-file-pdf" style="font-size:1.6rem;color:#999;"></i></div>') +
          '<button class="media-delete" title="Delete" data-id="' + m.id + '"><i class="fas fa-trash"></i></button>' +
          '<div class="media-name">' + UI.escapeHtml(m.filename) + '</div></div>';
      }).join('');
      grid.querySelectorAll('.media-delete').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var ok = await UI.confirmDialog({ title: 'Delete this file?', message: 'This cannot be undone.', danger: true, confirmLabel: 'Delete' });
          if (!ok) return;
          await AdminAPI.del('/api/admin/media/' + btn.getAttribute('data-id'));
          UI.toast('Deleted.', 'success');
          load();
        });
      });
    }
    load();
  }

  return { uploadFile: uploadFile, openPicker: openPicker, renderPage: renderPage };
})();
