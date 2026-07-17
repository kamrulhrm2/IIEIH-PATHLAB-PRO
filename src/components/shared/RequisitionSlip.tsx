import { calcAge, formatDate, formatDateTime } from '@/lib/utils';
import type { RequestSummary, RequestTest } from '@/types';

/**
 * RequisitionSlip — the printable A4 slip document, rendered off-screen.
 * downloadSlipPdf() rasterizes it with html2canvas and saves via jsPDF.
 *
 * The slip is 100% inline-styled so html2canvas reproduces it exactly.
 * The logo is inline SVG (no external asset → no CORS/taint issues).
 */

const SLIP_ID = 'pathlab-requisition-slip';

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

/** Rasterize the off-screen slip and download it as an A4 PDF. */
export async function downloadSlipPdf(slipName: string): Promise<void> {
  const slip = document.getElementById(SLIP_ID);
  if (!slip) throw new Error('Slip document not found — please reopen the request and try again');

  // Make sure every image in the slip (e.g. the logo) has finished loading
  // before rasterizing, so it always appears in the PDF.
  await Promise.all(
    Array.from(slip.querySelectorAll('img')).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
    )
  );

  // PDF libraries are heavy (~570 KB) — load them on demand so they stay out of the main bundle.
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(slip, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    allowTaint: true,
    logging: false,
    imageTimeout: 5000,
  });

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

  pdf.save(`${slipName}.pdf`);
}

interface RequisitionSlipProps {
  request: RequestSummary;
  tests: RequestTest[];
}

/**
 * Off-screen slip document. Render it (hidden) whenever the Download Slip
 * button is available so downloadSlipPdf() can capture it on demand.
 */
export function RequisitionSlip({ request, tests }: RequisitionSlipProps) {
  const slipTests = tests.filter((t) => t.approval === 'approved' || t.approval === 'completed');
  const shownTests = slipTests.length > 0 ? slipTests : tests;
  const total = shownTests.reduce((sum, t) => sum + Number(t.test?.price ?? 0), 0);
  const fmtMoney = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const isCompleted = request.status === 'COMPLETED';

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: -10000,
        top: 0,
        width: 780,
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
      <div
        id={SLIP_ID}
        style={{
          background: '#fff',
          width: 780,
          padding: 38,
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
            {/* Organization logo — same asset as the favicon / login page logo.
                Same-origin image, so html2canvas captures it without tainting. */}
            <img
              src="/favicon.ico"
              alt="PathLab Pro logo"
              width={50}
              height={50}
              style={{
                width: 50,
                height: 50,
                flexShrink: 0,
                borderRadius: 8,
                objectFit: 'contain',
              }}
            />
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
            style={{
              background: isCompleted ? '#d1fae5' : '#fef3c7',
              color: isCompleted ? '#065f46' : '#92400e',
              border: isCompleted ? '1px solid #a7f3d0' : '1px solid #fde68a',
              borderRadius: 999,
              padding: '2px 10px',
              fontSize: 10,
              fontWeight: 700,
            }}
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
                <td
                  style={{
                    padding: '6px 10px',
                    fontSize: 11,
                    color: '#64748b',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
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
  );
}
