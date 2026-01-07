/**
 * Database Setup Script
 *
 * Run with: npm run db:setup
 *
 * Creates all tables, indexes, and initial data for Claudefi
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setup() {
  console.log('🚀 Claudefi Database Setup\n');

  // Check environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables:');
    console.error('   - SUPABASE_URL');
    console.error('   - SUPABASE_SERVICE_ROLE_KEY');
    console.error('\nPlease set these in your .env file');
    process.exit(1);
  }

  console.log(`📡 Connecting to Supabase: ${supabaseUrl}`);

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  // Read schema file
  const schemaPath = path.join(__dirname, 'schema.sql');
  console.log(`📄 Reading schema from: ${schemaPath}`);

  let schema: string;
  try {
    schema = await fs.readFile(schemaPath, 'utf-8');
  } catch (error) {
    console.error('❌ Failed to read schema.sql:', error);
    process.exit(1);
  }

  // Split into individual statements
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`\n📦 Executing ${statements.length} statements...\n`);

  let success = 0;
  let failed = 0;

  for (const statement of statements) {
    // Skip empty or comment-only statements
    if (!statement || statement.startsWith('--')) {
      continue;
    }

    try {
      const { error } = await supabase.rpc('exec_sql', {
        sql: statement + ';',
      });

      if (error) {
        // Try direct query for simpler statements
        const { error: directError } = await supabase
          .from('_exec')
          .select(statement);

        if (directError && !directError.message.includes('already exists')) {
          throw new Error(directError.message);
        }
      }

      success++;

      // Show progress for key statements
      if (statement.includes('CREATE TABLE')) {
        const tableName = statement.match(/CREATE TABLE[^(]+(\w+)/i)?.[1];
        console.log(`  ✅ Created table: ${tableName}`);
      } else if (statement.includes('CREATE INDEX')) {
        const indexName = statement.match(/CREATE INDEX[^(]+(\w+)/i)?.[1];
        console.log(`  ✅ Created index: ${indexName}`);
      } else if (statement.includes('CREATE VIEW')) {
        const viewName = statement.match(/CREATE[^V]+VIEW\s+(\w+)/i)?.[1];
        console.log(`  ✅ Created view: ${viewName}`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Ignore "already exists" errors
      if (errorMsg.includes('already exists')) {
        console.log(`  ⏭️  Skipped (exists): ${statement.slice(0, 50)}...`);
        continue;
      }

      console.log(`  ❌ Failed: ${statement.slice(0, 50)}...`);
      console.log(`     Error: ${errorMsg}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Setup Summary:');
  console.log(`   ✅ Successful: ${success}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log('='.repeat(50));

  // Verify setup by checking tables
  console.log('\n🔍 Verifying tables...\n');

  const tables = [
    'agent_config',
    'dlmm_positions',
    'perps_positions',
    'polymarket_positions',
    'spot_positions',
    'agent_decisions',
    'performance_snapshots',
  ];

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(1);

    if (error) {
      console.log(`  ❌ ${table}: ${error.message}`);
    } else {
      console.log(`  ✅ ${table}: OK`);
    }
  }

  // Check initial config
  console.log('\n📋 Checking initial configuration...\n');

  const { data: config, error: configError } = await supabase
    .from('agent_config')
    .select('*')
    .single();

  if (configError) {
    console.log('  ❌ No agent config found. Creating...');

    const { error: insertError } = await supabase
      .from('agent_config')
      .insert({
        name: 'claudefi',
        dlmm_balance: 2500,
        perps_balance: 2500,
        polymarket_balance: 2500,
        spot_balance: 2500,
        paper_trading: true,
      });

    if (insertError) {
      console.log(`  ❌ Failed to create config: ${insertError.message}`);
    } else {
      console.log('  ✅ Created default agent config');
    }
  } else {
    console.log('  ✅ Agent config exists:');
    console.log(`     - Name: ${config.name}`);
    console.log(`     - Paper Trading: ${config.paper_trading}`);
    console.log(`     - DLMM Balance: $${config.dlmm_balance}`);
    console.log(`     - Perps Balance: $${config.perps_balance}`);
    console.log(`     - Polymarket Balance: $${config.polymarket_balance}`);
    console.log(`     - Spot Balance: $${config.spot_balance}`);
    console.log(`     - Total: $${config.dlmm_balance + config.perps_balance + config.polymarket_balance + config.spot_balance}`);
  }

  console.log('\n✨ Database setup complete!\n');
}

// Run if called directly
setup().catch(error => {
  console.error('❌ Setup failed:', error);
  process.exit(1);
});
