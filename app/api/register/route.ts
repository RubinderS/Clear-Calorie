import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createUser} from '@/lib/auth';
import {rateLimitByIp} from '@/lib/rate-limit';
import {createVerificationToken, sendVerificationEmail} from '@/lib/email';

const registerSchema = z
  .object({
    email: z.string().email().toLowerCase().trim(),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
    name: z.string().trim().max(100).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

const PASSWORD_REQUIREMENTS =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).+$/;

export async function POST(request: Request) {
  let rateLimitHeaders: Record<string, string> = {};

  try {
    const rateLimit = await rateLimitByIp(request);
    rateLimitHeaders = rateLimit.headers;
    const {success} = rateLimit;

    if (!success) {
      return NextResponse.json(
        {error: 'Too many attempts. Please try again later.'},
        {status: 429, headers: rateLimitHeaders},
      );
    }

    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      const mismatch = parsed.error.issues.some(
        (issue) =>
          issue.code === 'custom' && issue.path.includes('confirmPassword'),
      );

      return NextResponse.json(
        {
          error: mismatch
            ? 'Passwords do not match.'
            : 'Invalid input. Please check your email and password.',
        },
        {status: 400, headers: rateLimitHeaders},
      );
    }

    const {email, password, name} = parsed.data;

    if (!PASSWORD_REQUIREMENTS.test(password)) {
      return NextResponse.json(
        {
          error:
            'Password must include uppercase, lowercase, number, and special character.',
        },
        {status: 400, headers: rateLimitHeaders},
      );
    }

    await createUser(email, password, name);

    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      const token = await createVerificationToken(email);
      await sendVerificationEmail(email, token, new URL(request.url).origin);
    }

    return NextResponse.json(
      {
        success: true,
        message:
          'Account created. Please check your email to verify your account.',
      },
      {status: 201, headers: rateLimitHeaders},
    );
  } catch (error) {
    const isUserExistsError =
      error instanceof Error && error.message === 'User already exists';

    if (isUserExistsError) {
      return NextResponse.json(
        {error: 'An account with this email already exists.'},
        {status: 409, headers: rateLimitHeaders},
      );
    }

    console.error('Registration error:', error);

    return NextResponse.json(
      {error: 'Something went wrong. Please try again later.'},
      {status: 500, headers: rateLimitHeaders},
    );
  }
}
