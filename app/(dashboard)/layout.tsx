import Link from 'next/link';
import {getServerSession} from 'next-auth/next';
import {redirect} from 'next/navigation';
import {authOptions} from '@/lib/auth-options';
import {Button} from '@/components/ui/button';
import {MobileNav} from '@/components/mobile-nav';
import {DesktopNav} from '@/components/desktop-nav';

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
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-lg font-bold tracking-tight"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm">
              C
            </span>
            ClearCalorie
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <DesktopNav items={navItems} />
            <form action="/api/auth/signout" method="POST" className="ml-2">
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </nav>
          <MobileNav items={navItems} />
        </div>
      </header>
      <main className="flex-1 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
