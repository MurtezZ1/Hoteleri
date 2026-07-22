import Link from 'next/link';

const highlights = [
  'Multi-property operations',
  'Reservations, guests, rooms, and billing',
  'Subscription-aware access controls',
];

export default function PublicHomePage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-slate-50">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-12">
        <nav className="mb-14 flex items-center justify-between">
          <Link className="flex items-center gap-3" href="/">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-lg font-bold text-white">
              O
            </span>
            <span className="text-lg font-bold text-navy">OdeoniFlow PMS</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              className="rounded-md px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-white"
              href="/login"
            >
              Login
            </Link>
            <Link
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              href="/register"
            >
              Start
            </Link>
          </div>
        </nav>

        <div className="grid items-center gap-10 lg:grid-cols-[1fr_440px]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
              Hotel SaaS command center
            </p>
            <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-normal text-navy sm:text-6xl">
              Run properties, guests, reservations, and subscriptions from one
              workspace.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              OdeoniFlow keeps daily hotel operations focused while enforcing
              plan access and tenant boundaries in the background.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                className="rounded-md bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                href="/register"
              >
                Create workspace
              </Link>
              <Link
                className="rounded-md border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                href="/login"
              >
                Open dashboard
              </Link>
            </div>
          </div>

          <aside className="rounded-md border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,31,61,0.08)]">
            <h2 className="text-lg font-semibold text-navy">
              Built for production access
            </h2>
            <div className="mt-5 space-y-3">
              {highlights.map((item) => (
                <div
                  className="rounded-md border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700"
                  key={item}
                >
                  {item}
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm leading-6 text-slate-500">
              Private app pages require login. New workspaces choose a plan or
              continue in preview mode before mutating business data.
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}
