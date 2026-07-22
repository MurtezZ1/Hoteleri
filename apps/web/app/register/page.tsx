import Link from 'next/link';
import { RegisterForm } from '../../components/auth-forms';

export default function RegisterPage(): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-2xl rounded-md border border-slate-200 bg-white p-8 shadow-[0_18px_45px_rgba(15,31,61,0.10)]">
        <p className="text-sm font-semibold text-blue-600">Start your trial</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-navy">Create your hotel workspace</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Set up the company account first, then add properties, rooms, and staff access.</p>
        <RegisterForm />
        <p className="mt-4 text-sm text-slate-600">
          Already registered? <Link className="font-semibold text-blue-700" href="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
