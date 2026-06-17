-- Migration: Fix users table role check constraint
-- ================================================
-- Issue: Database constraint "users_role_check" was missing 'medical' role
-- Error: "Failed to create user — new row for relation 'users' violates check constraint 'users_role_check'"
-- Root Cause: Medical Services role was added to the application but not to the database constraint
--
-- Valid User Roles:
-- 1. admin - Full access to all data and queues
-- 2. hr - HR queue, employees, reports
-- 3. doctor - Doctor queue, own requests
-- 4. pathologist - Pathology queue, test library, slips
-- 5. medical - Medical Services queue, approve/reject requests (NEW)
-- 6. user - Employee role, submit and track own requests

-- Fix: Drop old constraint and add updated one with medical role included
ALTER TABLE users DROP CONSTRAINT users_role_check;

ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
  role IN (
    'admin',
    'hr',
    'doctor',
    'pathologist',
    'medical',    -- NEW: Medical Services role
    'user'
  )
);

-- Verification query (run in Supabase SQL Editor to verify):
-- SELECT constraint_name FROM information_schema.table_constraints
-- WHERE table_name = 'users' AND constraint_type = 'CHECK';
