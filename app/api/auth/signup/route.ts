/**
 * Signup API - Handle user registration with email/password
 * 
 * POST /api/auth/signup - Create new user account
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { getRedisClient } from '@/lib/redis';

const SALT_ROUNDS = 12;

// User storage keys
const USER_BY_EMAIL_KEY = (email: string) => `users:by-email:${email.toLowerCase().trim()}`;
const USER_BY_ID_KEY = (userId: string) => `users:${userId}`;

interface SignupRequest {
  email: string;
  password: string;
  name?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SignupRequest = await request.json();
    const { email, password, name } = body;

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const redis = await getRedisClient();

    // Check if user already exists
    const existingUser = await redis.get(USER_BY_EMAIL_KEY(normalizedEmail));
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // Generate UUID for user
    const userId = crypto.randomUUID();

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user data
    const userByEmail = {
      userId,
      email: normalizedEmail,
      hashedPassword,
      name: name || null,
      createdAt: new Date().toISOString(),
      provider: 'credentials',
    };

    const userById = {
      userId,
      email: normalizedEmail,
      name: name || null,
      createdAt: new Date().toISOString(),
      provider: 'credentials',
    };

    // Store user in Redis
    await redis.set(USER_BY_EMAIL_KEY(normalizedEmail), JSON.stringify(userByEmail));
    await redis.set(USER_BY_ID_KEY(userId), JSON.stringify(userById));

    return NextResponse.json(
      { 
        success: true, 
        message: 'Account created successfully',
        user: {
          id: userId,
          email: normalizedEmail,
          name: name || null,
        }
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create account' },
      { status: 500 }
    );
  }
}