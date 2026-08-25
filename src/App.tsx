import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import RichText from './components/RichText'
import { streamClaude } from './lib/llm'
import { splitSections } from './lib/parse'
import { Lang, buildPrompt } from './lib/prompt'
import { SAMPLE_MESSAGE } from './lib/sample'
import { VAData, parseVAMessage } from './lib/va'

type Status = 'waiting' | 'no-data' | 'generating' | 'done' | 'error'
type Tab = 'summary' | 'recommendations'

// URL parameters let one deployment serve every page:
//   ?key=      Anthropic API key override (demo only)
//   ?model=    model override
//   ?context=  one-line page description injected into the prompt per page
//   ?controls=0  hide the in-iframe language/regenerate controls
//   ?demo=1    load built-in sample data (standalone testing)
const urlParams = new URLSearchParams(window.location.search)
const API_KEY = urlParams.get('key') || import.meta.env.VITE_ANTHROPIC_API_KEY || ''
const MODEL = urlParams.get('model') || import.meta.env.VITE_CLAUDE_MODEL || 'claude-sonnet-5'
const PAGE_CONTEXT = urlParams.get('context') || ''
const SHOW_CONTROLS = urlParams.get('controls') !== '0'
const DEMO_MODE = urlParams.get('demo') !== null

// Auto-fit: shrink the content font until it fits the panel height, but never
// below MIN_FONT — past that point the scrollbar takes over for readability.
const MAX_FONT = 14
const MIN_FONT = 11
const FONT_STEP = 0.5

const UI_TEXT = {
  ar: {
    summaryTab: 'الملخص',
    recsTab: 'التوصيات',
    recsBadge: (n: number) => `${n} توصيات`,
    waiting: 'بانتظار البيانات من التقرير…',
    noData: 'لا توجد بيانات ضمن عوامل التصفية الحالية.',
    generating: 'جارٍ إنشاء التحليل…',
    empty: 'لا يوجد محتوى في هذا القسم.',
    error: 'تعذر إنشاء التحليل',
    retry: 'إعادة المحاولة',
    regenerate: 'إعادة توليد',
    demo: 'عرض مثال تجريبي',
    noKey: 'لم يتم ضبط مفتاح Claude API. أضف VITE_ANTHROPIC_API_KEY عند البناء أو المعامل ?key= في رابط الكائن.',
  },
  en: {
    summaryTab: 'Summary',
    recsTab: 'Recommendations',
    recsBadge: (n: number) => `${n} items`,
    waiting: 'Waiting for data from the report…',
    noData: 'No data under the current filters.',
    generating: 'Generating analysis…',
    empty: 'Nothing in this section.',
    error: 'Failed to generate the analysis',
    retry: 'Retry',
    regenerate: 'Regenerate',
    demo: 'Show sample',
    noKey: 'Claude API key is not configured. Set VITE_ANTHROPIC_API_KEY at build time or pass ?key= in the object URL.',
  },
} as const

const App = () => {
  const [vaData, setVaData] = useState<VAData | null>(DEMO_MODE ? parseVAMessage(SAMPLE_MESSAGE) : null)
  const [lang, setLang] = useState<Lang>('ar')
  const [tab, setTab] = useState<Tab>('summary')
  const [text, setText] = useState('')
  const [status, setStatus] = useState<Status>('waiting')
  const [error, setError] = useState('')
  const [showDemoButton, setShowDemoButton] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const lastKeyRef = useRef('')
  const receivedRef = useRef(DEMO_MODE)
  const mainRef = useRef<HTMLElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  const t = UI_TEXT[lang]
  const sections = useMemo(() => splitSections(text), [text])

  // Step the font size down until the content fits the visible height (or the
  // floor is reached). Runs synchronously before paint, so no visible flicker;
  // each step forces one reflow, capped at (MAX-MIN)/STEP ≈ 6 reads.
  const fitText = useCallback(() => {
    const main = mainRef.current
    const card = cardRef.current
    if (!main || !card) return
    let size = MAX_FONT
    card.style.fontSize = `${size}px`
    while (size > MIN_FONT && main.scrollHeight > main.clientHeight + 1) {
      size -= FONT_STEP
      card.style.fontSize = `${size}px`
    }
  }, [])

  useLayoutEffect(() => {
    fitText()
  })

  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    const observer = new ResizeObserver(() => fitText())
    observer.observe(main)
    return () => observer.disconnect()
  }, [fitText])

  // Data pushed by SAS VA on load and on every filter/selection change.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const parsed = parseVAMessage(event.data)
      if (!parsed) return
      receivedRef.current = true
      setShowDemoButton(false)
      setVaData(parsed)
    }
    window.addEventListener('message', onMessage, false)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // When opened outside VA (no message arrives), offer the built-in sample.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!receivedRef.current) setShowDemoButton(true)
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  const generate = useCallback(
    (force = false) => {
      if (!vaData) return
      if (vaData.rows.length === 0) {
        abortRef.current?.abort()
        lastKeyRef.current = ''
        setText('')
        setStatus('no-data')
        return
      }
      if (!API_KEY) {
        setStatus('error')
        setError(UI_TEXT[lang].noKey)
        return
      }
      // Skip regeneration when VA re-sends an identical payload (e.g. resize).
      const dataKey = `${lang}|${vaData.resultName ?? ''}|${vaData.rows.length}|${JSON.stringify(vaData.rows[0])}|${JSON.stringify(
        vaData.rows[vaData.rows.length - 1]
      )}`
      if (!force && dataKey === lastKeyRef.current) return
      lastKeyRef.current = dataKey

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setStatus('generating')
      setText('')
      setError('')
      setTab('summary')

      const { system, user } = buildPrompt(vaData, lang, PAGE_CONTEXT)
      streamClaude({ apiKey: API_KEY, model: MODEL, system, prompt: user, signal: controller.signal, onText: setText })
        .then((finalText) => {
          if (controller.signal.aborted) return
          setText(finalText)
          setStatus('done')
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return
          setError(err instanceof Error ? err.message : String(err))
          setStatus('error')
        })
    },
    [vaData, lang]
  )

  // Debounced so rapid filter changes in the report trigger a single call.
  useEffect(() => {
    if (!vaData) return
    const timer = setTimeout(() => generate(), 500)
    return () => clearTimeout(timer)
  }, [vaData, lang, generate])

  const loadSample = () => {
    receivedRef.current = true
    setShowDemoButton(false)
    setVaData(parseVAMessage(SAMPLE_MESSAGE))
  }

  const hasContent = status === 'done' || (status === 'generating' && text !== '')
  const streaming = status === 'generating' && text !== ''

  const tabButton = (id: Tab, label: string, badge?: string) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-2 pb-1 text-sm font-bold transition-colors ${
        tab === id ? 'text-white' : 'text-[#6f8f83] hover:text-[#9db8ad]'
      }`}>
      <span className={`h-4 w-1 rounded ${tab === id ? 'bg-[#35e0b2]' : 'bg-transparent'}`} />
      {label}
      {badge && (
        <span className='rounded-full border border-[#f2c76e]/40 px-2 py-0.5 text-[10px] font-semibold text-[#f2c76e]'>
          {badge}
        </span>
      )}
    </button>
  )

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className='flex h-full flex-col gap-2 p-1'>
      <div className='flex flex-wrap items-center gap-4 border-b border-[#1e3b30]/70 pb-1.5'>
        {tabButton('summary', t.summaryTab)}
        {tabButton(
          'recommendations',
          t.recsTab,
          sections.recommendations.length > 0 ? t.recsBadge(sections.recommendations.length) : undefined
        )}
        {SHOW_CONTROLS && (
          <div className='ms-auto flex items-center gap-1.5'>
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              title={lang === 'ar' ? 'English' : 'عربي'}
              className='rounded border border-[#1e3b30] px-2 py-0.5 text-[11px] text-[#6f8f83] hover:border-[#35e0b2]/50 hover:text-[#35e0b2]'>
              {lang === 'ar' ? 'EN' : 'ع'}
            </button>
            {(status === 'done' || status === 'error') && (
              <button
                onClick={() => generate(true)}
                title={t.regenerate}
                className='rounded border border-[#1e3b30] px-2 py-0.5 text-[11px] text-[#6f8f83] hover:border-[#35e0b2]/50 hover:text-[#35e0b2]'>
                ⟳
              </button>
            )}
          </div>
        )}
      </div>

      <main
        ref={mainRef}
        className='flex-1 overflow-y-auto'>
        {status === 'waiting' && (
          <div className='flex h-full flex-col items-center justify-center gap-2 text-center'>
            <p className='text-sm text-[#9db8ad]'>{t.waiting}</p>
            {showDemoButton && (
              <button
                onClick={loadSample}
                className='rounded-md border border-[#35e0b2]/50 px-4 py-1.5 text-sm text-[#35e0b2] hover:bg-[#35e0b2]/10'>
                {t.demo}
              </button>
            )}
          </div>
        )}

        {status === 'no-data' && (
          <div className='flex h-full items-center justify-center'>
            <p className='text-sm text-[#9db8ad]'>{t.noData}</p>
          </div>
        )}

        {status === 'generating' && text === '' && (
          <div className='flex h-full flex-col items-center justify-center gap-2'>
            <span className='animate-pulse text-xl text-[#35e0b2]'>✦</span>
            <p className='text-sm text-[#9db8ad]'>{t.generating}</p>
          </div>
        )}

        {hasContent && (
          <div
            ref={cardRef}
            style={{ fontSize: MAX_FONT, lineHeight: 1.9 }}
            className='rounded-lg border border-[#35e0b2]/15 bg-[#07120d]/60 p-3.5'>
            {tab === 'summary' && (
              <div className='space-y-2'>
                {sections.summary.map((line, i) => (
                  <p key={i}>
                    <RichText text={line} />
                  </p>
                ))}
                {sections.summary.length === 0 && !streaming && <p className='text-[#6f8f83]'>{t.empty}</p>}
                {streaming && <span className='inline-block animate-pulse text-[#35e0b2]'>▍</span>}
              </div>
            )}
            {tab === 'recommendations' && (
              <ul className='space-y-2'>
                {sections.recommendations.map((item, i) => (
                  <li
                    key={i}
                    className='flex gap-2'>
                    <span className='mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-[#35e0b2]/70' />
                    <span>
                      <RichText text={item} />
                    </span>
                  </li>
                ))}
                {sections.recommendations.length === 0 && !streaming && (
                  <li className='text-[#6f8f83]'>{t.empty}</li>
                )}
                {streaming && <li className='animate-pulse text-[#35e0b2]'>▍</li>}
              </ul>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className='flex h-full flex-col items-center justify-center gap-2 text-center'>
            <p className='text-sm font-semibold text-[#e08d8d]'>{t.error}</p>
            <p className='max-w-md break-words text-xs text-[#9db8ad]'>{error}</p>
            <button
              onClick={() => generate(true)}
              className='rounded-md border border-[#35e0b2]/50 px-4 py-1 text-sm text-[#35e0b2] hover:bg-[#35e0b2]/10'>
              {t.retry}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
