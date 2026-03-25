// =============================================================================
// BMS Session KPI Dashboard - App Header (T046)
// Professional navigation header with icons, user info, and connection status.
// =============================================================================

import { Link, useLocation } from 'react-router-dom';
import { useBmsSessionContext } from '@/contexts/BmsSessionContext';
import {
  Activity,
  LayoutDashboard,
  Library,
  LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Navigation tab definitions
// ---------------------------------------------------------------------------

interface NavTab {
  label: string;
  path: string;
  icon: LucideIcon;
}

const NAV_TABS: NavTab[] = [
  { label: 'หน้าหลัก', path: '/', icon: LayoutDashboard },
  { label: 'ไลบรารี', path: '/library', icon: Library },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppHeader() {
  const { session, disconnectSession } = useBmsSessionContext();
  const location = useLocation();

  const databaseLabel =
    session?.databaseType === 'postgresql' ? 'PostgreSQL' : 'MySQL';

  // Extract user initials (first letter of name)
  const userInitial = session?.userInfo.name?.charAt(0).toUpperCase() ?? '?';

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 px-6 shadow-lg">
      {/* ----------------------------------------------------------------- */}
      {/* Left: Hospital icon + title                                       */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
          <Activity className="h-5 w-5 text-blue-400" />
        </div>
        <div className="flex flex-col">
          <h1 className="text-base font-bold leading-tight tracking-tight text-white">
            Template App
          </h1>
          <span className="text-[11px] leading-tight text-white/50">
            BMS Session
          </span>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Center: Navigation tabs with icons                                */}
      {/* ----------------------------------------------------------------- */}
      <nav className="flex items-center gap-1">
        {NAV_TABS.map((tab) => {
          const isActive =
            tab.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(tab.path);

          const Icon = tab.icon;

          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={
                'relative flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ' +
                (isActive
                  ? 'text-white'
                  : 'text-white/60 hover:text-white/90')
              }
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-blue-400" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ----------------------------------------------------------------- */}
      {/* Right: Connection status, DB badge, user avatar, disconnect       */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-center gap-4">
        {session && (
          <>
            {/* Connection status */}
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
              </span>
              <span className="text-xs font-medium text-white/80">
                เชื่อมต่อแล้ว
              </span>
            </div>

            {/* Divider */}
            <div className="h-6 w-px bg-white/15" />

            {/* Database badge */}
            <span className="inline-flex items-center rounded-md border border-white/20 bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/90 backdrop-blur">
              {databaseLabel}
            </span>

            {/* Divider */}
            <div className="h-6 w-px bg-white/15" />

            {/* User avatar + info */}
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white">
                {userInitial}
              </div>
              <div className="flex flex-col text-right">
                <span className="text-sm font-medium leading-tight text-white">
                  {session.userInfo.name}
                </span>
                <span className="text-[11px] leading-tight text-white/50">
                  {session.userInfo.department}
                </span>
              </div>
            </div>

            {/* Disconnect button */}
            <button
              onClick={disconnectSession}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              ยกเลิกการเชื่อมต่อ
            </button>
          </>
        )}
      </div>
    </header>
  );
}
