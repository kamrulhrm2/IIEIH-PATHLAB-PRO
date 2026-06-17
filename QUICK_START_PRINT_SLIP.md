# Print Slip Feature - Quick Start (2 Minutes)

## What's New ✨

When you click **"Print Slip"** on a request, the PDF will now **download directly to your Downloads folder**!

```
C:\Users\YOUR_USERNAME\Downloads\PathLab-Slip-R26-00009.pdf
```

---

## Step 1: Start the Services (30 seconds)

Open **PowerShell** in the project folder and run:

```powershell
npm run dev:full
```

**This will:**
- Start the download server (port 5000)
- Start the React app (port 5173)

**Wait for both to show they're ready** (about 5 seconds)

---

## Step 2: Use Print Slip (30 seconds)

1. Go to http://localhost:5173
2. Open any request
3. Click **"Print Slip"** button
4. Click **"Download PDF"**
5. ✅ PDF saved to Downloads folder!

---

## That's It! 🎉

Your PDF will be named: `PathLab-Slip-[REQUEST_NUMBER].pdf`

### What You Can Do:
- **Download**: Save to Downloads folder
- **Print**: Print to physical printer
- **Share**: Email the PDF

---

## Verification

**Download Server running?**
```
✓ Server running on http://localhost:5000
✓ Downloads folder: C:\Users\...\Downloads
✓ Ready to receive PDF downloads!
```

**React App running?**
```
➜  Local:   http://localhost:5173/
```

---

## Troubleshooting (1 minute)

### "Download doesn't work"
→ Make sure both services started (check Terminal shows both messages)

### "PDF not in Downloads"
→ Check: `C:\Users\YOUR_USERNAME\Downloads`  
→ Look for files starting with "PathLab-Slip-"

### "Server error"
→ Stop everything (Ctrl+C)
→ Run: `npm run dev:full` again

---

## Files Changed

- ✅ `server.js` - Download server (NEW)
- ✅ `PrintPreviewModal.tsx` - Updated to use server
- ✅ `package.json` - Added scripts and dependencies
- ✅ `PRINT_SLIP_GUIDE.md` - Full documentation

---

## More Details?

See **PRINT_SLIP_GUIDE.md** for complete documentation.

---

**Status**: ✅ Ready to Use  
**Test It Now**: `npm run dev:full`
