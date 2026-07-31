import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-sky-50 to-white">
      <header className="border-b border-sky-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight text-sky-900">
            Apna Intern
          </span>
          <nav className="flex gap-6 text-sm font-medium text-sky-800">
            <Link href="#programs" className="hover:text-sky-600">
              Programs
            </Link>
            <Link href="#apply" className="hover:text-sky-600">
              Apply
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 px-6 py-20">
        <section className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-sky-600">
            Internship opportunities
          </p>
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Launch your career with hands-on experience
          </h1>
          <p className="max-w-xl text-lg leading-8 text-slate-600">
            Apna Intern connects students and early-career talent with
            mentorship, real projects, and pathways into tech. Browse programs
            and submit your application today.
          </p>
        </section>

        <section className="flex flex-wrap gap-4" id="apply">
          <Link
            href="#programs"
            className="rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
          >
            View open programs
          </Link>
          <a
            href="/api/health"
            className="rounded-full border border-sky-200 bg-white px-6 py-3 text-sm font-semibold text-sky-800 transition hover:border-sky-300"
          >
            API health check
          </a>
        </section>

        <section
          className="grid gap-4 sm:grid-cols-3"
          id="programs"
          aria-label="Internship programs"
        >
          {[
            {
              title: "Software Engineering",
              description: "Build features with modern web stacks.",
            },
            {
              title: "Product & Design",
              description: "Ship user-centered products end to end.",
            },
            {
              title: "Data & AI",
              description: "Work with data pipelines and ML workflows.",
            },
          ].map((program) => (
            <article
              key={program.title}
              className="rounded-2xl border border-sky-100 bg-white p-6 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-slate-900">
                {program.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {program.description}
              </p>
            </article>
          ))}
        </section>
      </main>

      <footer className="border-t border-sky-100 py-6 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} Apna Intern. All rights reserved.
      </footer>
    </div>
  );
}
