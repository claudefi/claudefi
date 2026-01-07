/**
 * Setup ClaudeFi model in Supabase with 10k starting balance
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function setupClaudefiModel() {
  console.log('Setting up ClaudeFi model...\n');

  // Check if model already exists
  const { data: existing } = await supabase
    .from('models')
    .select('*')
    .eq('slug', 'claudefi')
    .single();

  if (existing) {
    console.log('ClaudeFi model already exists:', existing.id);
    console.log(`Current balances:`);
    console.log(`  DLMM: $${existing.dlmm_balance}`);
    console.log(`  Perps: $${existing.perps_balance}`);
    console.log(`  Polymarket: $${existing.polymarket_balance}`);
    console.log(`  Spot: $${existing.spot_balance}`);
    
    // Update to 10k if balances are different
    const targetBalance = 2500; // 2.5k per domain = 10k total
    if (existing.dlmm_balance !== targetBalance) {
      console.log('\nUpdating to 10k total (2.5k per domain)...');
      const { error: updateError } = await supabase
        .from('models')
        .update({
          initial_balance: 10000,
          current_balance: 10000,
          dlmm_balance: targetBalance,
          perps_balance: targetBalance,
          polymarket_balance: targetBalance,
          spot_balance: targetBalance,
        })
        .eq('id', existing.id);
      
      if (updateError) {
        console.error('Update error:', updateError);
      } else {
        console.log('✅ Updated to 10k balance');
      }
    }
    
    return existing.id;
  }

  // Create new model with 10k balance (2.5k per domain)
  const { data: model, error } = await supabase
    .from('models')
    .insert({
      name: 'ClaudeFi',
      slug: 'claudefi',
      color: '#9333EA', // Purple
      icon: '/logos/anthropic.png',
      is_active: true,
      initial_balance: 10000,
      current_balance: 10000,
      dlmm_balance: 2500,
      perps_balance: 2500,
      polymarket_balance: 2500,
      spot_balance: 2500,
      stocks_balance: 0, // Not using stocks
      total_token_value_usd: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating model:', error);
    process.exit(1);
  }

  console.log('✅ ClaudeFi model created!');
  console.log(`   ID: ${model.id}`);
  console.log(`   Total Balance: $10,000`);
  console.log(`   Per Domain: $2,500`);

  // Create initial performance snapshots
  const domains = ['dlmm', 'perps', 'polymarket', 'spot'];
  for (const domain of domains) {
    const { error: snapError } = await supabase
      .from('performance_snapshots')
      .insert({
        model_id: model.id,
        domain,
        total_value_usd: 2500,
        num_positions: 0,
        total_fees_earned: 0,
      });
    
    if (snapError) {
      console.error(`Snapshot error for ${domain}:`, snapError);
    } else {
      console.log(`   📸 ${domain} snapshot created`);
    }
  }

  return model.id;
}

setupClaudefiModel()
  .then(id => {
    console.log('\n✅ Setup complete! Model ID:', id);
    process.exit(0);
  })
  .catch(err => {
    console.error('Setup failed:', err);
    process.exit(1);
  });
