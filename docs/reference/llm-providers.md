# LLM provider facts behind the AI features

What `server/crates/kroma-engine/src/infra/llm/http/` relies on when it asks a
provider for a completion or a tool turn: how each provider is told whether to
reason, how reasoning counts against the output budget, and how a reply that ran
out of budget looks. Each fact names its source and how it is known. Read
2026-11-17.

## OpenRouter

Sources: the reasoning tokens guide at
<https://openrouter.ai/docs/guides/best-practices/reasoning-tokens.md>, the
parameters page at <https://openrouter.ai/docs/api_reference/parameters.md>, the
chat completion reference at
<https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion.md>,
the errors page at
<https://openrouter.ai/docs/api_reference/errors-and-debugging.md>, the Opus 5
migration guide at
<https://openrouter.ai/docs/cookbook/evaluate-and-optimize/model-migrations/opus-5.md>,
and `GET https://openrouter.ai/api/v1/models`. Documented, unless marked
observed.

### The `reasoning` object

- A chat completion takes a `reasoning` object with `effort`, `max_tokens`,
  `enabled` and `exclude`. `effort` and `max_tokens` cannot be sent together: the
  request is rejected with "Only one of "reasoning.effort" and
  "reasoning.max_tokens" can be specified" (chat reference).
- `enabled: false` turns reasoning off. The Opus 5 guide sends exactly this to a
  model that reasons by default, and the Messages API mapping in the reasoning
  guide translates `thinking: {type: "disabled"}` to it.
- `enabled: true` alone means `medium` effort.
- `effort` takes a share of the request's `max_tokens`: `max` and `xhigh` about
  95%, `high` 80%, `medium` 50%, `low` 20%, `minimal` 10%. `none` disables
  reasoning. A model that only takes an effort level reads `reasoning.max_tokens`
  as one of these shares.
- `reasoning.max_tokens` is a direct cap on Gemini, Anthropic and some Qwen
  models. For Anthropic it is used as given, with a floor of 1024, and the
  request's `max_tokens` must be strictly higher than it.
- A model that does not reason is not refused a `reasoning` object: unless
  `provider.require_parameters` is set, a provider receives only the parameters
  it supports and the rest are dropped (chat reference,
  `ProviderPreferences.require_parameters`).

### Reasoning counts against `max_tokens`

- On most providers `max_tokens` covers reasoning and the visible answer
  together. When reasoning spends all of it, the reply comes back with
  `finish_reason: "length"` and empty `content`, and the reasoning is still
  billed (parameters page, reasoning guide).
- The way to spot it: `usage.completion_tokens` minus
  `usage.completion_tokens_details.reasoning_tokens` is the visible output,
  and is 0 or close to it when reasoning took the budget.
- `finish_reason` is one of `tool_calls`, `stop`, `length`, `content_filter`,
  `error` (chat reference, `ChatFinishReasonEnum`).

### Per-model reasoning metadata

- Each model in `GET /api/v1/models` may carry `reasoning` with
  `supported_efforts`, `default_effort`, `default_enabled`,
  `supports_max_tokens` and `mandatory`. With `mandatory: true` the guide says
  not to send `effort: "none"`, because the model rejects it.
- What a mandatory model does with `enabled: false` is not documented. KROMA
  treats a 400 as a possible refusal and retries with reasoning on (below).
- Observed 2026-11-17: 147 of the 474 listed models were mandatory, among them
  `openai/gpt-6.2-sol` and `anthropic/claude-fable-5.2`.
- `nvidia/nemotron-3-ultra-550b-a55b:free` lists `default_enabled: true`,
  `default_effort: "high"`, `supported_efforts: ["high", "medium", "none"]`,
  `supports_max_tokens: true`, `mandatory: false`, and a
  `max_completion_tokens` of 65536.

### Errors and tool choice

- An error body is `{"error": {"code", "message", "metadata"}}`. The HTTP status
  equals `code` when the request itself is invalid or out of credits. An error
  raised once the model has started comes back in a 200 body. 400 is a bad
  request, 429 a rate limit, 502 and 503 an upstream failure (errors page).
- `tool_choice` takes `none`, `auto`, `required` or a named tool (chat
  reference, `ChatToolChoice`).

### Observed on `nvidia/nemotron-3-ultra-550b-a55b:free`, 2026-11-17

The personalize request of `sections.personalize`, answer budget 900:

| Request | `finish_reason` | Completion tokens | Reasoning tokens | Answer |
| --- | --- | --- | --- | --- |
| No `reasoning` field, `max_tokens` 900 | `length` | 900 | 900 | `content: null`, twice |
| `reasoning: {enabled: false}`, `max_tokens` 900 | `stop` | 503 to 652 | 0 | 4 sections, twice |
| `reasoning: {max_tokens: 1024}`, `max_tokens` 1924 | `stop` | 1547 to 1563 | 1023 | 4 sections, twice |

A suggest-shaped tool run on the same model made one `find_titles` call per
turn: the director, then each lead actor, then each genre. With
`tool_choice: "none"` alone on the last turn it wrote its next call as text in
`content`. With a user message saying no more lookups are available, added
before that turn, it answered with the JSON, twice out of two.

## Anthropic Messages API

Sources: <https://platform.claude.com/docs/en/build-with-claude/thinking.md>,
<https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking.md>,
<https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools.md>
and <https://platform.claude.com/docs/en/api/messages/create.md>. Documented.

- What a request without a `thinking` field does depends on the model. Claude 5
  models (Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable, Opus 5, Sonnet 5) think
  adaptively by default. Opus 4.8 and older do not think unless asked.
- `thinking: {type: "disabled"}` is a 400 on Opus 5.5, Sonnet 5.5, Fable 5,
  5.1 and 5.2, and the Mythos models. Opus 5 and Haiku 5.5 accept it only at
  effort `high` or below. So KROMA sends nothing when reasoning is off, which
  every model accepts.
- `thinking: {type: "adaptive"}` is accepted from Opus 4.6 and Sonnet 4.6 on and
  is a 400 on Opus 4.5, Sonnet 4.5 and Haiku 4.5. KROMA retries those without it.
- `max_tokens` is a hard cap on thinking and answer combined, so it has to leave
  room for both (adaptive thinking page).
- A reply stopped by the cap has `stop_reason: "max_tokens"`. `usage.output_tokens`
  counts thinking and text together.
- `tool_choice: {type: "none"}` works on every model and every thinking setting,
  where `any` and `tool` fail on some (define-tools page).
- Consecutive `user` turns in a request are combined into one turn (Messages
  reference), so a note can follow the `tool_result` message.

## OpenAI-compatible servers

KROMA's `openai` provider id stands for any server speaking the chat completions
wire: Ollama, llama.cpp, LM Studio, vLLM or OpenAI itself. KROMA cannot tell
which, and a server may reject a field it does not know, so this provider is
sent no reasoning control and its reasoning toggle is hidden in the admin.

## What KROMA does with these facts

- Reasoning off: OpenRouter gets `reasoning: {enabled: false}` and `max_tokens`
  set to the answer budget. Claude gets no `thinking` field.
- Reasoning on: the answer budget is kept for the answer, and reasoning is given
  as much again on top, never under 1024. OpenRouter gets
  `reasoning: {max_tokens: R}`, Claude `thinking: {type: "adaptive"}`, and both
  a `max_tokens` of answer plus R.
- A reply with no answer and a `length` or `max_tokens` stop fails with the stop
  reason and the token counts.
- A request refused with a 400, or a reply that ran out of budget, is tried once
  more with reasoning flipped, on OpenRouter and Anthropic only.
- The last turn of a tool run withholds the tools and tells the model to answer
  from what it has gathered.
