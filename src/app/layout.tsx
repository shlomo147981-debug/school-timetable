import type { Metadata, Viewport } from 'next';
import MobileBridge from '@/components/MobileBridge';
import './globals.css';

export const metadata: Metadata = {
  title: 'הצלצול',
  description: 'מערכת שעות וניהול כיתה',
  applicationName: 'הצלצול',
};

// מובייל: viewport-fit=cover מאפשר שימוש ב-safe-area (נוטש / שורת סטטוס),
// maximumScale מונע זום אוטומטי מציק בעת פוקוס על שדות קלט בתוך ה-WebView.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#2459c9',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700&display=swap"
        />
      </head>
      <body className="min-h-screen font-sans">
        <MobileBridge />
        {children}
      </body>
    </html>
  );
}
