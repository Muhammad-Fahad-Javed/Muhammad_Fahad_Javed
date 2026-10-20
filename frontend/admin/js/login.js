document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var btn = document.getElementById('loginBtn');
  var errorBox = document.getElementById('loginError');
  errorBox.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  try {
    await AdminAPI.post('/api/auth/login', {
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    });
    location.href = '/admin/dashboard.html';
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
});
