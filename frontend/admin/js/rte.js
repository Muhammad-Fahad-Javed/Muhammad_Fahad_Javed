window.RTE = (function () {
  function create(container, initialHtml) {
    var toolbar = document.createElement('div');
    toolbar.className = 'rte-toolbar';
    var buttons = [
      { cmd: 'bold', icon: 'fas fa-bold', title: 'Bold' },
      { cmd: 'italic', icon: 'fas fa-italic', title: 'Italic' },
      { cmd: 'insertUnorderedList', icon: 'fas fa-list-ul', title: 'Bullet list' },
      { cmd: 'insertOrderedList', icon: 'fas fa-list-ol', title: 'Numbered list' },
      { cmd: 'formatBlock', arg: 'H3', icon: 'fas fa-heading', title: 'Heading' },
      { cmd: 'formatBlock', arg: 'P', icon: 'fas fa-paragraph', title: 'Paragraph' },
      { cmd: 'createLink', icon: 'fas fa-link', title: 'Link', prompt: true },
      { cmd: 'removeFormat', icon: 'fas fa-eraser', title: 'Clear formatting' },
    ];
    buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.title = b.title;
      btn.innerHTML = '<i class="' + b.icon + '" aria-hidden="true"></i>';
      btn.addEventListener('click', function () {
        editable.focus();
        if (b.prompt) {
          var url = window.prompt('Link URL (https://...)');
          if (!url) return;
          document.execCommand(b.cmd, false, url);
        } else {
          document.execCommand(b.cmd, false, b.arg || null);
        }
      });
      toolbar.appendChild(btn);
    });

    var editable = document.createElement('div');
    editable.className = 'rte-editable';
    editable.contentEditable = 'true';
    editable.innerHTML = initialHtml || '';

    container.innerHTML = '';
    container.appendChild(toolbar);
    container.appendChild(editable);

    return {
      getHtml: function () { return editable.innerHTML; },
      setHtml: function (html) { editable.innerHTML = html || ''; },
    };
  }
  return { create: create };
})();
