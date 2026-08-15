// Run once with: npm run seed
// Creates the first admin account from ADMIN_EMAIL / ADMIN_PASSWORD in .env
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./db');
const Admin = require('../models/Admin');

(async () => {
    await connectDB();

    const email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
        console.error('❌ Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before seeding.');
        process.exit(1);
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
        console.log('ℹ️  Admin already exists:', email);
    } else {
        await Admin.create({ email, password, name: 'Fahad Javed' });
        console.log('✅ Admin created:', email);
    }

    await mongoose.disconnect();
    process.exit(0);
})();
