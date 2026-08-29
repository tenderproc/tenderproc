// Shown while the subscription row and (for Free-tier users) the token
// balance resolve.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <main className="max-w-2xl mx-auto px-6 py-16">
        <div className="h-8 w-32 bg-paperDim rounded" />

        <div className="mt-6 border border-line rounded-doc p-6">
          <div className="h-3 w-24 bg-paperDim rounded mb-3" />
          <div className="h-7 w-28 bg-paperDim rounded mb-4" />
          <div className="h-9 w-36 bg-paperDim rounded-doc" />
        </div>

        <div className="mt-6 border border-line rounded-doc p-6">
          <div className="h-3 w-24 bg-paperDim rounded mb-3" />
          <div className="h-7 w-40 bg-paperDim rounded" />
        </div>
      </main>
    </div>
  );
}
