import { useCallback, useEffect, useRef, useState } from 'react'
import SummaryView from './components/SummaryView'
import { streamClaude } from './lib/llm'
import { Lang, buildPrompt } from './lib/prompt'
import { SAMPLE_MESSAGE } from './lib/sample'
import { VAData, parseVAMessage } from './lib/va'

type Status = 'waiting' | 'no-data' | 'generating' | 'done' | 'error'

// ?key= and ?model= URL overrides let the DDC URL carry the configuration
// when rebuilding the bundle isn't convenient (demo only — for production the
// call moves behind a same-origin Viya endpoint and no key exists client-side).
const urlParams = new URLSearchParams(window.location.search)
const API_KEY = urlParams.get('key') || import.meta.env.VITE_ANTHROPIC_API_KEY || ''
const MODEL = urlParams.get('model') || import.meta.env.VITE_CLAUDE_MODEL || 'claude-sonnet-5'
const DEMO_MODE = urlParams.get('demo') !== null

const UI_TEXT = {
  ar: {
    title: 'التحليل الذكي للسائق',
    waiting: 'بانتظار البيانات من التقرير…',
    waitingHint: 'اختر سائقاً في لوحة المعلومات لعرض التحليل الذكي.',
    noData: 'لا توجد بيانات ضمن عوامل التصفية الحالية.',
    generating: 'جارٍ إنشاء التحليل…',
    error: 'تعذر إنشاء التحليل',
    retry: 'إعادة المحاولة',
    regenerate: 'إعادة التوليد',
    demo: 'عرض مثال تجريبي',
    noKey: 'لم يتم ضبط مفتاح Claude API. أضف VITE_ANTHROPIC_API_KEY عند البناء أو المعامل ?key= في رابط الكائن.',
    footer: 'يتم إنشاء هذا التحليل تلقائياً بواسطة الذكاء الاصطناعي استناداً إلى بيانات التقرير المعروضة.',
  },
  en: {
    title: 'Driver AI Analysis',
    waiting: 'Waiting for data from the report…',
    waitingHint: 'Select a driver in the dashboard to view the AI analysis.',
    noData: 'No data under the current filters.',
    generating: 'Generating analysis…',
    error: 'Failed to generate the analysis',
    retry: 'Retry',
    regenerate: 'Regenerate',
    demo: 'Show sample',
    noKey: 'Claude API key is not configured. Set VITE_ANTHROPIC_API_KEY at build time or pass ?key= in the object URL.',
    footer: 'This analysis is generated automatically by AI from the report data currently displayed.',
  },
} as const

const App = () => {
  const [vaData, setVaData] = useState<VAData | null>(DEMO_MODE ? parseVAMessage(SAMPLE_MESSAGE) : null)
  const [lang, setLang] = useState<Lang>('ar')
  const [text, setText] = useState('')
  const [status, setStatus] = useState<Status>('waiting')
  const [error, setError] = useState('')
  const [showDemoButton, setShowDemoButton] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const lastKeyRef = useRef('')
  const receivedRef = useRef(DEMO_MODE)

  const t = UI_TEXT[lang]

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

      const { system, user } = buildPrompt(vaData, lang)
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

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className='flex h-full flex-col gap-3 p-4'>
      <header className='flex flex-wrap items-center gap-3 border-b border-[#1e3b30] pb-3'>
        <span className='h-5 w-1 rounded bg-[#35e0b2]' />
        <h1 className='text-lg font-bold text-white'>{t.title}</h1>
        <span className='rounded-full border border-[#35e0b2]/50 px-3 py-0.5 text-[11px] font-semibold tracking-wider text-[#35e0b2]'>
          AI · NARRATIVE ✦
        </span>
        <div className='ms-auto flex items-center gap-2'>
          <div className='flex overflow-hidden rounded-md border border-[#1e3b30] text-xs'>
            {(['ar', 'en'] as const).map((code) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                className={
                  lang === code
                    ? 'bg-[#35e0b2]/20 px-2.5 py-1 font-bold text-[#35e0b2]'
                    : 'px-2.5 py-1 text-[#6f8f83] hover:text-[#e8f4ee]'
                }>
                {code === 'ar' ? 'ع' : 'EN'}
              </button>
            ))}
          </div>
          {(status === 'done' || status === 'error') && (
            <button
              onClick={() => generate(true)}
              title={t.regenerate}
              className='rounded-md border border-[#1e3b30] px-2.5 py-1 text-xs text-[#6f8f83] hover:border-[#35e0b2]/50 hover:text-[#35e0b2]'>
              ⟳ {t.regenerate}
            </button>
          )}
        </div>
      </header>

      <main className='flex-1 overflow-y-auto'>
        {status === 'waiting' && (
          <div className='flex h-full flex-col items-center justify-center gap-3 text-center'>
            <div className='text-3xl'>✦</div>
            <p className='font-semibold text-[#9db8ad]'>{t.waiting}</p>
            <p className='text-sm text-[#6f8f83]'>{t.waitingHint}</p>
            {showDemoButton && (
              <button
                onClick={loadSample}
                className='mt-2 rounded-md border border-[#35e0b2]/50 px-4 py-1.5 text-sm text-[#35e0b2] hover:bg-[#35e0b2]/10'>
                {t.demo}
              </button>
            )}
          </div>
        )}

        {status === 'no-data' && (
          <div className='flex h-full items-center justify-center'>
            <p className='text-[#9db8ad]'>{t.noData}</p>
          </div>
        )}

        {status === 'generating' && text === '' && (
          <div className='flex h-full flex-col items-center justify-center gap-2'>
            <span className='animate-pulse text-2xl text-[#35e0b2]'>✦</span>
            <p className='text-sm text-[#9db8ad]'>{t.generating}</p>
          </div>
        )}

        {(status === 'done' || (status === 'generating' && text !== '')) && (
          <SummaryView
            text={text}
            streaming={status === 'generating'}
          />
        )}

        {status === 'error' && (
          <div className='flex h-full flex-col items-center justify-center gap-3 text-center'>
            <p className='font-semibold text-[#e08d8d]'>{t.error}</p>
            <p className='max-w-md break-words text-sm text-[#9db8ad]'>{error}</p>
            <button
              onClick={() => generate(true)}
              className='rounded-md border border-[#35e0b2]/50 px-4 py-1.5 text-sm text-[#35e0b2] hover:bg-[#35e0b2]/10'>
              {t.retry}
            </button>
          </div>
        )}
      </main>

      <footer className='border-t border-[#1e3b30] pt-2 text-[11px] text-[#6f8f83]'>{t.footer}</footer>
    </div>
  )
}

export default App
