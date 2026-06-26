import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';
import { Download, Loader2, Printer, X } from 'lucide-react';
import { calcAge, formatDate, formatDateTime } from '@/lib/utils';
import type { RequestSummary, RequestTest } from '@/types';

interface PrintPreviewModalProps {
  request: RequestSummary;
  tests: RequestTest[];
  onClose: () => void;
}

/** Render the slip card to a real downloadable PDF file (A4 portrait). */
async function generatePdf(_fileName: string) {
  const slip = document.getElementById('pathlab-print-slip');
  if (!slip) throw new Error('Slip element not found in DOM');

  console.log('[generatePdf] Slip element found, rendering to canvas...');

  const canvas = await html2canvas(slip, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    allowTaint: true,
    logging: false,
    imageTimeout: 5000,
    onclone: (doc) => {
      // Ensure cloned doc renders the slip fully visible
      const cloned = doc.getElementById('pathlab-print-slip');
      if (cloned) {
        (cloned as HTMLElement).style.boxShadow = 'none';
      }
    },
  });

  console.log('[generatePdf] Canvas generated:', canvas.width, 'x', canvas.height);
  // JPEG keeps the file small (a PNG of this slip is ~8 MB; JPEG is well under 1 MB).
  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const imgW = pageW - margin * 2;
  const imgH = (canvas.height * imgW) / canvas.width;
  const usableH = pageH - margin * 2;

  let heightLeft = imgH;
  let position = margin;
  pdf.addImage(imgData, 'JPEG', margin, position, imgW, imgH);
  heightLeft -= usableH;
  while (heightLeft > 0) {
    position = margin - (imgH - heightLeft);
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', margin, position, imgW, imgH);
    heightLeft -= usableH;
  }
  return pdf;
}

const doPrint = () => {
  const styleId = '__pathlab_print_css__';
  let styleEl = document.getElementById(styleId);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  // Hide everything, then reveal only the slip. Works regardless of where the
  // overlay sits in the DOM (it lives inside #root, not directly under <body>).
  styleEl.textContent = `
    @media print {
      body * { visibility: hidden !important; }
      #pathlab-print-toolbar { display: none !important; }
      #pathlab-print-slip, #pathlab-print-slip * { visibility: visible !important; }
      #pathlab-print-slip {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      @page { size: A4 portrait; margin: 12mm; }
    }
  `;
  setTimeout(() => window.print(), 200);
  setTimeout(() => styleEl?.remove(), 5000);
};

/**
 * Print the slip from a hidden iframe. The slip is 100% inline-styled, so copying
 * its outerHTML into a blank document reproduces it exactly — with no SPA CSS to
 * fight and no popup/new tab. print-color-adjust keeps the dark header/strip colours.
 */
const printViaIframe = (title: string): boolean => {
  const slip = document.getElementById('pathlab-print-slip');
  if (!slip) return false;

  document.getElementById('__pathlab_print_iframe__')?.remove();
  const iframe = document.createElement('iframe');
  iframe.id = '__pathlab_print_iframe__';
  iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return false;
  }

  doc.open();
  doc.write(
    '<!doctype html><html><head><meta charset="utf-8"><title>' +
      title +
      '</title><style>' +
      '@page{size:A4 portrait;margin:12mm}' +
      'html,body{margin:0;padding:0}' +
      "body{font-family:Inter,system-ui,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
      '#pathlab-print-slip{box-shadow:none!important;border-radius:0!important;width:100%!important;max-width:100%!important;padding:0!important}' +
      '</style></head><body>' +
      slip.outerHTML +
      '</body></html>'
  );
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      /* fall through to cleanup */
    }
    setTimeout(() => iframe.remove(), 2000);
  }, 350);
  return true;
};

const cellLabel: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  textTransform: 'uppercase',
  color: '#94a3b8',
  letterSpacing: '.6px',
};
const cellValue: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#0f172a' };
const cellSub: React.CSSProperties = { fontSize: 10, color: '#64748b' };
const infoCell: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 5,
  padding: '9px 12px',
};

export default function PrintPreviewModal({ request, tests, onClose }: PrintPreviewModalProps) {
  // Slip lists approved/completed tests; falls back to all tests pre-approval
  const slipTests = tests.filter((t) => t.approval === 'approved' || t.approval === 'completed');
  const shownTests = slipTests.length > 0 ? slipTests : tests;
  const total = shownTests.reduce((sum, t) => sum + Number(t.test?.price ?? 0), 0);
  const fmtMoney = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const isCompleted = request.status === 'COMPLETED';

  const [busy, setBusy] = useState<null | 'pdf' | 'print'>(null);
  const slipName = `PathLab-Slip-${request.slip_no ?? request.req_no}`;

  // CRITICAL FIX: Force re-enable pointer events on body so portal isn't blocked
  // by parent Radix Dialog's pointer-events:none trap.
  useEffect(() => {
    const prevBodyPointer = document.body.style.pointerEvents;
    document.body.style.pointerEvents = 'auto';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.pointerEvents = prevBodyPointer;
      document.body.style.overflow = '';
    };
  }, []);

  const handleDownloadPdf = async () => {
    setBusy('pdf');
    const filename = `${slipName}.pdf`;

    try {
      console.log('[PDF] Starting generation...');
      const pdf = await generatePdf(slipName);
      console.log('[PDF] Generated successfully');

      // PRIMARY METHOD: jsPDF.save() - Most reliable, works in ALL browsers
      // This directly triggers browser download to user's default Downloads folder
      try {
        console.log('[DOWNLOAD] Using jsPDF.save() - direct download');
        pdf.save(filename);
        console.log('[DOWNLOAD] ✅ Success - File saved to browser Downloads folder');
        toast.success(`✅ ${filename} downloaded to Downloads folder`);

        // OPTIONAL: Also try server-based copy if available (silent backup)
        try {
          const pdfDataUrl = pdf.output('datauristring');
          fetch('http://localhost:5000/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, pdfData: pdfDataUrl }),
          }).then(r => r.json()).then(result => {
            if (result.success) {
              console.log('[SERVER] ✅ Bonus: Also saved to Windows Downloads folder');
            }
          }).catch(() => {
            // Silent fail - jsPDF.save() already worked
          });
        } catch {
          // Silent fail - jsPDF.save() already worked
        }

        return;
      } catch (saveError) {
        console.warn('[DOWNLOAD] jsPDF.save() failed, trying blob fallback', saveError);
      }

      // FALLBACK METHOD 1: Blob download via anchor element
      try {
        console.log('[FALLBACK 1] Using Blob URL download');
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        console.log('[FALLBACK 1] ✅ Success');
        toast.success(`✅ ${filename} downloaded`);
        return;
      } catch (blobError) {
        console.warn('[FALLBACK 1] Blob download failed', blobError);
      }

      // FALLBACK METHOD 2: Open PDF in new tab
      try {
        console.log('[FALLBACK 2] Opening PDF in new tab');
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        toast.success(`✅ PDF opened in new tab - Use Ctrl+S to save`);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return;
      } catch (openError) {
        console.error('[FALLBACK 2] Open in tab failed', openError);
        throw new Error('All download methods failed');
      }
    } catch (e) {
      const errorMsg = (e as Error).message;
      console.error('[ERROR]', errorMsg);
      toast.error(`❌ Download failed: ${errorMsg}. Try right-clicking the slip and "Save As".`);
    } finally {
      setBusy(null);
    }
  };

  // Open the system print dialog (lists all local printers; user can also "Save as PDF").
  const handlePrint = () => {
    setBusy('print');
    try {
      console.log('[PRINT] Starting print process...');

      // PRIMARY METHOD: iframe-based print (cleanest)
      if (printViaIframe(slipName)) {
        console.log('[PRINT] ✅ Using iframe print method');
        toast.success('🖨️ Print dialog opening...');
        setTimeout(() => setBusy(null), 2000);
        return;
      }

      // FALLBACK METHOD: Direct window.print() with CSS isolation
      console.log('[PRINT] iframe failed, using window.print() fallback');
      doPrint();
      toast.success('🖨️ Print dialog opening...');
      setTimeout(() => setBusy(null), 2000);
    } catch (e) {
      const errorMsg = (e as Error).message;
      console.error('[PRINT ERROR]', errorMsg);
      toast.error(`❌ Print failed: ${errorMsg}. Use Ctrl+P as alternative.`);
      setBusy(null);
    }
  };

  // Portal to document.body ensures we render above the parent Radix Dialog.
  // The parent dialog has onInteractOutside handlers that recognize this
  // id and ignore clicks, allowing button events to register normally.
  return createPortal(
    <div
      id="pathlab-print-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        background: '#475569',
        pointerEvents: 'auto',
      }}
    >
      {/* Toolbar */}
      <div
        id="pathlab-print-toolbar"
        style={{
          position: 'sticky',
          top: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#1e293b',
          color: '#fff',
          padding: '10px 18px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Printer size={22} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Print Preview — {request.req_no}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              Download a PDF copy, or print to a local printer
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleDownloadPdf}
            disabled={busy !== null}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy && busy !== 'pdf' ? 0.6 : 1,
            }}
          >
            {busy === 'pdf' ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Download size={15} />
            )}
            {busy === 'pdf' ? 'Generating…' : 'Download PDF'}
          </button>
          <button
            onClick={handlePrint}
            disabled={busy !== null}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#059669',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy && busy !== 'print' ? 0.6 : 1,
            }}
          >
            <Printer size={15} /> Print
          </button>
          <button
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#475569',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <X size={15} /> Close
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div
        id="pathlab-print-body"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '28px 16px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
        {/* Slip card */}
        <div
          id="pathlab-print-slip"
          style={{
            background: '#fff',
            width: 780,
            maxWidth: '100%',
            padding: 38,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,.45)',
            borderRadius: 8,
            color: '#0f172a',
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          {/* A. Organisation header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              borderBottom: '2.5px solid #0f172a',
              paddingBottom: 10,
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Inline SVG logo - no CORS/loading issues with html2canvas */}
              <svg
                width="50"
                height="50"
                viewBox="0 0 50 50"
                xmlns="http://www.w3.org/2000/svg"
                style={{ flexShrink: 0, borderRadius: 4 }}
                aria-label="PathLab Pro logo"
              >
                <defs>
                  <linearGradient id="pathlab-logo-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
                <rect width="50" height="50" rx="10" fill="url(#pathlab-logo-grad)" />
                <g transform="translate(25 25)">
                  <rect x="-3" y="-13" width="6" height="26" rx="1" fill="#fff" />
                  <rect x="-13" y="-3" width="26" height="6" rx="1" fill="#fff" />
                </g>
              </svg>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>PathLab Pro</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>
                  Employee Health Benefit Programme
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase' }}>
                Test Requisition Slip
              </div>
              <div style={{ fontSize: 10, color: '#64748b' }}>
                Slip No: {request.slip_no ?? request.req_no}
              </div>
              <div style={{ fontSize: 10, color: '#64748b' }}>
                Issued: {formatDate(request.completed_at ?? new Date())}
              </div>
            </div>
          </div>

          {/* B. Dark info strip */}
          <div
            style={{
              background: '#0f172a',
              color: '#fff',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 11,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '7px 12px',
              borderRadius: 5,
              marginBottom: 12,
            }}
          >
            <span>REQ: {request.req_no}</span>
            <span style={{ color: '#475569' }}>|</span>
            <span>EMP: {request.employee_code}</span>
            <span style={{ color: '#475569' }}>|</span>
            <span>{formatDate(request.created_at)}</span>
            <span style={{ color: '#475569' }}>|</span>
            <span
              style={
                isCompleted
                  ? {
                      background: '#d1fae5',
                      color: '#065f46',
                      border: '1px solid #a7f3d0',
                      borderRadius: 999,
                      padding: '2px 10px',
                      fontSize: 10,
                      fontWeight: 700,
                    }
                  : {
                      background: '#fef3c7',
                      color: '#92400e',
                      border: '1px solid #fde68a',
                      borderRadius: 999,
                      padding: '2px 10px',
                      fontSize: 10,
                      fontWeight: 700,
                    }
              }
            >
              {request.status.replace(/_/g, ' ')}
            </span>
          </div>

          {/* C. 2x2 info grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div style={infoCell}>
              <div style={cellLabel}>Employee (Sponsor)</div>
              <div style={cellValue}>{request.employee_name}</div>
              <div style={cellSub}>
                {[request.employee_code, request.department, request.designation]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <div style={infoCell}>
              <div style={cellLabel}>Patient / Beneficiary</div>
              <div style={cellValue}>{request.ben_name}</div>
              <div style={cellSub}>
                Relation: {request.ben_relation} &nbsp;·&nbsp; Age: {calcAge(request.ben_dob)}
              </div>
            </div>
            <div style={infoCell}>
              <div style={cellLabel}>Doctor Clearance</div>
              <div style={cellValue}>{request.doctor_name ?? '—'}</div>
              <div style={cellSub}>
                {request.doctor_at ? formatDateTime(request.doctor_at) : 'Pending'}
              </div>
            </div>
            <div style={infoCell}>
              <div style={cellLabel}>HR / Admin Approval</div>
              <div style={cellValue}>{request.hr_name ?? request.admin_name ?? '—'}</div>
              <div style={cellSub}>
                {request.hr_at || request.admin_at
                  ? formatDateTime(request.hr_at ?? request.admin_at)
                  : 'Pending'}
              </div>
            </div>
          </div>

          {/* D. Tests table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
            <thead>
              <tr style={{ background: '#0f172a', color: '#fff' }}>
                <th style={{ padding: '7px 10px', fontSize: 10, textAlign: 'left' }}>#</th>
                <th style={{ padding: '7px 10px', fontSize: 10, textAlign: 'left' }}>Code</th>
                <th style={{ padding: '7px 10px', fontSize: 10, textAlign: 'left' }}>Test Name</th>
                <th style={{ padding: '7px 10px', fontSize: 10, textAlign: 'left' }}>Category</th>
                <th style={{ padding: '7px 10px', fontSize: 10, textAlign: 'right' }}>Price (৳)</th>
              </tr>
            </thead>
            <tbody>
              {shownTests.map((t, i) => (
                <tr key={t.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={{ padding: '6px 10px', fontSize: 11, borderBottom: '1px solid #f1f5f9' }}>
                    {i + 1}
                  </td>
                  <td
                    style={{
                      padding: '6px 10px',
                      fontSize: 11,
                      fontFamily: 'ui-monospace, monospace',
                      fontWeight: 700,
                      borderBottom: '1px solid #f1f5f9',
                    }}
                  >
                    {t.test?.code}
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: 11, borderBottom: '1px solid #f1f5f9' }}>
                    {t.test?.name}
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: 11, color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>
                    {t.test?.category}
                  </td>
                  <td
                    style={{
                      padding: '6px 10px',
                      fontSize: 11,
                      textAlign: 'right',
                      borderBottom: '1px solid #f1f5f9',
                    }}
                  >
                    {fmtMoney(Number(t.test?.price ?? 0))}
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                <td colSpan={4} style={{ padding: '7px 10px', fontSize: 11, textAlign: 'right' }}>
                  Total Amount
                </td>
                <td style={{ padding: '7px 10px', fontSize: 12, textAlign: 'right' }}>
                  ৳ {fmtMoney(total)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* E. Clinical notes */}
          {request.notes && (
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 5,
                padding: '9px 12px',
                marginBottom: 14,
              }}
            >
              <div style={cellLabel}>Clinical Notes / Instructions</div>
              <div style={{ fontSize: 11, color: '#475569' }}>{request.notes}</div>
            </div>
          )}

          {/* F. Signature blocks */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 26,
              borderTop: '1px dashed #cbd5e1',
              paddingTop: 30,
              marginTop: 20,
              marginBottom: 14,
            }}
          >
            {[
              { label: 'Doctor', name: request.doctor_name },
              { label: 'HR / Admin', name: request.hr_name ?? request.admin_name },
              { label: 'Pathologist', name: request.pathologist_name },
            ].map((sig) => (
              <div key={sig.label} style={{ textAlign: 'center' }}>
                <div style={{ borderBottom: '1px solid #94a3b8', height: 34, marginBottom: 5 }} />
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '.6px',
                    color: '#64748b',
                  }}
                >
                  {sig.label}
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{sig.name ?? ''}</div>
              </div>
            ))}
          </div>

          {/* G. Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px solid #e2e8f0',
              paddingTop: 8,
            }}
          >
            <span style={{ fontSize: 9, color: '#94a3b8' }}>
              Generated: {formatDateTime(new Date())} · PathLab Pro
            </span>
            <span style={{ fontSize: 9, color: '#94a3b8' }}>
              Valid only with authorised signatures
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
