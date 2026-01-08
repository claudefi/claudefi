import { prisma } from './src/db/prisma.js';

async function cleanupCorruptedPositions() {
  console.log('Checking for corrupted positions...');

  // Find positions with undefined/null values or invalid states
  const allPositions = await prisma.position.findMany({
    where: {
      status: 'open'
    }
  });

  console.log(`Found ${allPositions.length} open positions`);

  let cleanedCount = 0;
  for (const pos of allPositions) {
    // Check if position has invalid data
    if (!pos.entryValueUsd || pos.entryValueUsd === 0 ||
        !pos.currentValueUsd || pos.currentValueUsd === 0) {
      console.log(`Closing corrupted position: ${pos.domain} - ${pos.target}`);
      console.log(`  Entry: $${pos.entryValueUsd}, Current: $${pos.currentValueUsd}`);

      await prisma.position.update({
        where: { id: pos.id },
        data: {
          status: 'closed',
          closedAt: new Date(),
          realizedPnl: 0, // Can't calculate P&L with bad data
        }
      });
      cleanedCount++;
    }
  }

  console.log(`\nCleaned up ${cleanedCount} corrupted positions`);

  // Show remaining open positions
  const remaining = await prisma.position.count({
    where: { status: 'open' }
  });
  console.log(`Remaining open positions: ${remaining}`);
}

cleanupCorruptedPositions()
  .catch(console.error)
  .finally(() => process.exit(0));
