import { Resend } from 'resend';
import React from 'react';

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const FROM_ADDRESS = process.env.EMAIL_FROM || 'Confluence Trading <alerts@confluencetrading.app>';

export async function sendEmail({
  to,
  subject,
  react,
}: {
  to: string;
  subject: string;
  react: React.ReactElement;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.log('[Email] RESEND_API_KEY not configured, skipping');
    return { success: false, error: 'Resend not configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      react,
    });
    if (error) {
      console.error('[Email] Resend error:', error);
      return { success: false, error: error.message };
    }
    console.log(`[Email] Sent to ${to}: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[Email] Failed:', err);
    return { success: false, error: String(err) };
  }
}
