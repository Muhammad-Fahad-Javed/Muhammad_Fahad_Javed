window.UI = (function () {
  function toast(message, type) {
    var root = document.getElementById('toast-root');
    if (!root) return;
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'success');
    el.textContent = message;
    root.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity 0.3s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 300);
    }, 3200);
  }

  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML =
        '<div class="modal-box">' +
        '<h3>' + (opts.title || 'Are you sure?') + '</h3>' +
        '<p>' + (opts.message || '') + '</p>' +
        '<div class="modal-actions">' +
        '<button class="btn" data-action="cancel">Cancel</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-action="confirm">' + (opts.confirmLabel || 'Confirm') + '</button>' +
        '</div></div>';
      document.body.appendChild(backdrop);

      function cleanup(result) {
        backdrop.remove();
        resolve(result);
      }
      backdrop.querySelector('[data-action="cancel"]').addEventListener('click', function () { cleanup(false); });
      backdrop.querySelector('[data-action="confirm"]').addEventListener('click', function () { cleanup(true); });
      backdrop.addEventListener('click', function (e) { if (e.target === backdrop) cleanup(false); });
    });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  return { toast: toast, confirmDialog: confirmDialog, escapeHtml: escapeHtml };
})();
