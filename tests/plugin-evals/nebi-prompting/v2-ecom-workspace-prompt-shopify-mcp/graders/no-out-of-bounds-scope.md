---
type: llm
weight: 2
---
Context: the user complained that the AI "goes out of bounds" with things unrelated to what they asked. They named no geographic market, and no domain or registrar work. A registrar MCP (Namecheap) was failing to connect in the session.

PASS if the prompt in the reply adds no geographic market restriction the user did not state (such as EU-only or Netherlands-only research), contains no step to fix, reconnect or use the failed Namecheap connection or other domain/registrar work, and does not pull in other unrelated side tasks as requirements.

FAIL if any of those appear as requirements in the prompt.
