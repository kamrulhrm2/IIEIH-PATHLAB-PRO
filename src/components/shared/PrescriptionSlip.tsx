import { calcAge, formatDate, formatDateTime } from '@/lib/utils';
import type { RequestSummary } from '@/types';

/**
 * PrescriptionSlip — printable A4 document with the patient complaint and the
 * doctor's prescription/advice. Rendered off-screen; downloadPrescriptionPdf()
 * rasterizes it and saves it as a PDF. Intended for the patient/employee.
 */

const RX_ID = 'pathlab-prescription-slip';

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  color: '#64748b',
  letterSpacing: '.6px',
  marginBottom: 6,
};

export async function downloadPrescriptionPdf(fileName: string): Promise<void> {
  const el = document.getElementById(RX_ID);
  if (!el) throw new Error('Prescription document not found — reopen the request and try again');

  await Promise.all(
    Array.from(el.querySelectorAll('img')).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
    )
  );

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    allowTaint: true,
    logging: false,
    imageTimeout: 5000,
  });
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

  pdf.save(`${fileName}.pdf`);
}

export function PrescriptionSlip({ request }: { request: RequestSummary }) {
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
        id={RX_ID}
        style={{
          background: '#fff',
          width: 780,
          padding: 38,
          color: '#0f172a',
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderBottom: '2.5px solid #0f172a',
            paddingBottom: 10,
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src="/favicon.ico"
              alt="PathLab Pro logo"
              width={50}
              height={50}
              style={{ width: 50, height: 50, flexShrink: 0, borderRadius: 8, objectFit: 'contain' }}
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
              Doctor Advice / Prescription
            </div>
            <div style={{ fontSize: 10, color: '#64748b' }}>Ref: {request.req_no}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>
              Date: {formatDate(request.doctor_at ?? request.created_at)}
            </div>
          </div>
        </div>

        {/* Patient info strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginBottom: 16,
          }}
        >
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, padding: '9px 12px' }}>
            <div style={sectionLabel}>Patient</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{request.ben_name}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>
              Relation: {request.ben_relation} · Age: {calcAge(request.ben_dob)}
            </div>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, padding: '9px 12px' }}>
            <div style={sectionLabel}>Employee (Sponsor)</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{request.employee_name}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>
              {[request.employee_code, request.department].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>

        {/* Patient complaint */}
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 5,
            padding: '12px 14px',
            marginBottom: 14,
            minHeight: 70,
          }}
        >
          <div style={sectionLabel}>Patient Complaint</div>
          <div style={{ fontSize: 12, color: '#334155', whiteSpace: 'pre-wrap' }}>
            {request.notes?.trim() || '—'}
          </div>
        </div>

        {/* Doctor prescription */}
        <div
          style={{
            border: '1.5px solid #bfdbfe',
            background: '#eff6ff',
            borderRadius: 5,
            padding: '12px 14px',
            marginBottom: 26,
            minHeight: 140,
          }}
        >
          <div style={{ ...sectionLabel, color: '#1d4ed8' }}>Doctor&apos;s Prescription / Advice</div>
          <div style={{ fontSize: 12.5, color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {request.doctor_prescription?.trim() || 'No prescription recorded yet.'}
          </div>
        </div>

        {/* Doctor signature */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <div style={{ textAlign: 'center', minWidth: 220 }}>
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
              Doctor
            </div>
            <div style={{ fontSize: 11, color: '#475569' }}>
              {request.doctor_name ?? request.assigned_doctor_name ?? ''}
            </div>
            {request.doctor_at && (
              <div style={{ fontSize: 9, color: '#94a3b8' }}>{formatDateTime(request.doctor_at)}</div>
            )}
          </div>
        </div>

        {/* Footer */}
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
            Valid only with authorised signature
          </span>
        </div>
      </div>
    </div>
  );
}
