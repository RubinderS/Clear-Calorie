import {Resend} from 'resend';
import {nanoid} from 'nanoid';
import {prisma} from './prisma';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function createVerificationToken(email: string) {
  const token = nanoid(32);
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 hours

  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires,
    },
  });

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
    subject: 'Verify your ClearCalorie account',
    html: `
      <p>Click the link below to verify your email address:</p>
      <p><a href="${url}">${url}</a></p>
      <p>This link expires in 24 hours.</p>
    `,
  });
}

export async function verifyEmail(token: string) {
  const verification = await prisma.verificationToken.findUnique({
    where: {token},
  });

  if (!verification || verification.expires < new Date()) {
    return {success: false, error: 'Invalid or expired token'};
  }

  await prisma.$transaction([
    prisma.user.update({
      where: {email: verification.identifier},
      data: {emailVerified: new Date()},
    }),
    prisma.verificationToken.delete({
      where: {token},
    }),
  ]);

  return {success: true};
}
