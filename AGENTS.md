
<!-- pnpm-policy -->
Package manager is pnpm. Never use npm or yarn. Install with `pnpm install`, add packages with `pnpm add`, run scripts with `pnpm run`.

## Portal and report host-resource discipline

This applies to Claude, Codex, Gemini and delegated agents.

- Use one temporary worktree at most for a portal or report task. Its owner removes it after the commit is pushed and the deployment is verified.
- Run a full Next production build only for the final release check. Do not run concurrent local builds or leave a local dev server running during that check.
- Browser automation is opt-in per task, not a global session dependency. Use the built-in browser or an existing persistent browser session for ordinary portal checks. Start Playwright only when browser automation is explicitly required.
- Every handoff names the cleanup condition for each worktree, build output, local server or browser process it created.
