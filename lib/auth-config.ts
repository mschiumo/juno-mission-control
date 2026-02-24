import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { getRedisClient } from "@/lib/redis";
import type { NextAuthConfig } from "next-auth";

// User storage keys
const USER_BY_EMAIL_KEY = (email: string) => `users:by-email:${email.toLowerCase().trim()}`;
const USER_BY_ID_KEY = (userId: string) => `users:${userId}`;

// Get user by email from Redis
async function getUserByEmail(email: string) {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(USER_BY_EMAIL_KEY(email));
    if (data) {
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error("Error getting user by email:", error);
    return null;
  }
}

// Verify password
async function verifyPassword(password: string, hashedPassword: string) {
  return bcrypt.compare(password, hashedPassword);
}

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/calendar.readonly",
          ].join(" "),
        },
      },
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        // Get user from Redis
        const user = await getUserByEmail(email);

        if (!user || !user.hashedPassword) {
          return null;
        }

        // Verify password
        const isValid = await verifyPassword(password, user.hashedPassword);

        if (!isValid) {
          return null;
        }

        // Return user object (without password)
        return {
          id: user.userId,
          email: user.email,
          name: user.name || null,
          image: null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile, user }) {
      // Persist the OAuth access_token and refresh_token to the token right after signin
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.provider = account.provider;
      }
      // Add user id to token for credentials provider
      if (user) {
        token.sub = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      // Send properties to the client
      session.accessToken = token.accessToken;
      session.refreshToken = token.refreshToken;
      session.provider = token.provider;
      if (token.sub) {
        session.user = {
          ...session.user,
          id: token.sub,
          email: token.email,
        };
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
    newUser: "/signup",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
