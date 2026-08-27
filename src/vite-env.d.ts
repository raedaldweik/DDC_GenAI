/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANTHROPIC_API_KEY?: string
  readonly VITE_CLAUDE_MODEL?: string
  readonly VITE_LLM_PROVIDER?: string
  readonly VITE_LLM_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
