import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PwaExperience } from "@/components/PwaExperience";

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content', themeColor: '#F8F6F3' };

export const metadata: Metadata = {
  title: "RUSH by OCN — Your people. Your conversations. One place.",
  description:
    "RUSH is a fast, alive, social communication app: direct chats, groups, and spaces with channels. By OCN.",
  applicationName: 'RUSH',
  appleWebApp: { capable: true, title: 'RUSH', statusBarStyle: 'black-translucent' },
  icons: {
    icon: '/icons/rush-192.png',
    apple: '/apple-touch-icon.png',
  },
};

// Pre-paint theme bootstrap: reads localStorage `rush-theme` and sets
// <html data-theme> + a matching background BEFORE first paint, so a saved
// dark theme never flashes Ember. Falls back to Ember on any failure.
// Also sets color-scheme so scrollbars/form controls match immediately.
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("rush-theme");if(t!=="dark-glass"&&t!=="glass"&&t!=="carbon-green"&&t!=="carbon-pink"&&t!=="dark-samurai"){t="ember"}var h=document.documentElement;h.dataset.theme=t;var dark=t!=="ember"&&t!=="glass";h.style.colorScheme=(dark?"dark":"light");h.style.backgroundColor=(t==="ember"?"#F8F6F3":t==="glass"?"#e9efff":t==="dark-glass"?"#080e1c":t==="dark-samurai"?"#101114":t==="carbon-pink"?"#1B131B":"#101916")}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="ember" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="font-sans">
        <ThemeProvider>{children}<PwaExperience /></ThemeProvider>
      </body>
    </html>
  );
}
