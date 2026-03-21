'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Check, X } from 'lucide-react';

const rules = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'At least one special character (!@#$%…)', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function strengthScore(p: string): number {
  return rules.filter(r => r.test(p)).length;
}

const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
const strengthColors = ['', '#ef4444', '#f59e0b', '#3b82f6', '#22c55e'];

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const score = strengthScore(password);
  const allRulesMet = score === rules.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!allRulesMet) {
      setError('Please meet all password requirements');
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? 'Registration failed');
      setLoading(false);
      return;
    }

    const result = await signIn('credentials', {
      email,
      password,
      callbackUrl: '/',
      redirect: false,
    });

    if (result?.error) {
      setError('Account created — please sign in');
      setLoading(false);
      window.location.href = '/login';
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-[#0d9488] to-[#0891b2] mb-4">
            <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7">
              <path d="M8,12 Q20,12 24,24" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
              <path d="M8,36 Q20,36 24,24" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
              <path d="M24,24 L40,24" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#e6edf3]">Create your account</h1>
          <p className="text-sm text-[#8b949e] mt-1">Join Confluence Trading</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full px-3 py-2.5 bg-[#161b22] border border-[#30363d] rounded-lg text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#F97316] transition-colors"
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2.5 bg-[#161b22] border border-[#30363d] rounded-lg text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#F97316] transition-colors"
          />

          {/* Password with eye toggle */}
          <div className="space-y-2">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setPasswordFocused(true)}
                required
                className="w-full px-3 py-2.5 pr-10 bg-[#161b22] border border-[#30363d] rounded-lg text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#F97316] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#484f58] hover:text-[#8b949e] transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Strength bar + label */}
            {password.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  {rules.map((_, i) => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full transition-all duration-300"
                      style={{ backgroundColor: i < score ? strengthColors[score] : '#30363d' }}
                    />
                  ))}
                </div>
                <p className="text-xs font-medium" style={{ color: strengthColors[score] }}>
                  {strengthLabels[score]}
                </p>
              </div>
            )}

            {/* Requirements checklist */}
            {(passwordFocused || password.length > 0) && (
              <ul className="space-y-1 pt-1">
                {rules.map(rule => {
                  const met = rule.test(password);
                  return (
                    <li key={rule.label} className="flex items-center gap-1.5">
                      {met
                        ? <Check className="w-3 h-3 text-[#22c55e] flex-shrink-0" />
                        : <X className="w-3 h-3 text-[#484f58] flex-shrink-0" />
                      }
                      <span className={`text-xs transition-colors ${met ? 'text-[#22c55e]' : 'text-[#484f58]'}`}>
                        {rule.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Confirm password with eye toggle */}
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              placeholder="Confirm password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className="w-full px-3 py-2.5 pr-10 bg-[#161b22] border border-[#30363d] rounded-lg text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#F97316] transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#484f58] hover:text-[#8b949e] transition-colors"
              tabIndex={-1}
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#F97316] hover:bg-[#ea6c10] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-xs text-[#8b949e] mt-5">
          Already have an account?{' '}
          <Link href="/login" className="text-[#F97316] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
