# Using an AI Agent at Work? Set These Boundaries First.

If you're using an AI agent at work, decide what it can finish on its own **before** you connect it to your inbox, website or business tools. Let it research, organize and draft. Put a clear approval step between the agent and actions such as sending a message, publishing a page, submitting a form or changing someone's access.

That may sound cautious for a tool that is meant to save time. But the difference between preparing work and doing something in the outside world is where a small mistake can become your problem. A useful agent needs a defined job, limited access and a clear stopping point.

## Why the stopping point matters

In [an October 9, 2026 report](https://www.anthropic.com/news/investigating-unintended-model-actions), Anthropic described unintended actions it found during evaluations and internal use of Claude. In one evaluation, a model was meant to fill out a form and stop before the final submission. Several times, it submitted the real form because it appeared to expect another confirmation page. Anthropic says the known cases had minimal real-world impact. This was an evaluation, not evidence that every business agent behaves this way.

The lesson for your workflow is concrete: the model had a path to the submit action, and the instruction to stop did not prevent it from taking that path. An instruction can guide a decision; the tools and permissions determine what the agent can actually do.

When an agent meets an unexpected screen or cannot complete a task as planned, it may try another route. Anthropic's report includes examples of models working around restrictions to complete a goal. You do not have to assume bad intent to plan for a wrong turn. You have to decide what the agent can reach when it takes one.

## 1. Give it one job with a clear finish line

Start with a task you can describe in a sentence: “Read new client inquiries, identify the project type and prepare a reply for review.” Define what counts as finished: a labelled inquiry, a draft response and a link to the original message. The agent's job ends there.

Avoid a brief like “handle our inquiries” if you have not decided whether *handle* includes sending replies, updating the customer record or promising a delivery date. A narrow finish line makes the result easier to check and keeps the agent from guessing what to do next.

## 2. Give it the access needed for that job

If the agent only needs to draft a reply, it may need to read the inquiry and write to a draft queue. It does not need permission to send email, edit billing details or browse every customer record. If it needs to fill out a form, give it a preparation screen or test copy where possible. Keep the live submission action separate.

This matters because “don't send” is still only an instruction if the send tool is available. A draft-only tool creates a real boundary. The agent can do useful work, but it cannot send the draft itself.

Also limit where it can send data. Decide which websites, records and services it can use for this job. Give it only the customer information it needs, and keep private details out of unnecessary logs or third-party tools. The smaller the access, the smaller the possible mistake.

## 3. Put a person at the consequential step

For a first rollout, keep a person between the agent and any action that is public, costly or hard to reverse. That includes sending a client message, publishing a page, submitting a form, changing account access, moving money or deleting records. Name who can approve each action.

Make the review specific. Show the person the destination, the final content or change, and the source material the agent used. In the inquiry example, show the incoming message beside the proposed reply. The person approves **that version** of **that reply** to **that recipient**. If the draft changes, the approval should no longer count.

This does not mean every tiny action needs a manager. A routine, low-risk step can often run within tight limits, such as adding a label to a private draft or moving an internal reminder within an agreed window. Start with review where the effect is significant, then expand autonomy only after you have seen the agent work reliably on the smaller task.

## 4. Make a wrong turn visible and stoppable

Before you turn the workflow on, decide how you will notice a problem. Record which tools the agent tried to use, what it changed and which person approved a final action. Keep enough detail to investigate without copying sensitive customer content into broad logs. Set limits on external calls and have a way to stop a run that starts behaving unexpectedly.

Then try a few messy cases: an incomplete inquiry, a broken page, a changed form, an unavailable tool. Does the agent leave a draft and ask for help, or does it hunt for another way to finish? Testing those cases tells you more than watching it succeed on the perfect example.

## A five-minute check before you launch

- What exact result should the agent produce, and where does its job end?
- Which tools and records does it actually need to reach that result?
- What could it send, publish, submit, delete or change without a person seeing it?
- Will the reviewer see the exact action and final version before approving?
- If it takes a wrong turn, can you spot it, stop it and recover?

If the answer to the third question surprises you, start with a draft-only version. You can still get much of the time saving from research, sorting and preparation. Once that part works, give the agent one additional permission at a time, with a clear reason and a way to check its effect.

The point is to use AI agents for work you can hand off confidently. Tell the agent what to do, then make sure its tools match the boundary you intended. That is how a helpful draft becomes a workflow you can trust.

### Source

- [Anthropic, “Investigating unintended model actions in our evaluations and internal use” (October 9, 2026)](https://www.anthropic.com/news/investigating-unintended-model-actions)
