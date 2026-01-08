import { prisma } from './src/db/prisma.js';

async function showPositions() {
  const positions = await prisma.position.findMany({
    where: { status: 'open' }
  });

  console.log(`Found ${positions.length} open positions:\n`);

  for (const pos of positions) {
    console.log(`Domain: ${pos.domain}`);
    console.log(`  ID: ${pos.id}`);
    console.log(`  Target: ${pos.target}`);
    console.log(`  TargetName: ${pos.targetName}`);
    console.log(`  EntryValue: $${pos.entryValueUsd}`);
    console.log(`  CurrentValue: $${pos.currentValueUsd}`);
    console.log(`  Size: ${pos.size}`);
    console.log(`  EntryPrice: ${pos.entryPrice}`);
    console.log(`  CurrentPrice: ${pos.currentPrice}`);
    console.log(`  Side: ${pos.side}`);
    console.log(`  OpenedAt: ${pos.openedAt}`);
    console.log(`  Metadata: ${pos.metadata}`);
    console.log('---');
  }
}

showPositions()
  .catch(console.error)
  .finally(() => process.exit(0));
