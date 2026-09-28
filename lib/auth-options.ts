import Credentials from 'next-auth/providers/credentials';
import {PrismaAdapter} from '@auth/prisma-adapter';
import {prisma} from '@/lib/prisma';
import {verifyPassword, getUserByEmail, normalizeEmail} from '@/lib/auth';
import {z} from 'zod';
import {NextAuthOptions} from 'next-auth';

const credentialsSchema = z.object({
  email: z.string().email().transform(normalizeEmail),
  password: z.string().min(8).max(128),
});

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  session: {strategy: 'jwt'},
  pages: {
    signIn: '/login',
    newUser: '/register',
    error: '/login',
  },
  // Cookie flags are intentionally left to next-auth, which derives Secure and the
  // __Secure- name prefix from the resolved origin's scheme. Forcing them on breaks
  // plain-HTTP LAN deployments, where browsers discard the session cookie.
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: {label: 'Email', type: 'email'},
        password: {label: 'Password', type: 'password'},
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const {email, password} = parsed.data;
        const user = await getUserByEmail(email);
        if (!user || !user.password) return null;

        const valid = await verifyPassword(password, user.password);
        if (!valid) return null;

        if (
          process.env.RESEND_API_KEY &&
          process.env.RESEND_FROM_EMAIL &&
          !user.emailVerified
        ) {
          throw new Error('EmailNotVerified');
        }

        return {id: user.id, email: user.email, name: user.name};
      },
    }),
  ],
  callbacks: {
    async jwt({token, user}) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({session, token}) {
      if (token?.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};
