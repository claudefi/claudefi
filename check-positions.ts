import { getOpenPositions } from './src/data/provider.js';

async function checkPositions() {
  const all = await Promise.all([
    getOpenPositions('spot'),
    getOpenPositions('polymarket'),
    getOpenPositions('dlmm'),
    getOpenPositions('perps')
  ]);

  console.log('Open positions by domain:');
  console.log('- Spot:', all[0].length);
  console.log('- Polymarket:', all[1].length);
  console.log('- DLMM:', all[2].length);
  console.log('- Perps:', all[3].length);
  console.log('Total open positions:', all.flat().length);

  // Show details
  for (let i = 0; i < all.length; i++) {
    const domain = ['spot', 'polymarket', 'dlmm', 'perps'][i];
    if (all[i].length > 0) {
      console.log(`\n${domain.toUpperCase()} positions:`);
      for (const pos of all[i]) {
        console.log(`  - ${pos.target}: ${pos.size_tokens || 0} tokens, $${pos.cost_basis_usd} (${new Date(pos.opened_at).toLocaleString()})`);
      }
    }
  }
}

checkPositions().catch(console.error);
