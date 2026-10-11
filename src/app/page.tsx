export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-background">
      <div className="max-w-xl w-full p-8 rounded-lg border border-surface-border bg-surface-light text-center shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-institutional-charcoal mb-3">
          NMIT HackLeague
        </h1>
        <p className="text-sm text-foreground/80 leading-relaxed mb-6">
          Institutional Hackathon Management & Team Portal. Baseline foundation successfully established for Phase 1.
        </p>
        <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-institutional-green text-institutional-charcoal border border-surface-border">
          Phase 1 Baseline Active
        </div>
      </div>
    </main>
  );
}
