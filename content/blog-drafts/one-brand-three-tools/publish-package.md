# On-brand Reels | Publication package

| Field | Draft value |
| --- | --- |
| H1 | Your Brand, Your Tool: Make On-Brand Reels Faster |
| Slug | `make-on-brand-reels-faster` |
| SEO title | Make On-Brand Reels Faster with Canva, ChatGPT or Claude Design |
| Meta description | Use Canva, ChatGPT or Claude Design to borrow an agency's content process: approved brand assets, a clear brief and a repeatable Reel format. |
| Excerpt | Borrow a design agency's process with the AI tool you already use. Set your brand rules, save a repeatable Reel format and make polished posts faster. |
| Proposed publication date | Tuesday, October 20, 2026, before Reel 01 at 2:00 p.m. Toronto time |
| Category | Design |
| Tags | Strategy; How-To |
| Open Graph title | Your Brand. Your Agent. Your Next Reel. |
| Open Graph description | Borrow an agency's content process, teach your AI tool your brand and make your next Reel with a repeatable format. |
| Feature and social image | Revised cover pending visual proof; old three-tool cover must be replaced before release |
| Article URL after publication | `https://www.thedotcreative.co/blog/make-on-brand-reels-faster` (proposed, not live) |
| Notion draft | https://app.notion.com/p/3f7d0f0c254481319d56c9a758e09de8 · `In Review`, hidden from the website |

Article: [article.md](article.md). Revised Reel script for review: [reel-script-for-review.md](instagram/reel-script-for-review.md). The guide teaches agent-assisted asset discovery, human approval, one reusable Reel format, and three practical paths: Canva, ChatGPT plus Canva, or Claude Design plus the reader's usual video editor. The website adds an interactive route selector for this slug, while the Notion article retains a plain-text route map. The old carousel assets and cover are superseded and must be replaced before release. The current Notion row remains In Review, with the old cover attached until the new visual direction is approved.

## Review notes

- The article is a practical guide. It names each tool only where the reader needs a setup step, account limit or handoff.
- The website blog renderer skips Notion tables and image blocks, so the route selector is a site component shown only on this article. The Notion draft stays readable without it.
- The selector's three short answers live in `src/components/BlogWorkflowSelector.tsx`; check them against the Notion article whenever a route changes.
- Canva Brand Kit and connector access can vary by account, plan and admin settings. The copy states those limits.
- Canva's AI Connector can search Canva designs and folders, create folders, copy designs and move selected items. It cannot see unrelated sources without a separate connection, and its documentation does not promise Brand Kit population. The article keeps Brand Kit entry as a checked owner step.
- VS Code and Cursor appear only as an optional way to inventory local brand files and maintain an approved text pack. The five Reels keep the general business-owner path. Canva's Dev MCP is explicitly distinguished from its everyday design connector.
- Claude Design is available on Free, Pro, Max, Team and Enterprise. Its reusable design systems are beta on Pro, Max, Team and Enterprise; Enterprise needs owner enablement. The separate claude.ai/design site closes December 14, 2026, so the article sends new users to Design within Claude.
- Claude Design artboards do not promise a finished Reel MP4. Its route ends in the reader's usual video editor. Claude Motion is a separate Team/Enterprise beta for code-based animations, not realistic footage.
- The coffee campaign is an illustrative creative example. Product details and results are not represented as facts about a client.
- `Design`, `Strategy`, and `How-To` are existing Notion options. Once the new static cover is approved and deployed, replace the Notion Featured Image and set the `Social Image` property to its production URL. Confirm the site image and Instagram bio link resolve before release.
- Proposed social order: Reel 01 Oct 20, Reel 02 Oct 21, anonymous client case study Oct 22, Reel 03 Oct 23, Reel 04 Oct 26, Reel 05 Oct 27, all at 2:00 p.m. Toronto. Nothing is queued.

## Sources

- https://developers.google.com/fonts/
- https://www.canva.com/help/brand-kit/
- https://www.canva.com/help/mcp-agent-setup/
- https://www.canva.com/help/mcp-canva-usage/
- https://www.canva.com/help/using-canva-ai/
- https://www.canva.com/help/connect-chatgpt-to-canva/
- https://help.openai.com/en/articles/10169521-projects-in-chatgpt
- https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design
- https://www.canva.com/help/connect-claude-to-canva/
- https://support.claude.com/en/articles/14604416-get-started-with-claude-design
- https://support.claude.com/en/articles/17454997-get-started-with-claude-motion
- https://support.claude.com/en/articles/16994751-artifacts-admin-guide-for-team-and-enterprise-plans
- https://www.canva.com/help/using-brand-templates/
- https://code.visualstudio.com/docs/agents/reference/workspace-context
- https://docs.cursor.com/en/agent/tools
- https://www.canva.dev/docs/apps/dev-mcp-server/
