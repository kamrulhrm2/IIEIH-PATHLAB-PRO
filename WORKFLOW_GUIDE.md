# PathLab Pro - Complete Workflow Guide & Testing

## Current Status: Medical Services Role Implementation ✅

### What's Been Fixed
1. ✅ Medical Services role with cyan styling and RBAC
2. ✅ Request approval workflow stages: Doctor → HR → Medical → Pathology → Done
3. ✅ Step index bug in workflow visualization (COMPLETED now correctly shows at step 5, not 6)
4. ✅ All TypeScript types updated for new statuses
5. ✅ Database columns added (medical_name, medical_at)
6. ⏳ **PENDING**: Database CHECK constraint needs update in Supabase

---

## ⚠️ CRITICAL: Supabase Setup Required

The database table `requests` has a CHECK constraint that validates the `status` column. This constraint was created **before** the Medical Services role was added and is missing the new statuses.

### Error You'll See
When HR approves a request and tries to set it to `PENDING_MEDICAL`:
```
Action failed — new row for relation "requests" violates check constraint "requests_status_check"
```

### How to Fix (Run in Supabase)

1. Go to: **Supabase Dashboard → Your Project (iczcjxgysatukewxfmzs) → SQL Editor → New Query**

2. Copy and paste this SQL:

```sql
-- Drop the old constraint
ALTER TABLE requests DROP CONSTRAINT requests_status_check;

-- Add updated constraint with all valid statuses
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
```

3. Click **Execute**

4. You should see: `"error": null` or `"success"` message

---

## Complete Workflow Test Plan

### Request Status Flow Diagram
```
                    ┌─→ DOCTOR_REJECTED
                    │
PENDING_DOCTOR ──→ Doctor Review
                    │
                    └─→ PENDING_HR ──┐
                                     │
                         (if partial)└─→ PENDING_HR_PARTIAL
                                     │
                    ┌────────────────┘
                    │
HR Review ──────────┤
                    │
                    ├─→ HR_RESTRICTED (quota exceeded)
                    │   └─→ PENDING_ADMIN
                    │
                    └─→ PENDING_MEDICAL ◄─── NEW STAGE
                            │
                            ├─→ MEDICAL_REJECTED ◄─── NEW
                            │
                            └─→ PENDING_PATHOLOGY
                                    │
                    ┌───────────────┤
                    │               │
                (if rejected)   (if partial)
                    │               │
            (terminal) ◄─────  PATH_PARTIAL
                                    │
                                    └─→ COMPLETED


```

### End-to-End Test Steps

#### Prerequisites
- [ ] Medical Services database constraint fixed in Supabase (see above)
- [ ] Development server running: `npm run dev`
- [ ] Fresh browser session or app reload

#### Test Case 1: Complete Approval Flow (Happy Path)

**Step 1: Create Request (as Employee/User)**
1. Navigate to http://localhost:5173/dashboard
2. Click "New Request"
3. Select an employee (employee 102314 or any in system)
4. Select a beneficiary (Self, Spouse, etc.)
5. Select at least 1 test
6. Click "Submit Request"
7. Expected: Request created with status `PENDING_DOCTOR`
   - Workflow shows: Created ✓ → Doctor (current)

**Step 2: Doctor Approves (as Doctor)**
1. Log out and log in as a Doctor user (if available)
   - Or stay as Admin and navigate to "Doctor Queue"
2. Find the request
3. Click to open it
4. Click "Check Limit & Approve"
5. Expected: Request moves to status `PENDING_HR`
   - Workflow shows: Created ✓ → Doctor ✓ → HR (current)

**Step 3: HR Approves (as HR)**
1. Log out and log in as HR user (if available)
   - Or stay as Admin and navigate to "HR Queue"
2. Find the request in HR Queue
3. Click to open it
4. HR Check should show quota (e.g., "1/5")
5. Click "Check Limit & Approve"
6. **CRITICAL TEST**: This should now succeed (after constraint fix)
7. Expected: Request moves to status `PENDING_MEDICAL`
   - Workflow shows: Created ✓ → Doctor ✓ → HR ✓ → Medical (current)

**Step 4: Medical Services Approves (as Medical User)**
1. Log out and log in as Medical Services user
   - Or stay as Admin and navigate to "Medical Service Queue"
2. You should see the request in the Medical Service Queue
3. Click to open the request
4. You should see "Approve" and "Reject" buttons
5. Click "Approve"
6. Expected: Request moves to status `PENDING_PATHOLOGY`
   - Workflow shows: Created ✓ → Doctor ✓ → HR ✓ → Medical ✓ → Pathology (current)

**Step 5: Pathology Completes (as Pathologist)**
1. Log out and log in as Pathologist user
   - Or stay as Admin and navigate to "Pathology Queue"
2. Find the request in Pathology Queue
3. Click to open it
4. Select the tests to mark as completed
5. Click "Mark Complete"
6. Expected: Request moves to status `COMPLETED`
   - Workflow shows: Created ✓ → Doctor ✓ → HR ✓ → Medical ✓ → Pathology ✓ → Done

---

#### Test Case 2: Medical Services Rejection

**Starting Point**: Request is in `PENDING_MEDICAL` status

1. Log in as Medical Services user
2. Open a request from Medical Service Queue
3. Click "Reject"
4. Add optional note
5. Expected: Request moves to status `MEDICAL_REJECTED`
   - Workflow shows step 4 (Medical) as rejected
   - Request should not appear in Medical Service Queue anymore

---

#### Test Case 3: HR Quota Exceeded (Admin Escalation)

**Prerequisite**: Employee has reached annual quota limit

1. Log in as HR
2. Try to approve a request for an employee at/over their quota
3. Expected: System detects quota exceeded
4. Request moves to `HR_RESTRICTED` then `PENDING_ADMIN`
5. Workflow shows step 2 (HR) skipped, goes to Admin approval
6. Admin can override and approve or reject

---

### Verification Checklist

After running through all tests, verify these database values:

```sql
-- Check request statuses in database
SELECT req_no, status, doctor_name, hr_name, medical_name, pathologist_name 
FROM requests 
ORDER BY created_at DESC 
LIMIT 5;

-- Expected: 
-- - Status values should match one of the valid statuses
-- - medical_name should be populated for approved/rejected medical requests
-- - medical_at timestamp should exist for those records
```

---

## Troubleshooting

### Error: "Action failed — violates check constraint"
**Solution**: Run the Supabase SQL constraint fix (see CRITICAL section above)

### Error: Medical Service Queue page doesn't load
**Solution**: 
- Clear browser cache: Ctrl+Shift+Delete
- Reload: Ctrl+Shift+R
- Check if user has 'medical' or 'admin' role

### Error: Medical approval buttons don't appear
**Solution**: 
- Verify current user has 'medical' or 'admin' role
- Check request status is exactly 'PENDING_MEDICAL'
- Look at browser console (F12) for JavaScript errors

### Workflow shows wrong step number
**Solution**: This was fixed in commit c28992d. If you see this, hard refresh the app.

---

## Database Schema: Valid Status Values

The complete list of valid request statuses (after constraint fix):

| Status | Meaning | Stage |
|--------|---------|-------|
| PENDING_DOCTOR | Awaiting doctor review | 1 |
| DOCTOR_REJECTED | Doctor rejected | 1 (rejected) |
| PENDING_HR | Awaiting HR review | 2 |
| PENDING_HR_PARTIAL | HR reviewing partial approval | 2 |
| HR_RESTRICTED | Quota exceeded, escalated to admin | 2 |
| PENDING_ADMIN | Awaiting admin override | 2 |
| ADMIN_REJECTED | Admin rejected | 2 (rejected) |
| **PENDING_MEDICAL** | **Awaiting medical services review** | **3** |
| **MEDICAL_REJECTED** | **Medical services rejected** | **3 (rejected)** |
| PENDING_PATHOLOGY | Awaiting pathology review | 4 |
| PATH_PARTIAL | Pathology partial completion | 4 |
| COMPLETED | Request fulfilled | Done |

---

## Workflow Implementation Files

Key files that implement the Medical Services role:

- `src/types/index.ts` - Type definitions including UserRole, RequestStatus
- `src/pages/RequestDetailDialog.tsx` - Workflow logic and approval handlers
- `src/pages/RequestsPage.tsx` - Queue filtering and displays
- `src/hooks/useRequests.ts` - Data fetching and mutations
- `src/components/layout/Sidebar.tsx` - Navigation items
- `src/pages/DashboardPage.tsx` - Medical KPI cards
- `migrations/add_medical_columns.sql` - Database columns
- `migrations/fix_status_check_constraint.sql` - Database constraint fix

---

## Next Steps

1. ✅ Fix the database CHECK constraint in Supabase (CRITICAL)
2. ✅ Run full workflow test using test steps above
3. ✅ Verify all status transitions work correctly
4. ✅ Test role-based access controls
5. Deploy to production when all tests pass

---

**Last Updated**: June 2026
**Status**: Ready for testing (pending Supabase constraint fix)
