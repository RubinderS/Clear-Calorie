import type {Metadata} from 'next';
import {Geist, Geist_Mono} from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import {ThemeProvider} from '@/components/theme-provider';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'ClearCalorie — Calorie & Health Tracking',
  description: 'Track calories, exercise, weight, and health goals.',
};

// Runs before hydration so the correct theme applies without a flash.
const themeInitScript = `(function(){try{var t=localStorage.getItem('clearcalorie-theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({children}: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{__html: themeInitScript}}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
