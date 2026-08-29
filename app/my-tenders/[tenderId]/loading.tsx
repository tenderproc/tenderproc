// Shown instantly by Next.js while page.tsx's data fetches (tender +
// requirements + award criteria + documents + evidence mappings, several
// sequential/parallel Supabase queries) resolve. Without this, clicking a
// tender card from /my-tenders left the old list on screen for several
// seconds with no feedback at all, which read as a broken click rather than
// a slow-but-working one.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="h-4 w-28 bg-paperDim rounded" />

        <div className="mt-6 mb-8">
          <div className="h-3 w-16 bg-paperDim rounded-full mb-3" />
          <div className="h-8 w-3/4 bg-paperDim rounded" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 border-y border-line py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="h-2.5 w-14 bg-paperDim rounded mb-2" />
                <div className="h-3.5 w-20 bg-paperDim rounded" />
              </div>
            ))}
          </div>

          <div className="h-4 w-full bg-paperDim rounded mt-5" />
          <div className="h-4 w-5/6 bg-paperDim rounded mt-2" />

          <div className="h-8 w-32 bg-paperDim rounded-doc mt-6" />
        </div>

        <div className="space-y-3">
          <div className="h-5 w-40 bg-paperDim rounded" />
          <div className="grid sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border border-line rounded-doc p-3">
                <div className="h-2.5 w-20 bg-paperDim rounded mb-3" />
                <div className="h-1.5 bg-paperDim rounded-full mb-3" />
                <div className="h-3 w-full bg-paperDim rounded" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
