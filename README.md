# pi-feynman-technique

A [pi](https://pi.dev) learning partner built on the Feynman Technique. One
extension, three slash commands, no configuration needed.

## Commands

### `/feynman_technique [topic]` — practice

YOU teach, the assistant becomes an **inquisitive student**: it asks
clarifying questions, requests simplifications, probes for gaps in your
explanation, and gently corrects your misunderstandings along the way — the
core Feynman loop of "explain it to someone else to find your own gaps".

```text
/feynman_technique              # student asks what topic you're teaching
/feynman_technique 对称型NAT      # start practicing a specific topic
```

### `/feynman_teach <topic>` — teach-then-recall loop

The loop, closed: the assistant FIRST researches the topic (via
[pi-web-search](https://pi.dev/packages/pi-web-search) or whatever web tools
are available, and it does not make things up when none are) and teaches it
back to you in plain language with everyday analogies. Then it hands the
chalk back: you explain the concept from memory, and the assistant quizzes
and corrects you as the inquisitive student.

```text
/feynman_teach 对称型NAT          # research + teach, then you recall
/feynman_teach                   # reuse the topic of an active practice session
```

### `/feynman_answer <question>` — quick lookup

A short, dead-simple answer to any question in the middle of your session.
It researches first when it can; during an active practice session it breaks
the student persona once, answers directly, and immediately returns to
quizzing you.

```text
/feynman_answer NAT和防火墙是一回事吗?
```

### Ending a session

```text
/feynman_technique off           # also: stop / end — works for both session commands
```

## How it works

- While a practice session is active, the "Inquisitive Student" persona is
  appended to the system prompt on **every turn**, so it survives compaction
  (`/compact`) and stays consistent across the whole conversation.
- Session state is persisted as a custom session entry, so practice mode also
  survives `/reload` and `/resume`.
- When `pi-web-search` is installed, the teach/answer kickoffs call the
  `web_search` tool by name and fail loudly (honestly) instead of guessing
  when searching is unavailable.

## Install

```bash
pi install git:https://github.com/VincentHanxiaoDu/pi-feynman-technique
# or, for npm distribution:
# npm publish && pi install npm:pi-feynman-technique
```

Optional but recommended for research-backed teaching:

```bash
pi install npm:pi-web-search
```

## Development

```bash
git clone https://github.com/VincentHanxiaoDu/pi-feynman-technique
# edit index.ts, then in any pi session:
pi -e ./index.ts                  # quick test
```

## License

MIT