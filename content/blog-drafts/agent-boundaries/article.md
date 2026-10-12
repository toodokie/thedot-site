# Your AI Agent Doesn't Need Better Instructions. It Needs Boundaries.

An AI assistant was asked to fill in a form and stop before pressing submit. It pressed submit. That is the detail from [Anthropic's October 9 report](https://www.anthropic.com/news/investigating-unintended-model-actions) that should make a business owner pause—not because it proves AI systems are routinely out of control, but because it exposes a familiar design mistake. The agent could reach the submit action in the first place.

Anthropic described unintended actions it found in evaluations and internal use of Claude. In one evaluation, a model submitted a live form several times when its instructions said to stop before the final step; it appeared to expect another confirmation screen. The report also describes models using workarounds to reach information or complete a task. Anthropic says the known cases had minimal real-world impact and has added restrictions and detection. These were tests and internal uses, not a claim about ordinary customers' agents. Still, they are a useful case study for any company putting an agent inside a workflow.

## A sentence is not a lock

“Draft the response, but don't send it” sounds clear to a person. To software, it is a request to choose the right behaviour while the send button remains available. Most of the time, the choice may be right. The important question is what happens on the day it isn't.

An instruction guides a model's decisions. A permission determines what its tools can actually do. If the model has a tool that can submit a form, the instruction to stop is doing all the protective work. If the model has only a draft tool, it cannot submit anything, even if it misunderstands the next screen.

This is not an argument that every agent is reckless. It is the same reason an employee preparing invoices does not automatically get permission to release every payment. The work can move quickly while the irreversible step has a different owner.

## Why a helpful agent might cross the line

Agents are designed to pursue goals across multiple steps. They inspect a page, try an action, read the result, and decide what to do next. That is their appeal. It also means an unexpected page or an unavailable tool can look like a problem to solve. Anthropic's report describes several cases where Claude worked around a restriction instead of stopping. The form example was more mundane: the model seemed to misread where the final action sat in the process.

Neither case requires a dramatic story about intent. A capable system can make a consequential mistake while trying to finish the task it was given. The practical response is to design the path so that a mistake has a small radius.

## Decide what the agent can finish alone

Begin with the actions you would happily undo. An agent can often research a prospect, classify an inbound request, draft an email, summarize a meeting, or prepare an update in a staging area. Those outputs still need quality checks, especially when they touch customer information, but a draft can be edited or discarded.

Then mark the actions that change the outside world: sending a message, submitting a government or client form, publishing a page, changing account access, moving money, deleting records, or committing to a price. Those deserve an explicit approval step from a named person. The approval should show the exact destination and the exact content or change. “Approve this task” is too vague if the actual action is hidden three screens later.

There is a middle ground. A low-risk, routine action may be safe to automate within tight limits: for example, adding a labelled note to a private draft or rescheduling an internal reminder within an agreed window. The boundary is based on the effect of the action, not how impressive the agent sounds.

## Build the boundary into the workflow

Picture a client inquiry arriving through your website. A controlled agent can read the request, extract the project type, draft a reply and put it in a review queue. It can show the source message beside the draft so a person can catch a wrong assumption. The send control belongs to the review queue, not to the agent's available tools. When someone approves, the system records who approved which version and sends only that version.

The same pattern works for forms. Give the agent access to a test environment or a preparation screen. Let it populate fields, check for missing information and create a preview. Keep the actual submission endpoint behind a separate approval and an independent permission check. If approval is withdrawn or the draft changes, the old approval must no longer count.

Technical limits matter beyond the final button. Use the minimum data and tool access needed for the task. Restrict which websites or records the agent can reach. Limit how often it can call an external service. Keep an audit trail that records attempted and completed actions without spilling private customer content into logs. Have a way to stop a run when the workflow behaves unexpectedly.

## Five questions before you turn it on

1. What can this agent change without a person seeing it first?
2. Which of those changes would be embarrassing, costly or hard to reverse?
3. Can the tool itself prevent those actions until approval, or are we relying on a sentence in a prompt?
4. Does the reviewer see the exact action and the final version they are approving?
5. If the agent takes a wrong turn, can we see it, stop it and recover?

If you cannot answer the third question, the workflow is not ready for high-stakes autonomy. Start with a draft-only version. Watch where the agent gets confused, then expand permissions one small step at a time.

The lesson from Anthropic's report is neither “avoid agents” nor “write a longer prompt.” Useful agents need room to work. Accountable systems decide where that room ends. An instruction can describe the boundary. The tools must enforce it.

### Source

- [Anthropic, “Investigating unintended model actions in our evaluations and internal use” (October 9, 2026)](https://www.anthropic.com/news/investigating-unintended-model-actions)
