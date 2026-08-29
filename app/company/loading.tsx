// Shown while the company/profile row and (once a company exists) its
// services/certifications/references/documents resolve.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="h-3 w-24 bg-paperDim rounded mb-3" />
          <div className="h-8 w-40 bg-paperDim rounded" />
          <div className="h-4 w-96 max-w-full bg-paperDim rounded mt-3" />
        </div>

        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border border-line rounded-2xl p-5">
              <div className="h-3 w-32 bg-paperDim rounded mb-4" />
              <div className="h-9 w-full bg-paperDim rounded-doc" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
