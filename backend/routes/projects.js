const express = require('express');
const Project = require('../models/Project');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// GET /api/projects — public, list all projects (for the site to render)
router.get('/', async (req, res) => {
    const projects = await Project.find().sort({ order: 1, createdAt: -1 });
    res.json(projects);
});

// POST /api/projects — admin only, create a project
router.post('/', requireAuth, async (req, res) => {
    try {
        const project = await Project.create(req.body);
        res.status(201).json(project);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// PUT /api/projects/:id — admin only, update a project
router.put('/:id', requireAuth, async (req, res) => {
    const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!project) return res.status(404).json({ message: 'Not found.' });
    res.json(project);
});

// DELETE /api/projects/:id — admin only
router.delete('/:id', requireAuth, async (req, res) => {
    await Project.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted.' });
});

module.exports = router;
