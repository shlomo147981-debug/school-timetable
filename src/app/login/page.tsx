import LoginForm from './LoginForm';

export default function LoginPage() {
  return (
    <main className="safe-top flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-slate-50 p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-2xl text-white">
            📅
          </div>
          <h1 className="text-xl font-bold">מערכת שעות</h1>
          <p className="mt-1 text-sm text-slate-500">התחברו עם מזהה המשתמש והסיסמה שקיבלתם מבית הספר</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
