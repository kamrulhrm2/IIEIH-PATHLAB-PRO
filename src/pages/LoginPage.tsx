import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  FlaskConical,
  Loader2,
  Microscope,
  Pill,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';

const FEATURES = [
  {
    icon: Stethoscope,
    title: 'Complete care workflow',
    text: 'Doctor review → HR approval → Medical Services → Pathology, fully tracked',
  },
  {
    icon: Pill,
    title: 'Digital prescriptions',
    text: 'Medicines with morning / afternoon / evening / night schedule, downloadable as PDF',
  },
  {
    icon: Microscope,
    title: 'Sample-level tracking',
    text: 'Every sample records which pathologist collected it, and when',
  },
  {
    icon: FileText,
    title: 'Instant documents',
    text: 'One-click requisition slips and prescription PDFs with your organization branding',
  },
  {
    icon: ShieldCheck,
    title: 'Benefit quota built in',
    text: 'Annual entitlement per employee, deducted only when reports are delivered',
  },
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username, password);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Invalid credentials — check your Employee ID and password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* LEFT — login panel, symmetric within its half */}
      <div className="flex w-full items-center justify-center bg-white px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <img
              src="/favicon.ico"
              alt="PathLab Pro logo"
              className="mb-3 h-14 w-14 rounded-2xl object-contain shadow-sm"
            />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">PathLab Pro</h1>
            <p className="mt-1 text-sm text-slate-500">
              IIEIPATH — Employee Pathology Benefit System
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Employee ID</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. E001"
                autoComplete="username"
                className="h-11 font-mono"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  className="h-11 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <Button type="submit" className="h-11 w-full text-[15px]" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} IIEI&H · PathLab Pro
          </p>
        </div>
      </div>

      {/* RIGHT — landing / branding panel (hidden on small screens) */}
      <div className="relative hidden overflow-hidden bg-slate-900 lg:flex lg:w-1/2">
        {/* decorative glows */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 h-[28rem] w-[28rem] rounded-full bg-blue-600/20 blur-3xl" />
        <div className="pointer-events-none absolute right-1/4 top-1/3 h-56 w-56 rounded-full bg-violet-500/10 blur-3xl" />

        <div className="relative z-10 flex w-full flex-col justify-center px-12 py-16 xl:px-20">
          <div className="mb-3 flex items-center gap-2 text-cyan-400">
            <Activity className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">
              Employee Health Benefit Programme
            </span>
          </div>
          <h2 className="max-w-md text-4xl font-bold leading-tight text-white xl:text-[2.75rem]">
            Pathology benefits,
            <br />
            <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              managed end to end.
            </span>
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-400">
            From the first complaint to the delivered report — one transparent workflow for
            employees, doctors, HR, medical services and the pathology lab.
          </p>

          <div className="mt-10 space-y-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-4">
                <div className="mt-0.5 rounded-lg bg-white/5 p-2 ring-1 ring-white/10">
                  <f.icon className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-slate-400">{f.text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 flex items-center gap-6 border-t border-white/10 pt-6">
            <div className="flex items-center gap-2 text-slate-400">
              <FlaskConical className="h-4 w-4 text-cyan-400" />
              <span className="text-xs">Full test library</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-xs">Role-based access</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <ShieldCheck className="h-4 w-4 text-violet-400" />
              <span className="text-xs">Complete audit trail</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
