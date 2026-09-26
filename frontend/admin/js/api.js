window.AdminAPI = (function () {
  async function request(method, path, body) {
    const opts = {
      method,
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'portfolio-admin' },
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);

    if (res.status === 401) {
      if (!location.pathname.endsWith('/admin/') && !location.pathname.endsWith('/admin/index.html')) {
        location.href = 'index.html';
      }
      throw new Error('Unauthorized');
    }

    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }

    if (!res.ok) {
      const message = (data && data.error) || `Request failed (${res.status})`;
      throw new Error(message);
    }
    return data;
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    del: (path) => request('DELETE', path),
  };
})();
