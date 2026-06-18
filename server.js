/**
 * PathLab Pro - Download Server
 *
 * This server handles PDF downloads and saves them to the Downloads folder
 * Run: node server.js
 *
 * The frontend sends POST requests to /api/download with the PDF blob
 * The server saves the file to the user's Downloads folder
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true
}));

// Increase payload limit for PDF data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Get Downloads folder path
const getDownloadsFolder = () => {
  const home = os.homedir();
  return path.join(home, 'Downloads');
};

/**
 * POST /api/download
 * Receives PDF as base64 and saves to Downloads folder
 *
 * Body: {
 *   filename: "PathLab-Slip-R26-00009.pdf",
 *   pdfData: "base64-encoded-pdf-data"
 * }
 */
app.post('/api/download', async (req, res) => {
  try {
    const { filename, pdfData } = req.body;

    // Validation
    if (!filename || !pdfData) {
      console.error('[VALIDATION ERROR] Missing filename or pdfData');
      return res.status(400).json({
        success: false,
        error: 'Missing filename or pdfData'
      });
    }

    // Validate filename
    const sanitizedFilename = path.basename(filename);
    if (!sanitizedFilename.endsWith('.pdf')) {
      console.error('[VALIDATION ERROR] Invalid filename - must be a PDF:', filename);
      return res.status(400).json({
        success: false,
        error: 'Invalid filename - must be a PDF'
      });
    }

    const downloadsFolder = getDownloadsFolder();
    const filepath = path.join(downloadsFolder, sanitizedFilename);

    console.log(`[DOWNLOAD] Processing: ${sanitizedFilename}`);
    console.log(`[DESTINATION] ${filepath}`);
    console.log(`[DATA LENGTH] ${pdfData.length} characters`);

    // Extract base64 from data URL
    let base64String = pdfData;

    // Handle data URL format: data:application/pdf;base64,xxxxx
    if (pdfData.includes('data:')) {
      const matches = pdfData.match(/data:[^;]+;base64,(.+)/);
      if (!matches || !matches[1]) {
        console.error('[ERROR] Invalid data URL format');
        throw new Error('Invalid PDF data format - expected data URL');
      }
      base64String = matches[1];
    }

    // Convert base64 to buffer
    let buffer;
    try {
      buffer = Buffer.from(base64String, 'base64');
      console.log(`[BUFFER] Created ${buffer.length} bytes`);
    } catch (err) {
      console.error('[BUFFER ERROR]', err.message);
      throw new Error(`Invalid base64 data - ${err.message}`);
    }

    // Verify buffer is valid PDF
    if (buffer.length < 4 || !buffer.toString('utf8', 0, 4).includes('%PDF')) {
      console.warn('[WARNING] Buffer may not be a valid PDF');
    }

    // Write to file
    try {
      await fs.writeFile(filepath, buffer);
      console.log(`[SUCCESS] PDF saved successfully`);
      console.log(`[FILE SIZE] ${buffer.length} bytes`);
    } catch (writeErr) {
      console.error('[WRITE ERROR]', writeErr.message);
      throw new Error(`Failed to write file - ${writeErr.message}`);
    }

    res.json({
      success: true,
      message: `PDF saved to Downloads folder: ${sanitizedFilename}`,
      path: filepath,
      size: buffer.length
    });
  } catch (error) {
    console.error('[FATAL ERROR]', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/downloads-folder
 * Returns the path to the Downloads folder
 */
app.get('/api/downloads-folder', (req, res) => {
  const downloadsFolder = getDownloadsFolder();
  res.json({
    success: true,
    path: downloadsFolder
  });
});

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'PathLab Download Server is running',
    port: PORT,
    downloadsFolder: getDownloadsFolder()
  });
});

// Start server
app.listen(PORT, () => {
  const downloadsFolder = getDownloadsFolder();
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  PathLab Pro - Download Server        ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log(`✓ Server running on http://localhost:${PORT}`);
  console.log(`✓ Downloads folder: ${downloadsFolder}`);
  console.log(`✓ CORS enabled for localhost:5173`);
  console.log('\nReady to receive PDF downloads!\n');
});
