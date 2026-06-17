-- Migration: Add medical service approval columns to requests table
-- Description: Adds medical_name and medical_at columns to track medical service approval

ALTER TABLE requests
ADD COLUMN medical_name text,
ADD COLUMN medical_at timestamptz;

-- Add comment for clarity
COMMENT ON COLUMN requests.medical_name IS 'Name of the medical service approver';
COMMENT ON COLUMN requests.medical_at IS 'Timestamp when medical service approved the request';
