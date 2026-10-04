import Link from 'next/link';
import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {authOptions} from '@/lib/auth-options';
import {BRAND_GRADIENT, LogoGlyph} from '@/lib/app-icon';
import {MobileNav} from '@/components/mobile-nav';
import {DesktopNav} from '@/components/desktop-nav';
import {ThemeToggle} from '@/components/theme-toggle';
import {SignOutButton} from '@/components/sign-out-button';
import {TimezoneSync} from '@/components/timezone-sync';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  const navItems = [
    {href: '/dashboard', label: 'Dashboard'},
    {href: '/food', label: 'Food'},
    {href: '/exercise', label: 'Exercise'},
    {href: '/weight', label: 'Weight'},
    {href: '/goals', label: 'Goals'},
  ];

  return (
    <div className="flex min-h-full flex-col">
      <TimezoneSync />
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-lg font-bold tracking-tight"
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg shadow-sm"
              style={{background: BRAND_GRADIENT}}
            >
              <LogoGlyph size={20} />
            </span>
            Clear Calorie
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <DesktopNav items={navItems} />
            <SignOutButton className="ml-2" />
          </nav>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <MobileNav items={navItems} />
          </div>
        </div>
      </header>
      <main className="flex-1 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
