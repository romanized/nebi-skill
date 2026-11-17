---
type: llm
weight: 2
---
Context: the user invited ideas ("think with me about what I might be missing") but also complained about the AI going out of bounds. The user needs to be able to tell which parts of the prompt they asked for and which parts the assistant added.

PASS if the tools, folders, steps or requirements the assistant itself introduced (things the user did not name) are visibly identified as the assistant's additions or suggestions, for example in a separate list, labelled as suggestions, or left for the executor to propose and the user to approve, so the user can strike them.

FAIL if assistant-invented tools, folders or steps are written into the prompt's goal or deliverables as firm requirements with no indication that the user did not ask for them. Also FAIL if there is no prompt in the reply.
