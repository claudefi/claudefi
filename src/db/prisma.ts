/**
 * Prisma Client Singleton
 *
 * Provides a single instance of PrismaClient for the entire application.
 * Handles connection lifecycle and prevents multiple connections in development.
 */

import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Create a singleton instance
const prisma = global.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
});

// In development, attach to global to prevent hot-reload issues
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export { prisma };

/**
 * Initialize the database connection
 * Call this at startup to ensure tables exist
 */
export async function initDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('[DB] Connected to database');

    // Ensure default agent config exists
    const config = await prisma.agentConfig.findFirst();
    if (!config) {
      await prisma.agentConfig.create({
        data: {
          name: 'claudefi',
          dlmmBalance: 2500,
          perpsBalance: 2500,
          polymarketBalance: 2500,
          spotBalance: 2500,
          paperTrading: process.env.PAPER_TRADING !== 'false',
          activeDomains: process.env.ACTIVE_DOMAINS || 'dlmm,perps,polymarket,spot',
        },
      });
      console.log('[DB] Created default agent configuration');
    }
  } catch (error) {
    console.error('[DB] Failed to connect:', error);
    throw error;
  }
}

/**
 * Gracefully disconnect from the database
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  console.log('[DB] Disconnected from database');
}

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await disconnectDatabase();
});
