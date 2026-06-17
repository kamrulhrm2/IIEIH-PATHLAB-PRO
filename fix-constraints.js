#!/usr/bin/env node

/**
 * Supabase Constraint Fixes
 * Fixes the two missing CHECK constraints for Medical Services workflow
 *
 * Usage: node fix-constraints.js
 *
 * Environment variables needed:
 * - VITE_SUPABASE_URL: Supabase project URL
 * - VITE_SUPABASE_PUBLISHABLE_KEY: Supabase publishable key (or create a service role key)
 */

const https = require('https');

// Get environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Error: Missing environment variables');
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

console.log('🔧 Medical Services Workflow - Constraint Fixes\n');
console.log(`📍 Project: ${SUPABASE_URL}`);
console.log('---\n');

// Migration 1: Fix requests table status constraint
const migration1 = `ALTER TABLE requests DROP CONSTRAINT requests_status_check;

ALTER TABLE requests ADD CONSTRAINT requests_status_check CHECK (
  status IN (
    'PENDING_DOCTOR',
    'DOCTOR_REJECTED',
    'PENDING_HR',
    'PENDING_HR_PARTIAL',
    'HR_RESTRICTED',
    'PENDING_ADMIN',
    'ADMIN_REJECTED',
    'PENDING_MEDICAL',
    'MEDICAL_REJECTED',
    'PENDING_PATHOLOGY',
    'PATH_PARTIAL',
    'COMPLETED'
  )
);`;

// Migration 2: Fix request_timeline table stage constraint
const migration2 = `ALTER TABLE request_timeline DROP CONSTRAINT request_timeline_stage_check;

ALTER TABLE request_timeline ADD CONSTRAINT request_timeline_stage_check CHECK (
  stage IN (
    'CREATED',
    'DOCTOR_APPROVED',
    'DOCTOR_PARTIAL_APPROVED',
    'DOCTOR_REJECTED',
    'HR_APPROVED',
    'HR_RESTRICTED',
    'ADMIN_APPROVED',
    'ADMIN_REJECTED',
    'MEDICAL_APPROVED',
    'MEDICAL_REJECTED',
    'PATH_PARTIAL',
    'COMPLETED'
  )
);`;

async function executeSQL(query, migrationName) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL);

    const data = JSON.stringify({ query });

    const options = {
      hostname: url.hostname,
      port: 443,
      path: '/rest/v1/rpc/execute_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ ${migrationName}: SUCCESS`);
          resolve();
        } else {
          console.error(`❌ ${migrationName}: FAILED (HTTP ${res.statusCode})`);
          console.error(`   Response: ${body}`);
          reject(new Error(body));
        }
      });
    });

    req.on('error', (e) => {
      console.error(`❌ ${migrationName}: ERROR`);
      console.error(`   ${e.message}`);
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

async function runMigrations() {
  try {
    console.log('⏳ Migration 1: Fixing requests table status constraint...');
    await executeSQL(migration1, 'Migration 1');
    console.log('');

    console.log('⏳ Migration 2: Fixing request_timeline table stage constraint...');
    await executeSQL(migration2, 'Migration 2');
    console.log('');

    console.log('✨ All migrations completed successfully!');
    console.log('\n🎯 Next steps:');
    console.log('1. Refresh the PathLab Pro application (Ctrl+Shift+R)');
    console.log('2. Test the Medical Services approval workflow');
    console.log('3. HR should be able to approve and route to Medical Services');
    console.log('4. Medical Services should be able to approve and route to Pathology');

  } catch (error) {
    console.error('\n❌ Migration failed. Please check:');
    console.error('1. Environment variables are set correctly');
    console.error('2. Database user has permissions to modify constraints');
    console.error('3. Constraints exist before trying to drop them');
    process.exit(1);
  }
}

runMigrations();
