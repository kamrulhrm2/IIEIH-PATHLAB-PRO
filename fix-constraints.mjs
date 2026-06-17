#!/usr/bin/env node

/**
 * Supabase Medical Services Constraints Fix
 *
 * This script fixes the two CHECK constraints required for the Medical Services workflow
 *
 * Usage: node fix-constraints.mjs
 *
 * Make sure these environment variables are set:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_PUBLISHABLE_KEY
 *
 * For production fix, you might need a service role key instead of publishable key
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Error: Missing environment variables');
  console.error('Required: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY');
  console.error('\nSet them in your .env file or as environment variables');
  process.exit(1);
}

console.log('🔧 PathLab Pro - Medical Services Workflow Constraint Fixes\n');
console.log(`📍 Supabase Project: ${SUPABASE_URL.split('/').pop()}`);
console.log('---\n');

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Migration 1: Fix requests table status constraint
const migration1 = `
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_status_check;

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
);
`;

// Migration 2: Fix request_timeline table stage constraint
const migration2 = `
ALTER TABLE request_timeline DROP CONSTRAINT IF EXISTS request_timeline_stage_check;

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
);
`;

async function runMigration(query, name) {
  try {
    console.log(`⏳ ${name}...`);

    // Execute SQL using Supabase client
    const { data, error } = await supabase.rpc('exec', { sql: query });

    if (error) {
      // If the RPC approach doesn't work, try direct query
      // Some setups might require a different approach
      console.error(`   Note: RPC method not available, trying alternative...`);
      throw error;
    }

    console.log(`✅ ${name}: SUCCESS\n`);
    return true;
  } catch (error) {
    console.error(`❌ ${name}: FAILED`);
    console.error(`   Error: ${error.message}\n`);
    return false;
  }
}

async function main() {
  try {
    console.log('Starting constraint migrations...\n');

    const migration1_ok = await runMigration(migration1, 'Migration 1: requests table');
    const migration2_ok = await runMigration(migration2, 'Migration 2: request_timeline table');

    if (migration1_ok && migration2_ok) {
      console.log('✨ All migrations completed successfully!\n');
      console.log('🎯 Next steps:');
      console.log('1. Refresh the PathLab Pro app (Ctrl+Shift+R)');
      console.log('2. Test HR approval → should route to Medical Services');
      console.log('3. Test Medical Services approval → should route to Pathology\n');
      process.exit(0);
    } else {
      console.log('⚠️  Some migrations may have failed.');
      console.log('Try running the SQL queries manually in Supabase SQL Editor:\n');
      console.log('Migration 1:');
      console.log(migration1);
      console.log('\nMigration 2:');
      console.log(migration2);
      process.exit(1);
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

main();
