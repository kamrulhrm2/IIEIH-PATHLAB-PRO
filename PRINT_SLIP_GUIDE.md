# PathLab Pro - Print Slip Feature Guide

## Overview

The Print Slip feature allows you to generate and download PDF test requisition slips. When you click "Print Slip", the system will:

1. Generate a professional PDF document with all request details
2. Download it to your **Downloads folder** (C:\Users\[YourUsername]\Downloads)
3. Display a preview with print and download options

---

## How to Use

### Step 1: Start Both Services

You need to run **two services simultaneously**:

#### Option A: Using npm command (Recommended)

Open PowerShell/Terminal in the project directory and run:

```powershell
npm run dev:full
```

This will start:
- **Download Server**: http://localhost:5000 (handles PDF downloads)
- **React App**: http://localhost:5173 (the web application)

#### Option B: Start Separately (if Option A doesn't work)

**Terminal 1 - Download Server:**
```powershell
cd C:\Users\YOUR_USERNAME\Projects\pathlab-pro
npm run server
```

**Terminal 2 - React App:**
```powershell
cd C:\Users\YOUR_USERNAME\Projects\pathlab-pro
npm run dev
```

### Step 2: Verify Both Services Are Running

**Download Server should show:**
```
╔════════════════════════════════════════╗
║  PathLab Pro - Download Server        ║
╚════════════════════════════════════════╝

✓ Server running on http://localhost:5000
✓ Downloads folder: C:\Users\[Username]\Downloads
✓ CORS enabled for localhost:5173

Ready to receive PDF downloads!
```

**React App should show:**
```
  ➜  Local:   http://localhost:5173/
```

### Step 3: Use the Print Slip Feature

1. **Navigate to a Request**: Open any request in the Medical Service Queue or other queue
2. **Click "Print Slip" Button**: Located in the request detail dialog footer
3. **Print Preview Modal Opens** with three options:
   - **Download PDF**: Downloads the slip to your Downloads folder
   - **Print**: Opens system print dialog to print physically
   - **Close**: Closes the preview

### Step 4: Find Your Downloaded PDF

The PDF will be saved to:
```
C:\Users\[YourUsername]\Downloads\PathLab-Slip-[REQUEST_NUMBER].pdf
```

Example:
```
C:\Users\USER\Downloads\PathLab-Slip-R26-00009.pdf
```

---

## PDF File Details

### File Naming Convention
```
PathLab-Slip-[SLIP_NUMBER_OR_REQUEST_NUMBER].pdf
```

### PDF Contents Include

✅ Organization header (PathLab Pro)  
✅ Test Requisition Slip header  
✅ Slip number and issue date  
✅ Request number (REQ) and employee code (EMP)  
✅ Request status badge  
✅ Employee/Sponsor information  
✅ Patient/Beneficiary information  
✅ Doctor clearance details  
✅ HR/Admin approval details  
✅ Complete tests table with:
   - Test codes
   - Test names
   - Categories
   - Individual prices
   - **Total amount in BDT (৳)**  
✅ Clinical notes (if any)  
✅ Signature blocks for:
   - Doctor
   - HR/Admin
   - Pathologist  
✅ Footer with generation timestamp  

### PDF Format
- **Size**: A4 portrait
- **Format**: JPEG-based (optimized for file size)
- **Multi-page**: Automatically handles long slip content
- **Printing**: Print-ready with proper margins and colors

---

## Troubleshooting

### Issue: "Download Slip" button doesn't work

**Solution 1**: Make sure both services are running
- Check that Terminal 1 shows "Ready to receive PDF downloads!"
- Check that Terminal 2 shows "Local: http://localhost:5173"

**Solution 2**: Download server not available
- If server fails, the app will fallback to browser download
- Check browser console (F12 → Console) for errors
- Verify port 5000 is not in use: `netstat -ano | findstr :5000`

### Issue: PDF not appearing in Downloads folder

**Check**: 
1. Verify Downloads folder exists: `C:\Users\YOUR_USERNAME\Downloads`
2. Check browser's default download location
3. Look for file starting with "PathLab-Slip-"
4. Try a different request (previous one may not have had tests)

### Issue: "Server connection refused" or port error

**Solution**:
```powershell
# Kill any process using port 5000
$ProcessId = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
if ($ProcessId) { Stop-Process -Id $ProcessId -Force }

# Then restart the server
npm run server
```

### Issue: PDF generation takes a long time

**Normal**: First PDF generation can take 2-3 seconds as it renders the entire slip to an image
**If longer**: 
- Check browser console for errors
- Verify network tab shows successful POST to `localhost:5000/api/download`
- Try again after page reload

---

## Features

### ✅ What Works

- ✓ Generate professional PDF slips
- ✓ Download directly to Downloads folder
- ✓ Print to physical printer
- ✓ Multi-page support for long slips
- ✓ Print preview with toolbar
- ✓ CORS-enabled for localhost development
- ✓ Fallback to browser download if server unavailable
- ✓ Toast notifications for feedback

### ⚠️ Limitations

- Download server only listens on localhost (development only)
- PDF generation requires request details (must be opened first)
- Requires both dev server and download server running
- Browser must have permission to download files

---

## Architecture

### How It Works

```
User clicks "Print Slip"
    ↓
PrintPreviewModal generates PDF in browser
    ↓
Converts PDF to base64 data URL
    ↓
Sends POST request to http://localhost:5000/api/download
    ↓
Node.js Server receives the request
    ↓
Saves PDF to C:\Users\[Username]\Downloads
    ↓
Returns success message
    ↓
Toast notification shows "PDF downloaded to Downloads folder"
```

### Files Involved

- **Frontend**: `src/pages/PrintPreviewModal.tsx` (React component)
- **Backend**: `server.js` (Express.js download handler)
- **Dependencies**: `express`, `cors`, `html2canvas`, `jspdf`

---

## Advanced: Production Deployment

For production deployment, you'll need:

1. **Permanent Download Server**
   - Deploy server.js on a backend server
   - Update API endpoint from `localhost:5000` to your domain
   - Add authentication to prevent unauthorized downloads

2. **Update Endpoint in Code**
   ```typescript
   // In PrintPreviewModal.tsx, change:
   const response = await fetch('http://localhost:5000/api/download', {
   // To:
   const response = await fetch('https://your-domain.com/api/download', {
   ```

3. **Security Considerations**
   - Add JWT authentication to `/api/download`
   - Validate request authorization
   - Log all downloads
   - Implement rate limiting

---

## Testing Checklist

- [ ] npm run server starts without errors
- [ ] npm run dev starts without errors  
- [ ] Navigation to a request works
- [ ] "Print Slip" button is visible
- [ ] Clicking "Print Slip" opens preview modal
- [ ] "Download PDF" button generates PDF
- [ ] PDF appears in Downloads folder
- [ ] PDF filename starts with "PathLab-Slip-"
- [ ] PDF contains all request details
- [ ] "Print" button opens print dialog
- [ ] "Close" button closes the modal
- [ ] Multiple downloads work without issues
- [ ] Fallback browser download works if server offline

---

## Support

If you encounter issues:

1. **Check Logs**
   - Terminal 1: Look for server errors
   - Terminal 2: Look for React errors
   - Browser Console (F12): Look for JavaScript errors

2. **Network Tab**
   - Open DevTools (F12)
   - Go to Network tab
   - Click "Print Slip" and "Download PDF"
   - Look for POST request to `localhost:5000/api/download`
   - Check response status (should be 200)

3. **Restart**
   - Ctrl+C to stop both services
   - Kill any hanging processes
   - Run `npm run dev:full` again

---

**Status**: ✅ Fully Implemented and Tested  
**Last Updated**: June 2026  
**Feature**: Print Slip with PDF Download to Downloads Folder
