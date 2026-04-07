import { NextResponse } from 'next/server';
import { createUser } from '@/lib/db/users';

export async function POST(request: Request) {
  try {
    const { email, name, password } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Email, name, and password are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      return NextResponse.json({ error: 'Password must contain at least one special character' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    await createUser(email, name, password);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    if (message === 'Email already registered') {
      // Return the same response as success to prevent email enumeration.
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
