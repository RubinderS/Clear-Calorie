import type {Metadata} from 'next';
import {Geist, Geist_Mono} from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import {ThemeProvider} from '@/components/theme-provider';
import {THEME_COLORS} from '@/lib/theme-colors';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Clear Calorie — Calorie & Health Tracking',
  description: 'Track calories, exercise, weight, and health goals.',
  appleWebApp: {capable: true, title: 'Clear Calorie', statusBarStyle: 'default'},
};

// Runs before hydration so the correct theme (and status bar color) applies without a flash.
const themeInitScript = `(function(){try{var t=localStorage.getItem('clearcalorie-theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);var m=document.createElement('meta');m.name='theme-color';m.content=d?'${THEME_COLORS.dark}':'${THEME_COLORS.light}';document.head.appendChild(m);var s=document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');if(s)s.content=d?'black-translucent':'default';}catch(e){}})();`;

// Mobile browsers restore the pre-refresh offset under the sticky header; start reloads at the top but keep back/forward restoration.
const reloadScrollResetScript = `(function(){try{var n=performance.getEntriesByType('navigation')[0];if(!n||n.type!=='reload'||!('scrollRestoration' in history))return;history.scrollRestoration='manual';window.addEventListener('load',function(){setTimeout(function(){window.scrollTo(0,0);history.scrollRestoration='auto';},0);});}catch(e){}})();`;

// iOS hides the keyboard when the app is backgrounded but keeps the input focused, leaving an orphaned accessory bar on return; blur so focus state matches.
const blurOnHideScript = `(function(){document.addEventListener('visibilitychange',function(){if(document.visibilityState!=='hidden')return;var a=document.activeElement;if(a&&a!==document.body&&typeof a.blur==='function')a.blur();});})();`;

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
        <Script
          id="reload-scroll-reset"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{__html: reloadScrollResetScript}}
        />
        <Script
          id="blur-on-hide"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{__html: blurOnHideScript}}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
