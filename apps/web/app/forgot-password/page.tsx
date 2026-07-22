import { ForgotPasswordForm } from '../../components/auth-forms';

export default function ForgotPasswordPage(): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-8 shadow-[0_18px_45px_rgba(15,31,61,0.10)]">
        <p className="text-sm font-semibold text-blue-600">Account recovery</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal text-navy">Reset password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Enter the email connected to your OdeoniFlow workspace.</p>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
