// Stands in for Next's `server-only` marker under Vitest, which cannot resolve it. The marker
// exists to fail the BUILD if a server module reaches a client bundle, and that check still runs
// in `next build`; nothing about it needs to execute in a unit test.
export {}
