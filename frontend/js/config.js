// ═══════════════════════════════════════════════════════════════
// API CONFIG — point this at your deployed backend
// ═══════════════════════════════════════════════════════════════
// Local development:   http://localhost:5000
// Production:          https://your-backend.onrender.com (or Railway/Vercel URL)
window.API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5000'
    : 'https://api.muhammadfahadjaved.vercel.app'; // <-- change to your real backend URL after deploying
// NOTE: after deploying, also update the CSP "connect-src" line in index.html
// (around line 100) to allow your real backend domain instead of the wildcard placeholders.
