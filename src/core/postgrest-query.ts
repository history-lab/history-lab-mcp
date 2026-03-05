/**
 * Internal PostgREST query builder with built-in gotcha protection.
 * Not exported from the public API.
 */
export class PostgRestQuery {
  private params: URLSearchParams = new URLSearchParams()
  private _headers: Record<string, string> = {
    'Accept': 'application/json',
  }

  constructor(
    private baseUrl: string,
    private endpoint: string,
  ) {}

  // === Filters ===

  eq(col: string, value: string | number): this {
    this.params.append(col, `eq.${value}`)
    return this
  }

  neq(col: string, value: string | number): this {
    this.params.append(col, `neq.${value}`)
    return this
  }

  gt(col: string, value: string | number): this {
    this.params.append(col, `gt.${value}`)
    return this
  }

  gte(col: string, value: string | number): this {
    this.params.append(col, `gte.${value}`)
    return this
  }

  lt(col: string, value: string | number): this {
    this.params.append(col, `lt.${value}`)
    return this
  }

  lte(col: string, value: string | number): this {
    this.params.append(col, `lte.${value}`)
    return this
  }

  ilike(col: string, pattern: string): this {
    // Wrap in wildcards if not already present
    const p = pattern.includes('*') ? pattern : `*${pattern}*`
    this.params.append(col, `ilike.${p}`)
    return this
  }

  inList(col: string, values: (string | number)[]): this {
    this.params.append(col, `in.(${values.join(',')})`)
    return this
  }

  isNull(col: string): this {
    this.params.append(col, 'is.null')
    return this
  }

  // === Full-Text Search ===

  fts(col: string, query: string, mode: 'plfts' | 'phfts' | 'wfts' | 'fts' = 'plfts'): this {
    // Replace spaces with + for PostgREST FTS
    const encoded = query.replace(/\s+/g, '+')
    this.params.append(col, `${mode}.${encoded}`)
    return this
  }

  // === Logical Operators ===

  or(conditions: string[]): this {
    this.params.append('or', `(${conditions.join(',')})`)
    return this
  }

  and(conditions: string[]): this {
    this.params.append('and', `(${conditions.join(',')})`)
    return this
  }

  // === Select ===

  select(fields: string[]): this {
    // Always exclude full_text tsvector — returns raw tokens, not useful
    const clean = fields.filter(f => f !== 'full_text')
    this.params.set('select', clean.join(','))
    return this
  }

  // === Ordering ===

  order(col: string, dir: 'asc' | 'desc' = 'desc'): this {
    if (col === 'authored') {
      // GOTCHA: authored ordering MUST have null modifiers or it timeouts
      const nullMod = dir === 'desc' ? 'nullslast' : 'nullsfirst'
      this.params.set('order', `${col}.${dir}.${nullMod}`)
    } else {
      this.params.set('order', `${col}.${dir}`)
    }
    return this
  }

  // === Pagination ===

  limit(n: number): this {
    this.params.set('limit', String(n))
    return this
  }

  offset(n: number): this {
    if (n > 0) {
      this.params.set('offset', String(n))
    }
    return this
  }

  // === Count ===

  withCount(): this {
    this._headers['Prefer'] = 'count=exact'
    this._headers['Range-Unit'] = 'items'
    return this
  }

  range(from: number, to: number): this {
    this._headers['Range'] = `${from}-${to}`
    return this
  }

  // === Build ===

  build(): string {
    const qs = this.params.toString()
    return qs ? `${this.baseUrl}${this.endpoint}?${qs}` : `${this.baseUrl}${this.endpoint}`
  }

  get headers(): Record<string, string> {
    return { ...this._headers }
  }
}
