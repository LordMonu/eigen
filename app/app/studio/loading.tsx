// app/app/studio/loading.tsx — shimmer mirrors the Studio home layout
// (hero pill + h1 + brief-form card + recent list). Lazy server fetches and
// the cold path between auth + initial blueprint query are the typical waits.

export default function Loading() {
  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto space-y-10">
      {/* HERO — pill + h1 + subtitle */}
      <div className="space-y-3">
        <div className="h-6 w-36 rounded-full bg-neutral-900 animate-pulse" />
        <div className="h-9 w-3/4 rounded bg-neutral-900 animate-pulse" />
        <div className="space-y-2">
          <div className="h-3 w-full max-w-2xl rounded bg-neutral-900 animate-pulse" />
          <div className="h-3 w-2/3 rounded bg-neutral-900 animate-pulse" />
        </div>
      </div>

      {/* BRIEF FORM card */}
      <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5 space-y-4">
        <div className="h-24 rounded-lg bg-neutral-950 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-9 rounded-md bg-neutral-950 animate-pulse"
            />
          ))}
        </div>
        <div className="flex justify-end">
          <div className="h-9 w-32 rounded-full bg-neutral-950 animate-pulse" />
        </div>
      </div>

      {/* RECENT — borderless list rows */}
      <section className="space-y-3">
        <div className="h-4 w-28 rounded bg-neutral-900 animate-pulse" />
        <ul className="divide-y divide-neutral-900">
          {[0, 1, 2, 3].map((i) => (
            <li
              key={i}
              className="flex items-center gap-4 py-3 -mx-3 px-3"
            >
              <div className="size-9 rounded-lg bg-neutral-900 animate-pulse" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="h-3 w-3/4 rounded bg-neutral-900 animate-pulse" />
                <div className="h-3 w-32 rounded bg-neutral-900 animate-pulse" />
              </div>
              <div className="h-3 w-8 rounded bg-neutral-900 animate-pulse" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
