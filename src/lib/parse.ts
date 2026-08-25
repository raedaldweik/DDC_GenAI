// Splits the model's output (الملخص / التوصيات sections) into the two tab
// contents. Robust to partial text while streaming: bullets always land in
// recommendations, plain paragraphs in the summary, heading lines are dropped
// (the tabs themselves carry the section labels).

const HEADING_RE = /^#{0,4}\s*\**\s*(الملخص|التوصيات|Summary|Recommendations)\s*\**\s*:?\s*$/
const BULLET_RE = /^[-•*]\s+/

export interface Sections {
  summary: string[]
  recommendations: string[]
}

export const splitSections = (text: string): Sections => {
  const summary: string[] = []
  const recommendations: string[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || HEADING_RE.test(line)) continue
    if (BULLET_RE.test(line)) {
      recommendations.push(line.replace(BULLET_RE, ''))
    } else {
      summary.push(line)
    }
  }
  return { summary, recommendations }
}
