// Shown while the tender lookup and (for logged-in users) the AI match
// score resolve — this page is public and shareable, so it's the highest-
// traffic page that calls into the AI scoring path (see lib/scoring.ts).
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="h-4 w-32 bg-paperDim rounded" />

        <div className="mt-6 mb-8 border border-line rounded-2xl p-6">
          <div className="h-3 w-24 bg-paperDim rounded mb-2" />
          <div className="h-8 w-3/4 bg-paperDim rounded mb-6" />

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <div className="h-2.5 w-16 bg-paperDim rounded mb-2" />
                <div className="h-3.5 w-20 bg-paperDim rounded" />
              </div>
            ))}
          </div>
        </div>

        <div className="h-24 w-full bg-paperDim rounded-doc" />
      </main>
    </div>
  );
}
