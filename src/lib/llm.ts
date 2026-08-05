// Pluggable LLM client. The demo provider calls the Anthropic API directly
// from the browser (with the explicit CORS opt-in header). For production the
// same interface can be backed by a same-origin SAS Viya endpoint — a Viya Job
// or an SCR/MAS scoring endpoint published from Model Manager via the Agentic
// AI Accelerator — so no API key ever reaches the browser. See README.

export interface StreamRequest {
  apiKey: string
  model: string
  system: string
  prompt: string
  signal: AbortSignal
  onText: (fullText: string) => void
}

interface StreamEvent {
  type?: string
  delta?: { type?: string; text?: string }
  error?: { message?: string }
}

export const streamClaude = async (req: StreamRequest): Promise<string> => {
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
      temperature: 0.3,
      stream: true,
      system: req.system,
      messages: [{ role: 'user', content: req.prompt }],
    }),
  })

  if (!res.ok || !res.body) {
    let message = `HTTP ${res.status}`
    try {
      const j = (await res.json()) as { error?: { message?: string } }
      message = j?.error?.message ?? message
    } catch {
      // keep the default message
    }
    throw new Error(message)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      let event: StreamEvent
      try {
        event = JSON.parse(trimmed.slice(5).trim()) as StreamEvent
      } catch {
        continue
      }
      if (event.type === 'error') {
        throw new Error(event.error?.message ?? 'Streaming error')
      }
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        fullText += event.delta.text ?? ''
        req.onText(fullText)
      }
    }
  }
  return fullText
}
