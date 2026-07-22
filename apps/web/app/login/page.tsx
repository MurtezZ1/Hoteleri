import Link from 'next/link';
import { LoginForm } from '../../components/auth-forms';

export default function LoginPage(): React.ReactElement {
  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-[1fr_520px]">
      <section className="hidden bg-navy px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-600 text-lg font-bold">S</span>
          <span className="text-lg font-bold">OdeoniFlow PMS</span>
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-200">Hotel operations</p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-normal">One calm workspace for every property workflow.</h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-blue-100">
            Reservations, guests, room status, payments, and booking channels stay connected from check-in to reporting.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {['81% occupancy', '$18.4k revenue', '24 active stays'].map((item) => (
            <div key={item} className="rounded-md bg-white/10 p-3 font-semibold">
              {item}
            </div>
          ))}
        </div>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-md border border-slate-200 bg-white p-8 shadow-[0_18px_45px_rgba(15,31,61,0.10)]">
          <p className="text-sm font-semibold text-blue-600">Welcome back</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-navy">Sign in to OdeoniFlow PMS</h1>
          <LoginForm />
          <div className="mt-4 flex justify-between text-sm font-medium text-slate-600">
          <Link className="text-blue-700" href="/forgot-password">Forgot password</Link>
          <Link className="text-blue-700" href="/register">Create account</Link>
        </div>
        </div>
      </section>
    </main>
  );
}
