const express = require('express');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const Message = require('../models/Message');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { message: 'Too many messages sent. Please try again later.' }
});

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let transporter = null;
function getTransporter() {
    if (transporter) return transporter;
    if (!process.env.SMTP_HOST) return null;
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    return transporter;
}

// POST /api/contact — public, submits the contact form
router.post('/', contactLimiter, async (req, res) => {
    try {
        const { name, email, message } = req.body;

        if (!name || name.trim().length < 2) {
            return res.status(400).json({ message: 'Please enter your full name.' });
        }
        if (!email || !emailRegex.test(email)) {
            return res.status(400).json({ message: 'Please enter a valid email address.' });
        }
        if (!message || message.trim().length < 20) {
            return res.status(400).json({ message: 'Please write at least 20 characters.' });
        }

        const saved = await Message.create({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            message: message.trim(),
            ip: req.ip
        });

        const t = getTransporter();
        if (t && process.env.NOTIFY_EMAIL) {
            t.sendMail({
                from: `"Portfolio Contact Form" <${process.env.SMTP_USER}>`,
                to: process.env.NOTIFY_EMAIL,
                replyTo: email,
                subject: `New portfolio message from ${name}`,
                text: message
            }).catch(err => console.error('Email send failed:', err.message));
        }

        res.status(201).json({ message: 'Message sent successfully.', id: saved._id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Something went wrong. Please try again later.' });
    }
});

// GET /api/contact — admin only, list messages
router.get('/', requireAuth, async (req, res) => {
    const messages = await Message.find().sort({ createdAt: -1 });
    res.json(messages);
});

// PATCH /api/contact/:id/read — admin only, mark as read
router.patch('/:id/read', requireAuth, async (req, res) => {
    const msg = await Message.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
    if (!msg) return res.status(404).json({ message: 'Not found.' });
    res.json(msg);
});

// DELETE /api/contact/:id — admin only
router.delete('/:id', requireAuth, async (req, res) => {
    await Message.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted.' });
});

module.exports = router;
