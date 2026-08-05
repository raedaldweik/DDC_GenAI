import { Fragment, ReactNode } from 'react'

interface SummaryViewProps {
  text: string
  streaming: boolean
}

const HEADING_RE = /^#{0,4}\s*\**\s*(الملخص|التوصيات|Summary|Recommendations)\s*\**\s*:?\s*$/
const BULLET_RE = /^[-•*]\s+/

// Renders **bold** spans in the dashboard's gold accent, everything else plain.
const renderInline = (text: string): ReactNode =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong
        key={i}
        className='font-bold text-[#f2c76e]'>
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  )

type Block = { kind: 'heading'; text: string } | { kind: 'paragraph'; text: string } | { kind: 'list'; items: string[] }

const parseBlocks = (text: string): Block[] => {
  const blocks: Block[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const heading = line.match(HEADING_RE)
    if (heading) {
      blocks.push({ kind: 'heading', text: heading[1] })
    } else if (BULLET_RE.test(line)) {
      const item = line.replace(BULLET_RE, '')
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'list') last.items.push(item)
      else blocks.push({ kind: 'list', items: [item] })
    } else {
      blocks.push({ kind: 'paragraph', text: line })
    }
  }
  return blocks
}

const SummaryView = ({ text, streaming }: SummaryViewProps) => {
  const blocks = parseBlocks(text)
  return (
    <div className='space-y-3 text-[15px] leading-7'>
      {blocks.map((block, i) => {
        if (block.kind === 'heading') {
          return (
            <h2
              key={i}
              className='flex items-center gap-2 pt-1 text-base font-bold text-[#35e0b2]'>
              <span className='inline-block h-3.5 w-1 rounded bg-[#35e0b2]' />
              {block.text}
            </h2>
          )
        }
        if (block.kind === 'list') {
          return (
            <ul
              key={i}
              className='space-y-2'>
              {block.items.map((item, j) => (
                <li
                  key={j}
                  className='flex gap-2'>
                  <span className='mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#35e0b2]/70' />
                  <span>{renderInline(item)}</span>
                </li>
              ))}
            </ul>
          )
        }
        return <p key={i}>{renderInline(block.text)}</p>
      })}
      {streaming && <span className='inline-block animate-pulse text-[#35e0b2]'>▍</span>}
    </div>
  )
}

export default SummaryView
