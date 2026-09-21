import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

const PILLARS = [
  {
    title: "Chats",
    body: "Private one-to-one conversations that open in a tap and stay in sync in real time.",
  },
  {
    title: "Groups",
    body: "Small private circles for friends, family, and crews — create, invite, talk.",
  },
  {
    title: "Spaces",
    body: "Larger communities with organized channels, roles, and invite links.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper text-ink-900">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2">
        Skip to content
      </a>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <BrandMark />
        <nav aria-label="Primary" className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-100"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-xl bg-rush-600 px-4 py-2 text-sm font-semibold text-white shadow-rush-pop hover:bg-rush-700"
          >
            Get RUSH
          </Link>
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-6">
        <section className="grid gap-10 pb-16 pt-10 md:grid-cols-[1.1fr_0.9fr] md:pt-16">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-widest text-ink-500">
              <span className="inline-block h-2 w-2 rounded-full bg-green-600" aria-hidden="true" />
              Live now · RUSH by OCN
            </p>
            <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              Your people.
              <br />
              Your conversations.
              <br />
              <span className="text-rush-600">One place.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-ink-500">
              RUSH blends fast personal messaging with organized community
              spaces — chats, groups, and channels in a single energetic app.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="rounded-2xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white hover:bg-ink-800"
              >
                Start chatting — it&apos;s free
              </Link>
              <Link
                href="/app"
                className="rounded-2xl border border-ink-200 bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:border-ink-300"
              >
                Open the app
              </Link>
            </div>
            <p className="mt-4 text-xs text-ink-400">
              No credit card. Just pick a username and rush in.
            </p>
          </div>

          {/* Product vignette: mini Signal-Flow preview (static, decorative) */}
          <div
            className="overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-card"
            aria-hidden="true"
          >
            <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-rush-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-ink-200" />
              <span className="ml-2 text-xs font-semibold text-ink-400">rush — design crew</span>
            </div>
            <div className="space-y-3 p-4">
              <div className="max-w-[75%] rounded-2xl rounded-tl-md border border-ink-100 bg-paper px-3 py-2 text-sm">
                Mockups are in — the ember theme is 🔥… kidding, no emoji nav here.
              </div>
              <div className="ml-auto max-w-[70%] rounded-2xl rounded-tr-md bg-rush-600 px-3 py-2 text-sm text-white">
                Shipping the Signal Flow layout tonight. 160ms message-in, zero jank.
              </div>
              <div className="max-w-[65%] rounded-2xl rounded-tl-md border border-ink-100 bg-paper px-3 py-2 text-sm">
                Presence dots are live. The app finally feels alive.
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-ink-200 bg-white px-3 py-2">
                <span className="text-sm text-ink-400">Message design crew…</span>
                <span className="ml-auto rounded-xl bg-ink-900 px-3 py-1 text-xs font-semibold text-white">
                  Send
                </span>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="What RUSH includes" className="grid gap-4 pb-16 md:grid-cols-3">
          {PILLARS.map((p) => (
            <article key={p.title} className="rounded-3xl border border-ink-200 bg-white p-6 shadow-card">
              <h2 className="font-display text-xl font-semibold">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">{p.body}</p>
            </article>
          ))}
        </section>

        <section className="mb-16 rounded-3xl bg-ink-900 p-8 text-white md:p-12">
          <h2 className="font-display text-3xl font-bold tracking-tight">
            Fast. Alive. Social. <span className="text-rush-400">Unmistakably RUSH.</span>
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-200">
            Real-time messages, honest presence, and communities with real
            structure — not a clone of anything. Built on Firebase with
            security rules that keep private conversations private.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-2xl bg-rush-500 px-6 py-3 text-sm font-semibold text-white hover:bg-rush-400"
          >
            Claim your username
          </Link>
        </section>
      </main>

      <footer className="border-t border-ink-100 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 text-xs text-ink-400">
          <span className="font-display font-semibold text-ink-700">RUSH <span className="font-sans font-normal text-ink-400">by OCN</span></span>
          <span>Your people. Your conversations. One place.</span>
        </div>
      </footer>
    </div>
  );
}
