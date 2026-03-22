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
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#0d1117] border border-[#30363d] mb-4">
            <svg viewBox="0 0 48 48" fill="none" className="w-8 h-8">
              <line x1="7" y1="13" x2="24" y2="24" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
              <line x1="7" y1="35" x2="24" y2="24" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
              <line x1="24" y1="24" x2="41" y2="24" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
              <circle cx="24" cy="24" r="2.5" fill="white"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#e6edf3]">Confluence Trading</h1>
          <p className="text-sm text-[#8b949e] mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2.5 bg-[#161b22] border border-[#30363d] rounded-lg text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#F97316] transition-colors"
          />

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
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

          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#F97316] hover:bg-[#ea6c10] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-[#8b949e] mt-5">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-[#F97316] hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
