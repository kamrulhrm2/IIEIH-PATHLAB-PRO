import { formatDate, formatDateTime } from '@/lib/utils';
import type { RequestMedicine, RequestSummary } from '@/types';
import { doseNotation, mealLabel } from '@/components/shared/PrescriptionSlip';

/**
 * DispensingSlip — B&W pharmacy checklist (only the logo keeps color).
 * Auto-calculates the required quantity per medicine:
 *   doses/day (from the 1+0+1 schedule) × duration days = pieces needed.
 * Cream/Drops always dispense as a single unit (1 pcs — one tube/bottle
 * covers the whole course, regardless of dose schedule or duration).
 * Other non-countable forms (Syrup, Injection, Ointment, Inhaler) dispense
 * as packs.
 */

const DISP_ID = 'pathlab-dispensing-slip';

const COUNTABLE_FORMS = ['Tablet', 'Capsule'];
/** Single-unit forms — one tube/bottle per course, dispensed as "1 pcs". */
const SINGLE_UNIT_FORMS = ['Cream', 'Drops'];

export interface DispenseQty {
  /** e.g. "10 pcs", "1 pcs", "1 pack", "As directed" */
  label: string;
  /** numeric pieces when computable, else null */
  pieces: number | null;
}

/** Auto-calculate the required quantity for one prescribed medicine. */
export function requiredQty(m: RequestMedicine): DispenseQty {
  if (m.form && SINGLE_UNIT_FORMS.includes(m.form)) {
    return { label: '1 pcs', pieces: 1 };
  }

  const dosesPerDay =
    (m.t_morning ? 1 : 0) + (m.t_afternoon ? 1 : 0) + (m.t_evening ? 1 : 0) + (m.t_night ? 1 : 0);

  const countable = !m.form || COUNTABLE_FORMS.includes(m.form);
  if (!countable) return { label: '1 pack', pieces: null };
  if (dosesPerDay > 0 && m.duration_days && m.duration_days > 0) {
    const pieces = dosesPerDay * m.duration_days;
    return { label: `${pieces} pcs`, pieces };
  }
  return { label: 'As directed', pieces: null };
}

export async function downloadDispensingSlipPdf(fileName: string): Promise<void> {
  const el = document.getElementById(DISP_ID);
  if (!el) throw new Error('Dispensing slip not found — reopen the request and try again');

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

const th: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 10,
  textAlign: 'left',
  borderBottom: '1.5px solid #0f172a',
  color: '#0f172a',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '.4px',
};
const td: React.CSSProperties = {
  padding: '7px 8px',
  fontSize: 11.5,
  borderBottom: '1px solid #cbd5e1',
  color: '#1e293b',
};

interface DispensingSlipProps {
  request: RequestSummary;
  medicines: RequestMedicine[];
}

export function DispensingSlip({ request, medicines }: DispensingSlipProps) {
  const totalPieces = medicines.reduce((s, m) => s + (requiredQty(m).pieces ?? 0), 0);

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
        id={DISP_ID}
        style={{
          background: '#fff',
          width: 780,
          padding: 38,
          color: '#0f172a',
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        {/* Header — logo keeps its colors */}
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
                Employee Health Benefit Programme · Pharmacy
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase' }}>
              Medicine Dispensing Slip
            </div>
            <div style={{ fontSize: 10, color: '#475569' }}>Ref: {request.req_no}</div>
            <div style={{ fontSize: 10, color: '#475569' }}>
              Prescribed: {formatDate(request.doctor_at ?? request.created_at)} by{' '}
              {request.doctor_name ?? request.assigned_doctor_name ?? '—'}
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
            marginBottom: 14,
            fontSize: 11.5,
          }}
        >
          <span>
            <span style={{ color: '#475569' }}>Patient: </span>
            <span style={{ fontWeight: 700 }}>{request.ben_name}</span>
            <span style={{ color: '#475569' }}> · {request.ben_relation}</span>
          </span>
          <span style={{ color: '#475569' }}>
            Employee:{' '}
            <span style={{ fontWeight: 700, color: '#0f172a' }}>{request.employee_name}</span> (
            {request.employee_code})
          </span>
        </div>

        {/* Dispensing table with auto-calculated quantities */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 26 }}>#</th>
              <th style={th}>Medicine</th>
              <th style={{ ...th, width: 74 }}>Dose</th>
              <th style={{ ...th, width: 52 }}>Days</th>
              <th style={{ ...th, width: 92 }}>Meal</th>
              <th style={{ ...th, width: 90 }}>Qty Required</th>
              <th style={{ ...th, width: 70, textAlign: 'center' }}>Dispensed</th>
            </tr>
          </thead>
          <tbody>
            {medicines.map((m, i) => {
              const qty = requiredQty(m);
              return (
                <tr key={m.id}>
                  <td style={td}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: 700 }}>
                    {m.medicine_name}
                    {m.strength ? ` ${m.strength}` : ''}
                    {m.form ? (
                      <span style={{ fontWeight: 400, color: '#475569' }}> ({m.form})</span>
                    ) : null}
                    {m.instruction && (
                      <div style={{ fontSize: 9.5, fontWeight: 400, color: '#64748b' }}>
                        {m.instruction}
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>
                    {doseNotation(m) || '—'}
                  </td>
                  <td style={td}>{m.duration_days ?? '—'}</td>
                  <td style={td}>{mealLabel(m.meal_relation) || '—'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{qty.label}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 14,
                        height: 14,
                        border: '1.5px solid #0f172a',
                        borderRadius: 3,
                      }}
                    />
                  </td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={5} style={{ ...td, textAlign: 'right', fontWeight: 700, borderBottom: 'none' }}>
                Total items: {medicines.length}
              </td>
              <td style={{ ...td, fontWeight: 800, borderBottom: 'none' }}>
                {totalPieces > 0 ? `${totalPieces} pcs` : '—'}
              </td>
              <td style={{ ...td, borderBottom: 'none' }} />
            </tr>
          </tbody>
        </table>

        {/* Signatures */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: '1px solid #0f172a',
            paddingTop: 26,
            marginTop: 18,
            marginBottom: 12,
          }}
        >
          <div style={{ textAlign: 'center', minWidth: 200 }}>
            <div style={{ borderBottom: '1px solid #334155', height: 28, marginBottom: 5 }} />
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#334155' }}>
              Received By (Patient / Employee)
            </div>
          </div>
          <div style={{ textAlign: 'center', minWidth: 200 }}>
            <div style={{ borderBottom: '1px solid #334155', height: 28, marginBottom: 5 }} />
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#334155' }}>
              Pharmacist
            </div>
            {request.dispensed_by_name && (
              <div style={{ fontSize: 10, color: '#1e293b' }}>
                {request.dispensed_by_name}
                {request.dispensed_at ? ` · ${formatDateTime(request.dispensed_at)}` : ''}
              </div>
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
            Generated: {formatDateTime(new Date())} · PathLab Pro Pharmacy
          </span>
          <span style={{ fontSize: 9, color: '#64748b' }}>
            Quantities auto-calculated from the prescription schedule
          </span>
        </div>
      </div>
    </div>
  );
}
