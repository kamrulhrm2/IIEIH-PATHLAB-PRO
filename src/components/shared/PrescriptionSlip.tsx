import { calcAge, formatDate, formatDateTime } from '@/lib/utils';
import type { MealRelation, RequestMedicine, RequestSummary, RequestTest } from '@/types';

/**
 * PrescriptionSlip — classic two-column prescription pad, black & white
 * (only the organization logo keeps its colors).
 *
 *   LEFT column : Patient Complaint + Doctor's Advice
 *   RIGHT column: ℞ Prescribed Medicines (dose notation) + Suggested Tests
 *
 * Medicines render in standard notation:  1. Napa 500 mg — 1+0+1 (5 days, After meal)
 */

const RX_ID = 'pathlab-prescription-slip';

/**
 * Standard dose notation from the timing flags.
 * 3-part (Morning+Afternoon+Night) like "1+0+1" when Evening is unused,
 * 4-part "1+0+1+1" when the doctor also ticked Evening.
 */
export function doseNotation(m: {
  t_morning: boolean;
  t_afternoon: boolean;
  t_evening: boolean;
  t_night: boolean;
}): string {
  const bit = (b: boolean) => (b ? '1' : '0');
  const parts = m.t_evening
    ? [m.t_morning, m.t_afternoon, m.t_evening, m.t_night]
    : [m.t_morning, m.t_afternoon, m.t_night];
  const s = parts.map(bit).join('+');
  return /1/.test(s) ? s : '';
}

export function mealLabel(rel: MealRelation | null): string {
  switch (rel) {
    case 'before':
      return 'Before meal';
    case 'after':
      return 'After meal';
    case 'with':
      return 'With meal';
    default:
      return '';
  }
}

/** "(5 days, After meal)" — omits empty parts gracefully. */
export function doseDetail(m: RequestMedicine): string {
  const bits = [
    m.duration_days ? `${m.duration_days} days` : null,
    mealLabel(m.meal_relation) || null,
  ].filter(Boolean);
  return bits.length > 0 ? `(${bits.join(', ')})` : '';
}

const label: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  color: '#334155',
  letterSpacing: '.8px',
  marginBottom: 6,
  borderBottom: '1px solid #cbd5e1',
  paddingBottom: 3,
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

interface PrescriptionSlipProps {
  request: RequestSummary;
  tests: RequestTest[];
  medicines: RequestMedicine[];
}

export function PrescriptionSlip({ request, tests, medicines }: PrescriptionSlipProps) {
  const approvedTests = tests.filter(
    (t) => t.approval === 'approved' || t.approval === 'completed'
  );
  const suggestedTests = approvedTests.length > 0 ? approvedTests : tests;

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
        {/* Header — logo keeps its colors; everything else is B&W */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderBottom: '2.5px solid #0f172a',
            paddingBottom: 10,
            marginBottom: 10,
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
              <div style={{ fontSize: 10, color: '#475569' }}>
                Employee Health Benefit Programme
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase' }}>
              Prescription
            </div>
            <div style={{ fontSize: 10, color: '#475569' }}>Ref: {request.req_no}</div>
            <div style={{ fontSize: 10, color: '#475569' }}>
              Date: {formatDate(request.doctor_at ?? request.created_at)}
            </div>
          </div>
        </div>

        {/* Patient line */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            borderBottom: '1px solid #0f172a',
            paddingBottom: 8,
            marginBottom: 0,
            fontSize: 11.5,
          }}
        >
          <span>
            <span style={{ color: '#475569' }}>Patient: </span>
            <span style={{ fontWeight: 700 }}>{request.ben_name}</span>
            <span style={{ color: '#475569' }}>
              {' '}
              · {request.ben_relation} · Age: {calcAge(request.ben_dob)}
            </span>
          </span>
          <span style={{ color: '#475569' }}>
            Employee: <span style={{ fontWeight: 700, color: '#0f172a' }}>{request.employee_name}</span>{' '}
            ({request.employee_code})
          </span>
        </div>

        {/* Two-column prescription body */}
        <div style={{ display: 'flex', minHeight: 430 }}>
          {/* LEFT — complaint + advice (~38%) */}
          <div
            style={{
              width: '38%',
              borderRight: '1.5px solid #0f172a',
              paddingRight: 16,
              paddingTop: 14,
            }}
          >
            <div style={{ marginBottom: 18 }}>
              <div style={label}>Patient Complaint</div>
              <div style={{ fontSize: 11.5, color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                {request.notes?.trim() || '—'}
              </div>
            </div>

            <div>
              <div style={label}>Doctor&apos;s Advice</div>
              <div style={{ fontSize: 11.5, color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                {request.doctor_prescription?.trim() || '—'}
              </div>
            </div>
          </div>

          {/* RIGHT — ℞ medicines + suggested tests (~62%) */}
          <div style={{ flex: 1, paddingLeft: 18, paddingTop: 10 }}>
            {/* Rx symbol */}
            <div
              style={{
                fontSize: 30,
                fontWeight: 800,
                fontFamily: 'Georgia, serif',
                color: '#0f172a',
                marginBottom: 8,
              }}
            >
              ℞
            </div>

            {/* Medicines in standard notation */}
            {medicines.length === 0 ? (
              <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 20 }}>
                No medicines prescribed.
              </div>
            ) : (
              <div style={{ marginBottom: 22 }}>
                {medicines.map((m, i) => {
                  const dose = doseNotation(m);
                  const detail = doseDetail(m);
                  return (
                    <div key={m.id} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>
                        {i + 1}. {m.medicine_name}
                        {m.strength ? ` ${m.strength}` : ''}
                        {m.form ? (
                          <span style={{ fontWeight: 400, color: '#475569' }}> ({m.form})</span>
                        ) : null}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: '#1e293b',
                          marginTop: 2,
                          paddingLeft: 16,
                          fontFamily: 'ui-monospace, monospace',
                        }}
                      >
                        {dose || 'As directed'}
                        {detail ? `  ${detail}` : ''}
                      </div>
                      {m.instruction && (
                        <div style={{ fontSize: 10.5, color: '#475569', paddingLeft: 16, marginTop: 1 }}>
                          {m.instruction}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Suggested tests */}
            <div>
              <div style={label}>Suggested Tests</div>
              {suggestedTests.length === 0 ? (
                <div style={{ fontSize: 11.5, color: '#64748b' }}>—</div>
              ) : (
                <div>
                  {suggestedTests.map((t, i) => (
                    <div key={t.id} style={{ fontSize: 11.5, color: '#1e293b', marginBottom: 4 }}>
                      {i + 1}.{' '}
                      <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>
                        {t.test?.code}
                      </span>{' '}
                      — {t.test?.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Doctor signature */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            borderTop: '1px solid #0f172a',
            paddingTop: 22,
            marginTop: 6,
            marginBottom: 12,
          }}
        >
          <div style={{ textAlign: 'center', minWidth: 220 }}>
            <div style={{ borderBottom: '1px solid #334155', height: 30, marginBottom: 5 }} />
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '.6px',
                color: '#334155',
              }}
            >
              Doctor
            </div>
            <div style={{ fontSize: 11, color: '#1e293b' }}>
              {request.doctor_name ?? request.assigned_doctor_name ?? ''}
            </div>
            {request.doctor_at && (
              <div style={{ fontSize: 9, color: '#64748b' }}>{formatDateTime(request.doctor_at)}</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: '1px solid #cbd5e1',
            paddingTop: 8,
          }}
        >
          <span style={{ fontSize: 9, color: '#64748b' }}>
            Generated: {formatDateTime(new Date())} · PathLab Pro
          </span>
          <span style={{ fontSize: 9, color: '#64748b' }}>
            Valid only with authorised signature
          </span>
        </div>
      </div>
    </div>
  );
}
