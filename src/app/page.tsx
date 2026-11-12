'use client';

// אפליקציה בעמוד יחיד (SPA): כל המסכים תחת "/" עם ניווט בפרמטרים (?page=requests&view=month).
// כך הייצוא הסטטי עובד גם ב-Capacitor, שמחזיר index.html לכל נתיב ללא סיומת.
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import LoginScreen from '@/components/screens/LoginScreen';
import AppShell from '@/components/screens/AppShell';
import ScheduleScreen from '@/components/screens/ScheduleScreen';
import RequestsScreen from '@/components/screens/RequestsScreen';
import AdminScreen from '@/components/screens/AdminScreen';
import OtaGate from '@/components/OtaGate';

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-brand-600 text-3xl text-white">📅</div>
    </div>
  );
}

function AppRoot() {
  const { auth } = useAuth();
  const params = useSearchParams();
  if (auth.status === 'loading') return <Splash />;
  if (auth.status === 'signed_out') return <LoginScreen initialError={auth.error} />;

  const p = params.get('page');
  const page = p === 'requests' ? 'requests' : p === 'admin' && auth.profile.is_admin ? 'admin' : 'schedule';
  return (
    <AppShell profile={auth.profile} page={page}>
      {page === 'requests' ? <RequestsScreen profile={auth.profile} />
        : page === 'admin' ? <AdminScreen me={auth.profile} />
        : <ScheduleScreen key={auth.profile.id} profile={auth.profile} />}
    </AppShell>
  );
}

export default function Page() {
  return (
    <OtaGate>
      <AuthProvider>
        <Suspense fallback={<Splash />}>
          <AppRoot />
        </Suspense>
      </AuthProvider>
    </OtaGate>
  );
}
