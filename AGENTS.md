# Tour agent entry point

Follow [organization rules](https://github.com/UMN-VR/.github/blob/main/AGENTS.md)
(locally `../.github/AGENTS.md`).

- Never delete `.local/youvisit-backup/`; it is the only copy.
- Edit scene inputs, not generated scenes. Globe features belong in FOSS Earth;
  use public exports rather than copies or deep imports.
- Temporary servers for autonomous checks must be stopped before returning unless
  the user explicitly requests otherwise. Publish/deploy only when specifically asked.

| Task | Read |
| --- | --- |
| Setup / commands / phone HTTPS | Relevant [README](README.md) headings |
| Scene inputs / ownership / checks / publishing | [Tour task guidance](docs/agent-reference.md) before editing |
| Device build identity / faults / pending work | [Version](docs/which-version.md), [reports](docs/bug-reporting.md), [roadmap](docs/roadmap.md) |
| Custom user test | [Feedback workflow](https://github.com/foss-earth/docs/blob/main/docs/test-feedback.md) |

For temporary autonomous checks, use `npm run llm-dev` (HTTPS and network
links remain; no environment key is supplied). Stop every server and child process you start before returning,
unless the user explicitly asks you to keep it running; leave others' servers
alone. For user testing, give them the command below to run in their own terminal:

```sh
cd ~/gh/UMN-VR/tour && npm run dev
```
