import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ClipboardList,
  FilePlus2,
  FileText,
  FlaskConical,
  Heart,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Microscope,
  Pill,
  Stethoscope,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ChangePasswordDialog } from '@/components/shared/ChangePasswordDialog';
import { RoleBadge } from '@/components/shared/RoleBadge';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'hr', 'doctor', 'pathologist', 'medical', 'user'] },
  { to: '/requests/new', label: 'New Request', icon: FilePlus2, roles: ['admin', 'hr', 'doctor', 'pathologist', 'medical', 'user'] },
  { to: '/requests/mine', label: 'My Requests', icon: ClipboardList, roles: ['admin', 'hr', 'doctor', 'pathologist', 'medical', 'user'] },
  { to: '/requests/doctor', label: 'Doctor Queue', icon: Stethoscope, roles: ['admin', 'doctor'] },
  { to: '/requests/hr', label: 'HR Queue', icon: Users, roles: ['admin', 'hr'] },
  { to: '/requests/restricted', label: 'Restricted Queue', icon: AlertTriangle, roles: ['admin'] },
  { to: '/requests/medical', label: 'Medical Service Queue', icon: Activity, roles: ['admin', 'medical'] },
  { to: '/requests/pathology', label: 'Pathology Queue', icon: Microscope, roles: ['admin', 'pathologist'] },
  { to: '/requests/all', label: 'All Requests', icon: FileText, roles: ['admin'] },
  { to: '/employees', label: 'Employees', icon: UserCheck, roles: ['admin', 'hr'] },
  { to: '/dependents', label: 'Dependents', icon: Heart, roles: ['admin', 'hr', 'doctor', 'pathologist', 'medical', 'user'] },
  { to: '/tests', label: 'Test Library', icon: FlaskConical, roles: ['admin'] },
  { to: '/medicines', label: 'Medicine Library', icon: Pill, roles: ['admin', 'doctor'] },
  { to: '/users', label: 'System Users', icon: Lock, roles: ['admin'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['admin'] },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const [pwOpen, setPwOpen] = useState(false);
  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));
  const initials = user.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-800 bg-black">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <img
          src="/favicon.ico"
          alt="PathLab Pro logo"
          className="h-9 w-9 rounded-lg object-contain"
        />
        <div>
          <p className="text-sm font-bold leading-tight text-white">PathLab Pro</p>
          <p className="text-xs text-slate-400">IIEIPATH</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors',
                isActive
                  ? 'bg-white/20 font-semibold'
                  : 'hover:bg-white/10'
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0 text-white" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="font-mono text-xs text-slate-400">{user.username}</span>
              <RoleBadge role={user.role} className="px-1.5 py-0 text-[10px]" />
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 w-full justify-start text-white hover:bg-white/10 hover:text-white"
          onClick={() => setPwOpen(true)}
        >
          <KeyRound className="h-4 w-4" />
          Change Password
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="mt-1 w-full border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
          onClick={logout}
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>

      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </aside>
  );
}
