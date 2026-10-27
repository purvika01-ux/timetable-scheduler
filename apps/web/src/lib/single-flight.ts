// Overlapping calls share one run. Used for the session refresh: the refresh token rotates on every
// use, so two refreshes in parallel would look like token reuse and end the whole session.

export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | null = null;
  return () => {
    if (!running) {
      running = fn().finally(() => {
        running = null;
      });
    }
    return running;
  };
}
