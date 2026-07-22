import { OnboardingForm } from '../../components/auth-forms';

export default function OnboardingPage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <section className="mx-auto max-w-5xl rounded-md border border-slate-200 bg-white p-8 shadow-[0_18px_45px_rgba(15,31,61,0.10)]">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Company setup</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-navy">Add your first property</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          These settings drive reservations, invoices, booking pages, taxes, and operational reporting.
        </p>
        <OnboardingForm />
      </section>
    </main>
  );
}
