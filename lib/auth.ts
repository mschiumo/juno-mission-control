import { auth as nextAuthAuth } from "@/lib/auth-config";
import { Session } from "next-auth";

// Re-export the auth function
export const auth = nextAuthAuth;

// Type augmentation for next-auth
export interface ExtendedSession extends Session {
  accessToken?: string;
  refreshToken?: string;
  provider?: string;
}

// Helper to check if user is authenticated
export async function requireAuth(): Promise<ExtendedSession> {
  const session = await auth();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session as ExtendedSession;
}

// Helper to get access token for Google API calls
export async function getGoogleAccessToken(): Promise<string | undefined> {
  const session = await auth();
  return (session as ExtendedSession)?.accessToken;
}
