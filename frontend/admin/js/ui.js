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

  // Builds the dialog with DOM APIs only: user-controlled titles/messages are
  // assigned via textContent, so they can never be parsed as HTML or inject
  // attributes.
  function confirmDialog(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';

      var box = document.createElement('div');
      box.className = 'modal-box';

      var heading = document.createElement('h3');
      heading.textContent = opts.title || 'Are you sure?';
      box.appendChild(heading);

      var message = document.createElement('p');
      message.textContent = opts.message || '';
      box.appendChild(message);

      var actions = document.createElement('div');
      actions.className = 'modal-actions';

      var cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn';
      cancelBtn.setAttribute('data-action', 'cancel');
      cancelBtn.textContent = 'Cancel';

      var confirmBtn = document.createElement('button');
      confirmBtn.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');
      confirmBtn.setAttribute('data-action', 'confirm');
      confirmBtn.textContent = opts.confirmLabel || 'Confirm';

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      box.appendChild(actions);
      backdrop.appendChild(box);
      document.body.appendChild(backdrop);

      function cleanup(result) {
        backdrop.remove();
        resolve(result);
      }
      cancelBtn.addEventListener('click', function () { cleanup(false); });
      confirmBtn.addEventListener('click', function () { cleanup(true); });
      backdrop.addEventListener('click', function (e) { if (e.target === backdrop) cleanup(false); });
    });
  }

  // Escapes both text and attribute positions (quotes included).
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return { toast: toast, confirmDialog: confirmDialog, escapeHtml: escapeHtml };
})();
