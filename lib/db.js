// Reuses a single PrismaClient instance across warm serverless invocations
// (Vercel keeps the module cache alive between calls to the same lambda).
const { PrismaClient } = require('@prisma/client');
const { assertStartupConfig } = require('./config');

// Surface misconfiguration clearly at cold start, without printing any secret.
const problems = assertStartupConfig();
if (problems.length) {
  console.error(
    '[config] Startup configuration problems:\n - ' + problems.join('\n - ')
  );
}

let prisma;

if (!global.__PORTFOLIO_PRISMA__) {
  global.__PORTFOLIO_PRISMA__ = new PrismaClient();
}
prisma = global.__PORTFOLIO_PRISMA__;

module.exports = prisma;
