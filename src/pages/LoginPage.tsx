import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';

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
      {/* LEFT — compact login panel (~1/3 width on large screens) */}
      <div className="flex w-full items-center justify-center bg-white px-6 py-12 lg:w-2/5 xl:w-1/3">
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

      {/* RIGHT — pure graphical art panel (hidden on small screens) */}
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden lg:flex">
        {/* animated keyframes for the artwork */}
        <style>{`
          @keyframes pl-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
          @keyframes pl-float2 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(14px)} }
          @keyframes pl-dash { to { stroke-dashoffset: -400; } }
          @keyframes pl-spin-slow { to { transform: rotate(360deg); } }
          @keyframes pl-bubble { 0%{transform:translateY(0);opacity:.9} 100%{transform:translateY(-46px);opacity:0} }
        `}</style>

        {/* deep gradient backdrop */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-900" />

        {/* soft glow orbs */}
        <div className="pointer-events-none absolute -left-32 top-10 h-[26rem] w-[26rem] rounded-full bg-cyan-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-[30rem] w-[30rem] rounded-full bg-blue-600/25 blur-3xl" />
        <div className="pointer-events-none absolute right-24 top-6 h-64 w-64 rounded-full bg-violet-500/15 blur-3xl" />

        {/* dotted texture */}
        <svg className="absolute inset-0 h-full w-full opacity-[0.15]" aria-hidden="true">
          <defs>
            <pattern id="pl-dots" width="26" height="26" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.5" fill="#7dd3fc" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#pl-dots)" />
        </svg>

        {/* central artwork */}
        <svg
          viewBox="0 0 640 640"
          className="relative z-10 h-[min(78vh,40rem)] w-auto drop-shadow-[0_0_60px_rgba(34,211,238,0.25)]"
          aria-label="Pathology laboratory artwork"
        >
          <defs>
            <linearGradient id="pl-cyan" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
            <linearGradient id="pl-violet" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
            <linearGradient id="pl-liquid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.95" />
            </linearGradient>
            <radialGradient id="pl-core" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* halo */}
          <circle cx="320" cy="320" r="300" fill="url(#pl-core)" />

          {/* orbit rings */}
          <g style={{ transformOrigin: '320px 320px', animation: 'pl-spin-slow 60s linear infinite' }}>
            <circle cx="320" cy="320" r="252" fill="none" stroke="#38bdf8" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="4 10" />
            <circle cx="572" cy="320" r="7" fill="url(#pl-cyan)" />
            <circle cx="68" cy="320" r="5" fill="#a78bfa" />
          </g>
          <g style={{ transformOrigin: '320px 320px', animation: 'pl-spin-slow 90s linear infinite reverse' }}>
            <circle cx="320" cy="320" r="198" fill="none" stroke="#818cf8" strokeOpacity="0.2" strokeWidth="1.5" strokeDasharray="2 8" />
            <circle cx="320" cy="122" r="6" fill="#22d3ee" />
          </g>

          {/* DNA helix — left */}
          <g style={{ animation: 'pl-float2 7s ease-in-out infinite' }} opacity="0.9">
            <path d="M150 180 C 200 215, 100 250, 150 285 C 200 320, 100 355, 150 390 C 200 425, 100 460, 150 495"
              fill="none" stroke="url(#pl-violet)" strokeWidth="5" strokeLinecap="round" />
            <path d="M150 180 C 100 215, 200 250, 150 285 C 100 320, 200 355, 150 390 C 100 425, 200 460, 150 495"
              fill="none" stroke="#38bdf8" strokeWidth="5" strokeLinecap="round" opacity="0.75" />
            {[212, 250, 322, 358, 428, 464].map((y) => (
              <line key={y} x1="118" y1={y} x2="182" y2={y} stroke="#7dd3fc" strokeWidth="3.5" strokeLinecap="round" opacity="0.65" />
            ))}
          </g>

          {/* Conical flask — center */}
          <g style={{ animation: 'pl-float 6s ease-in-out infinite' }}>
            <path d="M290 160 L290 265 L212 430 A26 26 0 0 0 236 468 L404 468 A26 26 0 0 0 428 430 L350 265 L350 160 Z"
              fill="#0f172a" fillOpacity="0.55" stroke="url(#pl-cyan)" strokeWidth="7" strokeLinejoin="round" />
            <rect x="276" y="142" width="88" height="22" rx="11" fill="none" stroke="url(#pl-cyan)" strokeWidth="7" />
            {/* liquid */}
            <path d="M262 330 Q 320 310 378 330 L 424 428 A22 22 0 0 1 402 458 L 238 458 A22 22 0 0 1 216 428 Z"
              fill="url(#pl-liquid)" />
            {/* bubbles rising inside */}
            <circle cx="298" cy="420" r="9" fill="#a5f3fc" opacity="0.9" style={{ animation: 'pl-bubble 3.2s ease-in infinite' }} />
            <circle cx="336" cy="432" r="6" fill="#e0f2fe" opacity="0.8" style={{ animation: 'pl-bubble 2.6s .6s ease-in infinite' }} />
            <circle cx="318" cy="440" r="4.5" fill="#bae6fd" opacity="0.8" style={{ animation: 'pl-bubble 2.2s 1.1s ease-in infinite' }} />
            <circle cx="356" cy="424" r="5" fill="#a5f3fc" opacity="0.7" style={{ animation: 'pl-bubble 3s 1.6s ease-in infinite' }} />
            {/* glass shine */}
            <path d="M300 190 L300 262 L268 330" fill="none" stroke="#e0f2fe" strokeWidth="5" strokeLinecap="round" opacity="0.35" />
          </g>

          {/* ECG heartbeat line across */}
          <path
            d="M60 560 H 210 L 236 522 L 268 592 L 300 470 L 332 592 L 358 560 H 580"
            fill="none" stroke="url(#pl-cyan)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="14 10"
            style={{ animation: 'pl-dash 6s linear infinite' }}
          />
          <circle cx="580" cy="560" r="8" fill="#22d3ee">
            <animate attributeName="opacity" values="1;0.25;1" dur="1.2s" repeatCount="indefinite" />
          </circle>

          {/* test tubes — right */}
          <g style={{ animation: 'pl-float 8s .8s ease-in-out infinite' }}>
            <rect x="466" y="180" width="34" height="130" rx="17" fill="#0f172a" fillOpacity="0.5" stroke="#38bdf8" strokeWidth="5" />
            <path d="M471 240 h24 v53 a12 12 0 0 1 -24 0 Z" fill="#22d3ee" opacity="0.85" />
            <rect x="516" y="150" width="34" height="160" rx="17" fill="#0f172a" fillOpacity="0.5" stroke="#a78bfa" strokeWidth="5" />
            <path d="M521 226 h24 v67 a12 12 0 0 1 -24 0 Z" fill="#a78bfa" opacity="0.8" />
          </g>

          {/* molecule — bottom left */}
          <g style={{ animation: 'pl-float2 9s .4s ease-in-out infinite' }} opacity="0.9">
            <line x1="120" y1="560" x2="176" y2="524" stroke="#7dd3fc" strokeWidth="3.5" />
            <line x1="176" y1="524" x2="232" y2="556" stroke="#7dd3fc" strokeWidth="3.5" />
            <line x1="176" y1="524" x2="176" y2="470" stroke="#7dd3fc" strokeWidth="3.5" />
            <circle cx="120" cy="560" r="11" fill="url(#pl-cyan)" />
            <circle cx="232" cy="556" r="9" fill="#a78bfa" />
            <circle cx="176" cy="524" r="13" fill="#0f172a" stroke="url(#pl-cyan)" strokeWidth="4" />
            <circle cx="176" cy="470" r="8" fill="#22d3ee" />
          </g>

          {/* sparkle plus signs */}
          {[
            [92, 120, 10], [560, 100, 8], [606, 420, 9], [70, 420, 7],
          ].map(([x, y, s], i) => (
            <g key={i} stroke="#7dd3fc" strokeWidth="3.5" strokeLinecap="round" opacity="0.7">
              <line x1={x - s} y1={y} x2={x + s} y2={y} />
              <line x1={x} y1={y - s} x2={x} y2={y + s} />
            </g>
          ))}
        </svg>

        {/* tiny brand mark, bottom corner */}
        <div className="absolute bottom-6 right-8 z-10 flex items-center gap-2 opacity-70">
          <img src="/favicon.ico" alt="" className="h-6 w-6 rounded-md object-contain" />
          <span className="text-xs font-semibold tracking-wide text-slate-300">PathLab Pro</span>
        </div>
      </div>
    </div>
  );
}
