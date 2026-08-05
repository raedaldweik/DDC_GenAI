import { VAData, formatValue, rowsAsObjects } from './va'

export type Lang = 'ar' | 'en'

export interface BuiltPrompt {
  system: string
  user: string
}

const SYSTEM_PROMPT = [
  'You are an analytical assistant embedded inside a Dubai Police driver-risk dashboard built on SAS Visual Analytics.',
  'On every request you receive the exact data currently displayed in the report (already filtered by the user).',
  'Write a concise, professional analysis grounded STRICTLY in the provided data — never invent, estimate, or assume values that are not present.',
  'Output format, exactly two sections and nothing else:',
  "1) A heading line 'الملخص:' (Arabic) or 'Summary:' (English), followed by one paragraph of 2-4 sentences.",
  "2) A heading line 'التوصيات:' (Arabic) or 'Recommendations:' (English), followed by 3-4 short, actionable bullet points, each starting with '- '.",
  'Recommendations must be practical actions for traffic-safety officers (e.g. awareness course, license review, monitoring, follow-up on expired vehicles), proportional to the actual risk level in the data — do not dramatize low-risk profiles.',
  'Wrap the most important numbers and terms in **double asterisks**.',
  'No preamble, no closing remarks, no extra sections.',
].join(' ')

// Column-label heuristics. The app is role-agnostic: the report author can
// assign any columns to the DDC object and the prompt still builds itself.
// These patterns only decide which column is used for grouping/aggregation.
const NAME_RE = /^الاسم$|name/i
const CATEGORY_RE = /درجة|خطورة السائق|danger|category/i
const FINE_RE = /fine|غرام/i
const OFFENCE_RE = /مخالفة|offen[cs]e/i

const findLabel = (labels: string[], re: RegExp): string | undefined => labels.find((l) => re.test(l))

const MAX_SAMPLE_ROWS = 30

export const buildPrompt = (data: VAData, lang: Lang): BuiltPrompt => {
  const objects = rowsAsObjects(data)
  const labels = data.columns.map((c, i) => c.label || `column_${i + 1}`)
  const nameLabel = findLabel(labels, NAME_RE)

  const groups = new Map<string, Record<string, unknown>[]>()
  if (nameLabel) {
    for (const obj of objects) {
      const key = formatValue(obj[nameLabel])
      const list = groups.get(key) ?? []
      list.push(obj)
      groups.set(key, list)
    }
  }

  const dataBlock =
    nameLabel && groups.size === 1
      ? describeSingleDriver(objects, labels)
      : describeCohort(objects, labels, nameLabel)

  const instruction =
    lang === 'ar'
      ? 'اكتب التحليل باللغة العربية الفصحى وفق التنسيق المطلوب: قسم «الملخص:» ثم قسم «التوصيات:».'
      : "Write the analysis in English following the required format: a 'Summary:' section then a 'Recommendations:' section."

  const user = [
    lang === 'ar'
      ? 'فيما يلي البيانات المعروضة حالياً في لوحة المعلومات (بعد تطبيق عوامل التصفية):'
      : 'Below is the data currently displayed in the dashboard (after active filters):',
    '',
    dataBlock,
    '',
    instruction,
  ].join('\n')

  return { system: SYSTEM_PROMPT, user }
}

// One driver selected: constant columns are the driver's profile, varying
// columns are the per-violation details.
const describeSingleDriver = (objects: Record<string, unknown>[], labels: string[]): string => {
  const constantLabels: string[] = []
  const varyingLabels: string[] = []
  for (const label of labels) {
    const values = new Set(objects.map((o) => formatValue(o[label])))
    ;(values.size <= 1 ? constantLabels : varyingLabels).push(label)
  }

  const profile = constantLabels.map((l) => `- ${l}: ${formatValue(objects[0][l])}`)

  const lines = [`بيانات السائق (driver profile):`, ...profile]

  if (varyingLabels.length > 0) {
    lines.push('', `المخالفات المسجلة (recorded violations) — ${objects.length}:`)
    objects.forEach((obj, i) => {
      const details = varyingLabels.map((l) => `${l}: ${formatValue(obj[l])}`).join(' | ')
      lines.push(`${i + 1}. ${details}`)
    })
  } else {
    lines.push('', `عدد الصفوف (rows): ${objects.length}`)
  }
  return lines.join('\n')
}

// Multiple drivers (or no name column): aggregate view of the whole page.
const describeCohort = (
  objects: Record<string, unknown>[],
  labels: string[],
  nameLabel?: string
): string => {
  const lines = ['نظرة عامة على البيانات المعروضة (overview of displayed data):']
  lines.push(`- عدد الصفوف (rows): ${objects.length}`)

  if (nameLabel) {
    const drivers = new Set(objects.map((o) => formatValue(o[nameLabel])))
    lines.push(`- عدد السائقين (unique drivers): ${drivers.size}`)
  }

  const categoryLabel = findLabel(labels, CATEGORY_RE)
  if (categoryLabel) {
    const counts = countBy(objects, categoryLabel)
    const dist = [...counts.entries()].map(([k, v]) => `${k}: ${v}`).join('، ')
    lines.push(`- توزيع درجة الخطورة (risk distribution): ${dist}`)
  }

  const fineLabel = findLabel(labels, FINE_RE)
  if (fineLabel) {
    const total = objects.reduce((sum, o) => {
      const n = Number(o[fineLabel])
      return Number.isFinite(n) ? sum + n : sum
    }, 0)
    if (total > 0) lines.push(`- إجمالي الغرامات (total fines): ${total}`)
  }

  const offenceLabel = findLabel(labels, OFFENCE_RE)
  if (offenceLabel) {
    const counts = countBy(objects, offenceLabel)
    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k} (${v})`)
      .join('، ')
    lines.push(`- أكثر المخالفات تكراراً (most frequent violations): ${top}`)
  }

  const sample = objects.slice(0, MAX_SAMPLE_ROWS)
  lines.push('', `عينة من الصفوف (sample rows, ${sample.length} of ${objects.length}):`)
  lines.push(labels.join(' | '))
  for (const obj of sample) {
    lines.push(labels.map((l) => formatValue(obj[l])).join(' | '))
  }
  if (objects.length > MAX_SAMPLE_ROWS) {
    lines.push(`(اقتصرت العينة على ${MAX_SAMPLE_ROWS} صفاً — اعتمد على الإحصاءات أعلاه للأرقام الإجمالية)`)
  }
  return lines.join('\n')
}

const countBy = (objects: Record<string, unknown>[], label: string): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const obj of objects) {
    const key = formatValue(obj[label])
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}
