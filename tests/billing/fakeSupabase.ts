/** Minimal in-memory stand-in for the Supabase JS client, supporting only
 * the exact call shapes lib/billing/webhookHandlers.ts uses. Not a general
 * Supabase mock — keep it that way; if a handler starts using a query
 * shape this doesn't support, that's a signal the handler grew beyond
 * what a unit test should drive, not a signal to make this fake bigger. */
let nextId = 1;

class FakeQuery {
  constructor(
    private rows: Record<string, unknown>[],
    private filters: Record<string, unknown> = {}
  ) {}

  select() {
    return this;
  }

  eq(col: string, val: unknown) {
    return new FakeQuery(this.rows, { ...this.filters, [col]: val });
  }

  private matching() {
    return this.rows.filter((r) => Object.entries(this.filters).every(([k, v]) => r[k] === v));
  }

  async maybeSingle() {
    const found = this.matching();
    return { data: found[0] ?? null, error: null };
  }

  async single() {
    const found = this.matching();
    if (found.length === 0) return { data: null, error: { message: "not found" } };
    return { data: found[0], error: null };
  }
}

export class FakeTable {
  rows: Record<string, unknown>[] = [];
  uniqueColumns: string[] = [];

  select() {
    return new FakeQuery(this.rows).select();
  }

  async insert(row: Record<string, unknown>) {
    for (const col of this.uniqueColumns) {
      if (row[col] != null && this.rows.some((r) => r[col] === row[col])) {
        return {
          insertBuilder: null,
          error: { code: "23505", message: `duplicate key value violates unique constraint` },
        };
      }
    }
    const withId = { id: `fake-${nextId++}`, processed: false, ...row };
    this.rows.push(withId);
    return { insertBuilder: withId, error: null };
  }

  async upsert(row: Record<string, unknown>, opts: { onConflict: string }) {
    const key = opts.onConflict;
    const idx = this.rows.findIndex((r) => r[key] === row[key]);
    if (idx >= 0) this.rows[idx] = { ...this.rows[idx], ...row };
    else this.rows.push({ id: `fake-${nextId++}`, ...row });
    return { error: null };
  }

  update(patch: Record<string, unknown>) {
    return {
      eq: async (col: string, val: unknown) => {
        for (const r of this.rows) {
          if (r[col] === val) Object.assign(r, patch);
        }
        return { error: null };
      },
    };
  }
}

/** insert() needs to work both bare-awaited (logRawFailure) and chained
 * with .select().single() (logWebhookEvent) — real Postgrest builders
 * support both. Building on a genuine Promise (rather than hand-rolling a
 * thenable) means `then`'s type matches PromiseLike exactly for free. */
function insertChain(table: FakeTable, row: Record<string, unknown>) {
  let resultPromise: ReturnType<typeof table.insert> | null = null;
  const ensure = () => {
    if (!resultPromise) resultPromise = table.insert(row);
    return resultPromise;
  };

  const awaitable = ensure().then((r) => ({ error: r.error }));
  return Object.assign(awaitable, {
    select: () => ({
      single: async () => {
        const r = await ensure();
        if (r.error) return { data: null, error: r.error };
        return { data: r.insertBuilder, error: null };
      },
    }),
  });
}

export class FakeSupabase {
  tables: Record<string, FakeTable> = {};
  auth = {
    admin: {
      getUserById: async (id: string) => ({ data: { user: { email: `${id}@example.com` } } }),
    },
  };

  constructor(uniqueColumnsByTable: Record<string, string[]> = {}) {
    for (const [table, cols] of Object.entries(uniqueColumnsByTable)) {
      this.table(table).uniqueColumns = cols;
    }
  }

  private table(name: string): FakeTable {
    if (!this.tables[name]) this.tables[name] = new FakeTable();
    return this.tables[name];
  }

  from(name: string) {
    const table = this.table(name);
    return {
      select: () => table.select(),
      insert: (row: Record<string, unknown>) => insertChain(table, row),
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => table.upsert(row, opts),
      update: (patch: Record<string, unknown>) => table.update(patch),
    };
  }
}
