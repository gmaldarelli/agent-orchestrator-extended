---
"@aoagents/ao-cli": patch
---

fix(cli): make `ao open` work cross-platform

`ao open` was effectively macOS-only: it sourced sessions from
`tmux list-sessions` (empty without tmux) and shelled out to the
`open-iterm-tab` helper. Sessions running under `runtime-process`
(the default on Windows) didn't show up at all.

Now uses `sm.list()` as the source of truth so every runtime is covered,
and branches the open action per platform — `open-iterm-tab` stays the
macOS path, with native handling on Windows and Linux.
