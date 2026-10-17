# agent-shell

A Claude Code mod: a pane that shows every Bash command any agent runs (the main agent and subagents) as a terminal box. Each box has a short title, and opens to the command after a `$` prompt with its full output below. Run `/agent-shell` to open the pane. The mod also asks the model to give every Bash call a very short `description`, which becomes the box title.

## Install

```
/plugin install agent-shell --marketplace poldap/agent-shell
```

Answer `y` to add the marketplace, then pick a scope.
