'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import {
  ArrowLeft,
  User,
  Mail,
  Bell,
  BarChart3,
  TrendingUp,
  LogOut,
  Loader2,
  Check,
} from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

interface EmailAlerts {
  marketBriefing: boolean;
  gapScanner: boolean;
}

interface UserPrefs {
  calendarUrl: string | null;
  emailAlerts?: EmailAlerts;
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [profileRes, prefsRes] = await Promise.all([
        fetch('/api/user/profile'),
        fetch('/api/user/prefs'),
      ]);
      if (profileRes.ok) {
        const data = await profileRes.json();
        setProfile(data.profile);
      }
      if (prefsRes.ok) {
        const data = await prefsRes.json();
        setPrefs(data.prefs);
      }
    } catch (err) {
      console.error('Failed to fetch profile data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleEmailAlert = async (key: 'marketBriefing' | 'gapScanner') => {
    if (!prefs) return;
    setSaving(key);

    const current = prefs.emailAlerts || { marketBriefing: false, gapScanner: false };
    const updated = { ...current, [key]: !current[key] };

    try {
      const res = await fetch('/api/user/prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailAlerts: updated }),
      });
      if (res.ok) {
        const data = await res.json();
        setPrefs(data.prefs);
      }
    } catch (err) {
      console.error('Failed to save preference:', err);
    } finally {
      // Brief delay so the user sees the check animation
      setTimeout(() => setSaving(null), 600);
    }
  };

  const emailAlerts = prefs?.emailAlerts || { marketBriefing: false, gapScanner: false };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#8b949e] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      {/* Header */}
      <header className="border-b border-[#30363d] bg-[#161b22]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors text-[#8b949e] hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-bold text-white">Profile & Settings</h1>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Account Information */}
        <section className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-[#30363d]">
            <User className="w-4 h-4 text-[#F97316]" />
            <h2 className="text-sm font-semibold text-white">Account Information</h2>
          </div>
          <div className="p-5 space-y-4">
            {/* Avatar + Name */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-[#F97316] flex items-center justify-center text-white text-xl font-bold shrink-0">
                {session?.user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <p className="text-base font-semibold text-white">{profile?.name || session?.user?.name}</p>
                <p className="text-sm text-[#8b949e]">{profile?.email || session?.user?.email}</p>
              </div>
            </div>

            {/* Member Since */}
            {profile?.createdAt && (
              <div className="flex items-center gap-2 text-sm text-[#8b949e]">
                <span>Member since</span>
                <span className="text-[#c9d1d9]">
                  {new Date(profile.createdAt).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Email Notifications */}
        <section className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-[#30363d]">
            <Bell className="w-4 h-4 text-[#F97316]" />
            <h2 className="text-sm font-semibold text-white">Email Notifications</h2>
          </div>
          <div className="divide-y divide-[#30363d]">
            {/* Market Briefing Toggle */}
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-2 rounded-lg bg-[#F97316]/10">
                  <BarChart3 className="w-4 h-4 text-[#F97316]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Morning Market Briefing</p>
                  <p className="text-xs text-[#8b949e] mt-0.5">
                    AI-generated market briefing delivered to your inbox each weekday at 8 AM EST
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleEmailAlert('marketBriefing')}
                disabled={saving === 'marketBriefing'}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ml-4 ${
                  emailAlerts.marketBriefing
                    ? 'bg-[#F97316]'
                    : 'bg-[#30363d]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 flex items-center justify-center ${
                    emailAlerts.marketBriefing ? 'translate-x-5' : 'translate-x-0'
                  }`}
                >
                  {saving === 'marketBriefing' ? (
                    <Loader2 className="w-3 h-3 text-[#8b949e] animate-spin" />
                  ) : emailAlerts.marketBriefing ? (
                    <Check className="w-3 h-3 text-[#F97316]" />
                  ) : null}
                </span>
              </button>
            </div>

            {/* Gap Scanner Toggle */}
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-2 rounded-lg bg-[#3fb950]/10">
                  <TrendingUp className="w-4 h-4 text-[#3fb950]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Gap Scanner Report</p>
                  <p className="text-xs text-[#8b949e] mt-0.5">
                    Pre-market gap scan results emailed each weekday morning before market open
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleEmailAlert('gapScanner')}
                disabled={saving === 'gapScanner'}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ml-4 ${
                  emailAlerts.gapScanner
                    ? 'bg-[#F97316]'
                    : 'bg-[#30363d]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 flex items-center justify-center ${
                    emailAlerts.gapScanner ? 'translate-x-5' : 'translate-x-0'
                  }`}
                >
                  {saving === 'gapScanner' ? (
                    <Loader2 className="w-3 h-3 text-[#8b949e] animate-spin" />
                  ) : emailAlerts.gapScanner ? (
                    <Check className="w-3 h-3 text-[#F97316]" />
                  ) : null}
                </span>
              </button>
            </div>
          </div>

          {/* Info banner */}
          <div className="px-5 py-3 bg-[#0d1117]/60 border-t border-[#30363d]">
            <div className="flex items-start gap-2">
              <Mail className="w-3.5 h-3.5 text-[#8b949e] mt-0.5 shrink-0" />
              <p className="text-xs text-[#8b949e] leading-relaxed">
                Emails are sent to <span className="text-[#c9d1d9]">{profile?.email || session?.user?.email}</span>.
                Reports are generated from the same data you see on your dashboard.
              </p>
            </div>
          </div>
        </section>

        {/* Sign Out */}
        <section className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div className="px-5 py-4">
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex items-center gap-2 text-sm text-[#f85149] hover:text-[#ff7b72] transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
