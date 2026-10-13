// A tiny in-memory stand-in for the Supabase admin client: eq/in/lte filters over fixed rows. Tests only.
type Row = Record<string, unknown>

export function fakeAdmin(tables: Record<string, Row[]>, rpc: Record<string, unknown[]> = {}) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = []
  function builder(table: string) {
    const filters: Array<[string, unknown]> = []
    const inFilters: Array<[string, unknown[]]> = []
    const lteFilters: Array<[string, number]> = []
    calls.push({ table, filters })
    const rows = () => (tables[table] ?? []).filter((row) =>
      filters.every(([key, value]) => row[key] === value)
      && inFilters.every(([key, values]) => values.includes(row[key]))
      && lteFilters.every(([key, max]) => Number(row[key]) <= max))
    const self: Record<string, unknown> = {
      select: () => self, order: () => self, limit: () => self,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return self },
      in: (key: string, values: unknown[]) => { inFilters.push([key, values]); return self },
      lte: (key: string, max: number) => { lteFilters.push([key, max]); return self },
      single: async () => {
        const found = rows()
        return found.length === 1 ? { data: found[0], error: null } : { data: null, error: { message: `expected one ${table} row` } }
      },
      maybeSingle: async () => {
        const found = rows()
        return found.length > 1 ? { data: null, error: { message: 'many' } } : { data: found[0] ?? null, error: null }
      },
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    }
    return self
  }
  return {
    calls,
    from: (table: string) => builder(table),
    rpc: async (name: string) => ({ data: rpc[name] ?? [], error: null }),
  } as unknown as Parameters<typeof import('./piece-client').resolvePieceClient>[0] & { calls: typeof calls }
}
