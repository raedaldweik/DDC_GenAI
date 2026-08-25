# DDC AI Narrative — التحليل الذكي للسائق

AI-generated **summary + recommendations** for the Dubai Police driver-risk dashboard, rendered inside a
**SAS Visual Analytics Data-Driven Content (DDC)** object.

The report pushes the currently displayed (filtered) rows into this app via `postMessage`. The app builds a
grounded prompt from those rows, streams a response from the **Claude API**, and renders it in an
Arabic-first (RTL) panel styled to match the dashboard. Filtering to a single driver produces an individual
risk profile; a page-level view produces a cohort summary.

## How it works

```
SAS VA report ──postMessage(data, columns)──▶ DDC iframe (this app)
                                                 │  builds prompt from rows
                                                 ▼
                                          Claude API (streaming)
                                                 │
                                                 ▼
                                    الملخص + التوصيات rendered in-panel
```

- **Role-agnostic**: whatever columns you assign to the DDC object in VA become the prompt. Add or remove
  roles in the report without touching the code. Column labels are matched heuristically (name / risk
  category / fine / violation text) for grouping and aggregation.
- **Single driver vs. page**: one distinct driver in the data → profile + per-violation breakdown; many
  drivers → cohort statistics (risk distribution, total fines, top violations) plus a row sample.
- **Debounced + deduplicated**: rapid filter changes cause one API call; identical re-sent payloads
  (e.g. on resize) cause none.
- **Streaming**: the narrative types itself in as Claude responds.
- **Language toggle**: Arabic (default) / English, in the panel header.

## Setup

```bash
npm install
cp .env.example .env      # put your Anthropic API key in .env
npm run dev               # https://localhost:3000 (self-signed cert)
```

Open `https://localhost:3000/?demo=1` to test standalone with built-in sample data (David Taylor's rows),
or click "عرض مثال تجريبي" when no report data arrives.

## Build & host on SAS Viya (no external server needed)

`npm run build` produces **one self-contained file**: `dist/index.html` (all JS/CSS inlined via
`vite-plugin-singlefile`).

1. Upload `dist/index.html` to a SAS Content folder (SAS Drive → e.g. `/Public/ddc/ai_narrative.html`),
   or paste it as the form of a Job Execution job definition.
2. In the VA report, set the Data-Driven Content object's URL to:
   `https://<your-viya-host>/SASJobExecution/?_file=/Public/ddc/ai_narrative.html`
3. Assign the data roles (see below).

### URL parameters (demo conveniences)

| Param | Purpose |
|-------|---------|
| `key` | Anthropic API key override — avoids rebuilding when the key changes: `...ai_narrative.html&key=sk-ant-...` |
| `model` | Model override (default `claude-sonnet-5`) |
| `context` | One-line page description injected into the prompt, so each page's DDC URL steers its own analysis: `?context=صفحة البلاغات الجنائية` |
| `controls` | `controls=0` hides the in-iframe language/regenerate buttons (when the VA container design carries its own mock controls) |
| `demo` | Load built-in sample data immediately (standalone testing) |

The app renders **transparent** with no header of its own — the VA container provides the panel styling,
title, and chip; the DDC renders only the الملخص/التوصيات tabs and content. Set the DDC object's
background to transparent in the report for a seamless look.

## Recommended VA data roles

Works with any roles, but this set gives the richest narrative (from `TRF_DANGEROUS_JOIN_V4`):

- **الاسم** (driver name — used to detect single-driver vs. page view)
- **درجة خطورة السائق** (risk category), **نسبة الخطورة** (risk score)
- **نص المخالفة**, **TICKET_NO**, **TICKET_DATE**, **TOTAL_FINE**, **LAST_TICKET_DATE**
- **NEIGHBORHOOD_A / الحي** (violation location)
- **عدد المركبات**, **المركبات المنتهية**, **المركبات المحجوزة**, **المركبات المطلوبة**, **السوابق الجنائية**
- الجنسية / الوظيفة (nationality / occupation) for profile color

## Production path (on-prem LLM)

The browser-side Claude call (`src/lib/llm.ts`) is demo-only: the API key is embedded client-side. For
production, keep the same UI and swap the transport to a **same-origin SAS Viya endpoint**:

1. Register the client's on-prem LLM (endpoint, auth, config) in **SAS Model Manager** using the
   **SAS Agentic AI Accelerator** code wrappers.
2. Publish it as a governed REST scoring endpoint (SCR container / MAS).
3. Point this app at that endpoint instead of `api.anthropic.com` — the user's existing Viya session
   handles auth, no key ships to the browser, nothing leaves the client's network, and every call is
   governed and auditable in Model Manager.

`streamClaude` is the only integration point to replace.

## Project structure

```
src/
  App.tsx                  state machine: waiting → generating → done/error, debounce, dedupe
  components/SummaryView.tsx   renders الملخص/التوصيات sections with streaming cursor
  lib/va.ts                SAS VA postMessage parsing
  lib/prompt.ts            grounded prompt builder (single-driver / cohort)
  lib/llm.ts               Claude streaming client (swap point for production)
  lib/sample.ts            built-in sample payload for standalone demos
```
