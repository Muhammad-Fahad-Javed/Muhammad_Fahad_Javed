const express = require('express');
const router = express.Router();

const GITHUB_USERNAME = 'muhammad-fahad-javed';
let cache = { data: null, ts: 0 };
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// GET /api/github — public, server-cached GitHub profile + repos
// Keeps the client from hitting GitHub's public rate limit directly.
router.get('/', async (req, res) => {
    try {
        if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
            return res.json(cache.data);
        }

        const userRes = await fetch(`https://api.github.com/users/${GITHUB_USERNAME}`);
        if (!userRes.ok) throw new Error('GitHub user fetch failed');
        const user = await userRes.json();

        const reposRes = await fetch(
            `https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=updated&per_page=100`
        );
        const repos = reposRes.ok ? await reposRes.json() : [];
        const totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);

        const data = { user, repos, totalStars, totalRepos: repos.length };
        cache = { data, ts: Date.now() };
        res.json(data);
    } catch (err) {
        console.error(err);
        if (cache.data) return res.json(cache.data); // serve stale on error
        res.status(502).json({ message: 'Could not fetch GitHub data.' });
    }
});

module.exports = router;
