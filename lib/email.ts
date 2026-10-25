import {Resend} from 'resend';
import {nanoid} from 'nanoid';
import {markEmailVerified} from './data/users';
import * as tokens from './data/verification-tokens';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function createVerificationToken(email: string) {
  const token = nanoid(32);
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 hours

  await tokens.createVerificationToken({identifier: email, token, expires});

  return token;
}

export async function sendVerificationEmail(
  email: string,
  token: string,
  origin: string,
) {
  if (!resend) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error('RESEND_FROM_EMAIL is not configured');
  }

  const baseUrl = process.env.NEXTAUTH_URL || origin;
  const url = `${baseUrl}/verify-email?token=${token}`;

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: 'Verify your Clear Calorie account',
    html: `
      <p>Click the link below to verify your email address:</p>
      <p><a href="${url}">${url}</a></p>
      <p>This link expires in 24 hours.</p>
    `,
  });
}

export async function verifyEmail(token: string) {
  const verification = await tokens.findVerificationToken(token);

  if (!verification || verification.expires < new Date()) {
    return {success: false, error: 'Invalid or expired token'};
  }

  // Verify first: a crash in between leaves only a stale token, which expires.
  await markEmailVerified(verification.identifier);
  await tokens.deleteVerificationToken(token);

  return {success: true};
}
