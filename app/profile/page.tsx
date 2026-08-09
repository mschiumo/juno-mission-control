'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { usePlanStatus, invalidateEntitlements } from '@/lib/use-entitlements';
import { TIER_LABELS } from '@/lib/entitlements';
import Link from 'next/link';
import {
  ArrowLeft,
  User,
  Mail,
  Bell,
  BarChart3,
  LogOut,
  Loader2,
  Check,
  Pencil,
  X,
  Crown,
  Trash2,
  CreditCard,
  XCircle,
} from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

interface EmailAlerts {
  marketBriefing: boolean;
}

interface UserPrefs {
  emailAlerts?: EmailAlerts;
}

export default function ProfilePage() {
  const { status: planStatus, loading: planLoading } = usePlanStatus();
  const tier = planStatus.entitlements.tier;
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Downscale to a 256px cover-cropped JPEG so uploads stay ~20KB. */
  const handleAvatarFile = async (file: File) => {
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const SIZE = 256;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d')!;
      const scale = Math.max(SIZE / bitmap.width, SIZE / bitmap.height);
      const w = bitmap.width * scale;
      const h = bitmap.height * scale;
      ctx.drawImage(bitmap, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const res = await fetch('/api/user/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      const json = await res.json();
      if (json.success) {
        setAvatarFailed(false);
        setAvatarVersion((v) => v + 1);
      } else {
        setAvatarError(json.error || 'Could not upload the photo.');
      }
    } catch {
      setAvatarError('Could not read that image — try a different file.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      await fetch('/api/user/avatar', { method: 'DELETE' });
      setAvatarFailed(true);
      setAvatarVersion((v) => v + 1);
    } finally {
      setAvatarBusy(false);
    }
  };

  const openBillingPortal = async () => {
    setPlanBusy('portal');
    setPlanError(null);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const json = await res.json();
      if (json.success && json.url) {
        window.location.href = json.url;
        return;
      }
      setPlanError(json.error || 'Could not open the billing portal.');
    } catch {
      setPlanError('Could not open the billing portal.');
    } finally {
      setPlanBusy(null);
    }
  };

  const cancelPlan = async () => {
    if (!window.confirm('Cancel your subscription and move to the free Silver plan? Billing stops, any linked brokerage is disconnected immediately, and your journal and data stay.')) return;
    setPlanBusy('cancel');
    setPlanError(null);
    try {
      const res = await fetch('/api/user/plan/cancel', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        invalidateEntitlements();
      } else {
        setPlanError(json.error || 'Could not cancel the plan.');
      }
    } catch {
      setPlanError('Could not cancel the plan.');
    } finally {
      setPlanBusy(null);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.prompt(
      'This permanently deletes your account, all journal and trade data, and disconnects any linked brokerage. Type DELETE to confirm.',
    );
    if (confirmed !== 'DELETE') return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/user/account', { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        signOut({ callbackUrl: '/' });
        return;
      }
      setDeleteError(json.error || 'Could not delete the account.');
    } catch {
      setDeleteError('Could not delete the account.');
    } finally {
      setDeleting(false);
    }
  };
  const { data: session, update: updateSession } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<'name' | 'email' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

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

  const toggleEmailAlert = async (key: 'marketBriefing') => {
    if (!prefs) return;
    setSaving(key);

    const current = prefs.emailAlerts || { marketBriefing: false };
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

  const startEditing = (field: 'name' | 'email') => {
    setEditing(field);
    setEditValue(field === 'name' ? (profile?.name || '') : (profile?.email || ''));
    setEditError(null);
  };

  const cancelEditing = () => {
    setEditing(null);
    setEditValue('');
    setEditError(null);
  };

  const saveField = async () => {
    if (!editing) return;
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditError(`${editing === 'name' ? 'Name' : 'Email'} cannot be empty`);
      return;
    }
    setSaving(editing);
    setEditError(null);

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [editing]: trimmed }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setProfile(data.profile);
        setEditing(null);
        setEditValue('');
        // Update the NextAuth session so the header avatar reflects changes
        await updateSession({ name: data.profile.name, email: data.profile.email });
      } else {
        setEditError(data.error || 'Failed to save');
      }
    } catch {
      setEditError('Network error');
    } finally {
      setSaving(null);
    }
  };

  const emailAlerts = prefs?.emailAlerts || { marketBriefing: false };

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
          <div className="p-5 space-y-5">
            {/* Avatar — click to upload; renders in the app header too */}
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleAvatarFile(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarBusy}
                title="Upload a profile photo"
                className="relative w-14 h-14 rounded-full overflow-hidden shrink-0 group disabled:opacity-60"
              >
                {avatarFailed ? (
                  <span className="w-full h-full rounded-full bg-[#F97316] flex items-center justify-center text-white text-xl font-bold">
                    {(profile?.name || session?.user?.name || 'U').charAt(0).toUpperCase()}
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/user/avatar?v=${avatarVersion}`}
                    alt="Your profile photo"
                    className="w-full h-full object-cover"
                    onError={() => setAvatarFailed(true)}
                    ref={(el) => {
                      if (el && el.complete && el.naturalWidth === 0) setAvatarFailed(true);
                    }}
                  />
                )}
                <span className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {avatarBusy ? (
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  ) : (
                    <Pencil className="w-4 h-4 text-white" />
                  )}
                </span>
              </button>
              <div className="text-sm text-[#8b949e]">
                {profile?.createdAt && (
                  <span>
                    Member since{' '}
                    <span className="text-[#c9d1d9]">
                      {new Date(profile.createdAt).toLocaleDateString('en-US', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                  </span>
                )}
                <div className="mt-1 flex gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarBusy}
                    className="text-[#F97316] hover:underline disabled:opacity-60"
                  >
                    {avatarFailed ? 'Upload photo' : 'Change photo'}
                  </button>
                  {!avatarFailed && (
                    <button
                      type="button"
                      onClick={removeAvatar}
                      disabled={avatarBusy}
                      className="text-[#8b949e] hover:text-[#f85149] disabled:opacity-60"
                    >
                      Remove
                    </button>
                  )}
                </div>
                {avatarError && <p className="text-xs text-[#f85149] mt-1">{avatarError}</p>}
              </div>
            </div>

            {/* Name field */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#8b949e] uppercase tracking-wide">Name</label>
              {editing === 'name' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') cancelEditing(); }}
                      autoFocus
                      className="flex-1 px-3 py-2 text-sm bg-[#0d1117] border border-[#30363d] rounded-lg text-white focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
                    />
                    <button
                      onClick={saveField}
                      disabled={saving === 'name'}
                      className="p-2 rounded-lg bg-[#F97316] text-white hover:bg-[#ea6c10] transition-colors disabled:opacity-50"
                    >
                      {saving === 'name' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="p-2 rounded-lg hover:bg-[#30363d] text-[#8b949e] hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {editError && <p className="text-xs text-[#f85149]">{editError}</p>}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">{profile?.name || session?.user?.name}</p>
                  <button
                    onClick={() => startEditing('name')}
                    className="p-1 rounded hover:bg-[#30363d] text-[#8b949e] hover:text-white transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Email field */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#8b949e] uppercase tracking-wide">Email</label>
              {editing === 'email' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') cancelEditing(); }}
                      autoFocus
                      className="flex-1 px-3 py-2 text-sm bg-[#0d1117] border border-[#30363d] rounded-lg text-white focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
                    />
                    <button
                      onClick={saveField}
                      disabled={saving === 'email'}
                      className="p-2 rounded-lg bg-[#F97316] text-white hover:bg-[#ea6c10] transition-colors disabled:opacity-50"
                    >
                      {saving === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="p-2 rounded-lg hover:bg-[#30363d] text-[#8b949e] hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {editError && <p className="text-xs text-[#f85149]">{editError}</p>}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-[#c9d1d9]">{profile?.email || session?.user?.email}</p>
                  <button
                    onClick={() => startEditing('email')}
                    className="p-1 rounded hover:bg-[#30363d] text-[#8b949e] hover:text-white transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Plan */}
        <section className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-[#30363d]">
            <Crown className="w-4 h-4 text-[#F97316]" />
            <h2 className="text-sm font-semibold text-white">Plan</h2>
          </div>
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-white">
                {planLoading
                  ? '…'
                  : planStatus.source === 'owner'
                    ? 'Platinum · Owner'
                    : `${TIER_LABELS[tier]}${tier === 'silver' ? ' · Free' : ''}${planStatus.source === 'trial' ? ' · Free trial' : planStatus.source === 'referral' ? ' · Referral' : ''}`}
              </p>
              {!planLoading && planStatus.expiresAt && (
                <p className="text-xs text-[#8b949e] mt-0.5">
                  {planStatus.source === 'trial' || planStatus.source === 'referral' ? 'Free access until ' : 'Renews '}
                  {new Date(planStatus.expiresAt).toLocaleDateString()}
                </p>
              )}
            </div>
            {planStatus.source !== 'owner' && (
              <Link
                href="/plans"
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#F97316]/10 text-[#F97316] hover:bg-[#F97316]/20 transition-colors"
              >
                {tier === 'silver' ? 'Upgrade' : 'View plans'}
              </Link>
            )}
          </div>
          {/* Subscription controls — explicit manage + cancel for paid plans */}
          {!planLoading && tier !== 'silver' && planStatus.source !== 'owner' && (
            <div className="px-5 py-4 border-t border-[#30363d]">
              {planError && <p className="text-xs text-[#f85149] mb-2">{planError}</p>}
              <div className="flex flex-wrap gap-2">
                {planStatus.source === 'billing' && (
                  <button
                    onClick={openBillingPortal}
                    disabled={planBusy !== null}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-sm font-semibold text-white transition-colors disabled:opacity-60"
                  >
                    {planBusy === 'portal' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                    Manage billing
                  </button>
                )}
                <button
                  onClick={cancelPlan}
                  disabled={planBusy !== null}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#f85149]/40 text-[#f85149] hover:bg-[#f85149]/10 text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {planBusy === 'cancel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Cancel subscription
                </button>
              </div>
              <p className="text-[11px] text-[#8b949e] mt-2">
                Cancelling stops billing and disconnects any linked brokerage immediately — your
                journal and data stay.
              </p>
            </div>
          )}
        </section>

        {/* Email Notifications — Gold+ only; hidden below that */}
        {planStatus.entitlements.features.emailBriefings && (
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
        )}

        {/* Danger zone — permanent account deletion */}
        {planStatus.source !== 'owner' && (
          <section className="bg-[#161b22] border border-[#f85149]/30 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-[#30363d]">
              <Trash2 className="w-4 h-4 text-[#f85149]" />
              <h2 className="text-sm font-semibold text-white">Delete Account</h2>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-[#8b949e] leading-relaxed mb-3">
                Permanently deletes your account, journal, trades, and analytics, and immediately
                disconnects any linked brokerage. This cannot be undone.
              </p>
              {deleteError && <p className="text-xs text-[#f85149] mb-2">{deleteError}</p>}
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="flex items-center gap-2 text-sm text-[#f85149] hover:text-[#ff7b72] transition-colors disabled:opacity-60"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete my account
              </button>
            </div>
          </section>
        )}

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
