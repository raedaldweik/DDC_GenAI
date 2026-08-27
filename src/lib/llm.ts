// Pluggable LLM client with two providers:
//   'claude'  — Anthropic API directly from the browser (demo deployment)
//   'openai'  — any OpenAI-compatible endpoint: LiteLLM proxy, vLLM, Ollama,
//               TGI, NIM... (on-prem deployment; model selected by name)
// For a fully governed setup the same 'openai' provider can point at a
// same-origin SAS Viya proxy (Job Execution) instead of the gateway itself —
// see README. This module is the only integration point.

export type Provider = 'claude' | 'openai'

export interface StreamRequest {
  provider: Provider
  apiKey: string
  model: string
  endpoint?: string
  system: string
  prompt: string
  signal: AbortSignal
  onText: (fullText: string) => void
}

export const streamLLM = (req: StreamRequest): Promise<string> =>
  req.provider === 'openai' ? streamOpenAI(req) : streamClaude(req)

const readError = async (res: Response): Promise<string> => {
  let message = `HTTP ${res.status}`
  try {
    const j = (await res.json()) as { error?: { message?: string } | string }
    if (typeof j?.error === 'string') message = j.error
    else message = j?.error?.message ?? message
  } catch {
    // keep the default message
  }
  return message
}

// Shared SSE reader: calls handleData for each `data: ...` payload line.
const readSSE = async (
  res: Response,
  handleData: (payload: string) => void
): Promise<void> => {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('data:')) handleData(trimmed.slice(5).trim())
    }
  }
}

const streamClaude = async (req: StreamRequest): Promise<string> => {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: req.signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': req.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: 1024,
      // Sampling params (temperature/top_p/top_k) are rejected on Claude 5
      // models. Thinking is explicitly disabled: this is a short summarization
      // task and on Sonnet 5 thinking is on by default, which would delay the
      // first streamed token and consume the max_tokens budget.
      thinking: { type: 'disabled' },
      stream: true,
      system: req.system,
      messages: [{ role: 'user', content: req.prompt }],
    }),
  })
  if (!res.ok || !res.body) throw new Error(await readError(res))

  let fullText = ''
  await readSSE(res, (payload) => {
    let event: { type?: string; delta?: { type?: string; text?: string }; error?: { message?: string } }
    try {
      event = JSON.parse(payload)
    } catch {
      return
    }
    if (event.type === 'error') throw new Error(event.error?.message ?? 'Streaming error')
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      fullText += event.delta.text ?? ''
      req.onText(fullText)
    }
  })
  return fullText
}

const streamOpenAI = async (req: StreamRequest): Promise<string> => {
  if (!req.endpoint) throw new Error('LLM endpoint is not configured (?endpoint=...)')
  const res = await fetch(req.endpoint, {
    method: 'POST',
    signal: req.signal,
    headers: {
      'content-type': 'application/json',
      ...(req.apiKey ? { authorization: `Bearer ${req.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: 1024,
      stream: true,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.prompt },
      ],
    }),
  })
  if (!res.ok || !res.body) throw new Error(await readError(res))

  let fullText = ''
  await readSSE(res, (payload) => {
    if (payload === '[DONE]') return
    let event: { choices?: { delta?: { content?: string } }[]; error?: { message?: string } }
    try {
      event = JSON.parse(payload)
    } catch {
      return
    }
    if (event.error) throw new Error(event.error.message ?? 'Streaming error')
    const delta = event.choices?.[0]?.delta?.content
    if (delta) {
      fullText += delta
      req.onText(fullText)
    }
  })
  return fullText
}
