'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    await signIn('google', { callbackUrl: '/' });
  };

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
      <div className="w-full max-w-sm mx-auto px-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#F97316] mb-5">
            <span className="text-2xl font-bold text-white">J</span>
          </div>
          <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">Juno Mission Control</h1>
          <p className="text-sm text-[#8b949e] mt-2">Sign in to access your dashboard</p>
        </div>

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 text-gray-800 font-medium rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
        >
          {loading ? (
            <svg className="animate-spin w-5 h-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          )}
          {loading ? 'Signing in…' : 'Continue with Google'}
        </button>

        <p className="text-center text-xs text-[#484f58] mt-6">
          Access is restricted to authorized users only.
        </p>
      </div>
    </div>
  );
}
