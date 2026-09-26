// Reuses a single PrismaClient instance across warm serverless invocations
// (Vercel keeps the module cache alive between calls to the same lambda).
const { PrismaClient } = require('@prisma/client');

let prisma;

if (!global.__PORTFOLIO_PRISMA__) {
  global.__PORTFOLIO_PRISMA__ = new PrismaClient();
}
prisma = global.__PORTFOLIO_PRISMA__;

module.exports = prisma;
