'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn('credentials', {
      email,
      password,
      callbackUrl: '/',
      redirect: false,
    });
    if (result?.error) {
      setError('Invalid email or password');
      setLoading(false);
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-base)' }}>
      {/* Left panel — branding */}
      <div
        className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-col justify-between p-10 relative overflow-hidden"
        style={{ background: 'var(--surface-1)', borderRight: '1px solid var(--border-subtle)' }}
      >
        {/* Ambient top accent line */}
        <div className="absolute top-0 left-0 w-full h-px" style={{ background: 'linear-gradient(90deg, transparent, #FF6B00, transparent)' }} />
        {/* Ambient glow */}
        <div className="absolute -top-40 -right-20 w-72 h-72 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,107,0,0.07) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-40 -left-20 w-80 h-80 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,107,0,0.04) 0%, transparent 70%)' }} />

        {/* Logo */}
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FF6B00 0%, #cc4e00 100%)', boxShadow: '0 4px 16px rgba(255,107,0,0.35)' }}>
            <svg viewBox="0 0 48 48" fill="none" className="w-5 h-5">
              <line x1="7" y1="13" x2="24" y2="24" stroke="white" strokeWidth="3" strokeLinecap="round"/>
              <line x1="7" y1="35" x2="24" y2="24" stroke="white" strokeWidth="3" strokeLinecap="round"/>
              <line x1="24" y1="24" x2="41" y2="24" stroke="white" strokeWidth="3" strokeLinecap="round"/>
              <circle cx="24" cy="24" r="2.5" fill="white"/>
            </svg>
          </div>
          <span className="font-semibold text-[15px]" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Confluence</span>
        </div>

        {/* Center content */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Trading Terminal</p>
            <h2 className="text-3xl font-semibold leading-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
              Your disciplined<br />edge in the market.
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Journal trades, analyze performance, and stay disciplined — all in one terminal.
            </p>
          </div>

          <div className="space-y-2">
            {[
              { label: 'Trade Journal', desc: 'Log and review every trade with precision' },
              { label: 'Performance Analytics', desc: 'Equity curve, win rate, drawdown metrics' },
              { label: 'Gap Scanner', desc: 'Pre-market movers and catalysts, daily' },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
                <div className="w-1.5 h-1.5 rounded-full mt-[5px] flex-shrink-0" style={{ background: 'var(--accent)' }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{item.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] relative z-10" style={{ color: 'var(--text-tertiary)' }}>
          © {new Date().getFullYear()} Confluence Trading
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-7">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FF6B00, #cc4e00)', boxShadow: '0 2px 10px rgba(255,107,0,0.3)' }}>
              <svg viewBox="0 0 48 48" fill="none" className="w-4 h-4">
                <line x1="7" y1="13" x2="24" y2="24" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                <line x1="7" y1="35" x2="24" y2="24" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                <line x1="24" y1="24" x2="41" y2="24" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                <circle cx="24" cy="24" r="2.5" fill="white"/>
              </svg>
            </div>
            <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Confluence</span>
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Sign in</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Access your trading terminal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="input"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'var(--text-tertiary)' }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-center py-2 px-3 rounded-lg" style={{ color: 'var(--negative)', background: 'var(--negative-dim)', border: '1px solid rgba(255,61,87,0.15)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-1"
              style={{ opacity: loading ? 0.65 : 1, cursor: loading ? 'not-allowed' : 'pointer', pointerEvents: loading ? 'none' : 'auto' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="transition-colors" style={{ color: 'var(--accent-light)' }}>
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
