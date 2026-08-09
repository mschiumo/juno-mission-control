'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/auth/reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // constant-success UX regardless
    }
    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-[#e6edf3]">Reset your password</h1>
          <p className="text-sm text-[#8b949e] mt-1">
            Enter your account email and we&apos;ll send a reset link.
          </p>
        </div>

        {sent ? (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 text-center">
            <p className="text-sm text-[#e6edf3] mb-2">Check your inbox</p>
            <p className="text-xs text-[#8b949e] leading-relaxed">
              If <span className="text-[#c9d1d9]">{email}</span> has an account, a reset link is
              on its way. It works once and expires in an hour — check spam if it doesn&apos;t
              show up.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-[#161b22] border border-[#30363d] rounded-lg text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#F97316] transition-colors"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#F97316] hover:bg-[#ea6c10] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-[#8b949e] mt-5">
          Remembered it?{' '}
          <Link href="/login" className="text-[#F97316] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
