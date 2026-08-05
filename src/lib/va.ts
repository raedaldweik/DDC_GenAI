// Parsing of the postMessage payload that SAS Visual Analytics sends to a
// Data-Driven Content object. The shape is:
//   { resultName, rowCount, availableRowCount,
//     data: [[v1, v2, ...], ...],
//     columns: [{ name, label, type, ... }, ...] }
// Columns arrive in the order the roles are assigned in the report, and rows
// are pre-filtered by whatever filters/prompts are active on the page.

export interface VAColumn {
  name?: string
  label: string
  type?: string
}

export interface VAData {
  resultName?: string
  columns: VAColumn[]
  rows: unknown[][]
}

export const parseVAMessage = (msg: unknown): VAData | null => {
  if (!msg || typeof msg !== 'object') return null
  const { resultName, data, columns } = msg as {
    resultName?: string
    data?: unknown
    columns?: unknown
  }
  if (!Array.isArray(data) || !Array.isArray(columns)) return null
  const parsedColumns: VAColumn[] = columns
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      name: typeof c.name === 'string' ? c.name : undefined,
      label: typeof c.label === 'string' ? c.label : String(c.name ?? ''),
      type: typeof c.type === 'string' ? c.type : undefined,
    }))
  const rows = data.filter((r): r is unknown[] => Array.isArray(r))
  return { resultName, columns: parsedColumns, rows }
}

// Rows as objects keyed by column label, which is what the prompt builder
// works with — labels are what the report author sees in the Roles panel.
export const rowsAsObjects = (d: VAData): Record<string, unknown>[] =>
  d.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    d.columns.forEach((col, i) => {
      obj[col.label || `column_${i + 1}`] = row[i]
    })
    return obj
  })

export const formatValue = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '-'
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  }
  return String(v).trim()
}
