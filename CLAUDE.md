# Project rules for Claude Code

Hard rules for working in this repository. Follow them exactly — they override default behavior.

## Git workflow

- **Every session works on its own feature branch.** Before making any change, run `git fetch origin` and create a dedicated branch off `origin/main`:

  ```
  git checkout -b <feature> origin/main
  ```

  Never commit onto `main`, and never commit onto a branch another session is already using.

- **This checkout is shared by multiple concurrent Claude sessions.** Do not switch the shared checkout's branch out from under other sessions — it wipes their in-flight work. For anything you'll commit, prefer an isolated worktree:

  ```
  git worktree add .claude/worktrees/<name> <branch>
  ```

- **Commit early.** Don't leave edits uncommitted across many steps; another session's build can auto-stash and clear the shared working tree.

- **Branch from `origin/main`, not local `main`** — local `main` lags behind origin.

- **Treat stray files from unrelated features as another session's live WIP** — never stage, commit, or delete them.
