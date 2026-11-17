---
type: llm
weight: 3
---
Context: the assistant knows (from earlier in the conversation or from a connected store tool) that the user runs one small Shopify store. In their latest message the user asked for a copy-paste prompt that sets up a general e-commerce command-center workspace: marketing and trend research, competitor scraping, prompting guides for AI models, hooks, AI video, tool setup, a main CLAUDE.md with best practices, and skills. The user said "I can tell it what product I have" for research, so product-specific research on request is in scope. In the real session this came from, the user rejected a prompt that turned the workspace into one shop's setup ("it's not about a shop").

PASS if the prompt in the reply keeps the deliverable as that general, reusable workspace for the user's e-commerce work. The store may appear as background about the user or as an optional example. A short "about me / what I sell" context note that the user fills in when they want product-specific research is fine.

FAIL if the prompt does any of these: states the workspace's goal or purpose as being for, or built around, that one store or brand; requires store-specific business setup such as unit economics or KPI tracking (COGS, margins, AOV, ROAS, "key numbers", pricing sheets, a results ledger), a folder of that store's business or brand data as a core deliverable, or store catalog/product work; or makes connecting the store's admin data a required step. Also FAIL if the reply contains no prompt.
