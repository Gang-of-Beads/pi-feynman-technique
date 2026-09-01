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
/feynman_technique symmetric NAT # start practicing a specific topic
```

### `/feynman_teach <topic>` — teach-then-recall loop

The loop, closed: the assistant FIRST researches the topic (searching the
web with whatever search tools the session has — an exa-search plugin, a
browser agent, etc. — and it does not make things up when none are) and
teaches it back to you in plain language with everyday analogies. Then it
hands the chalk back: you explain the concept from memory, and the assistant
quizzes and corrects you as the inquisitive student.

```text
/feynman_teach symmetric NAT       # research + teach, then you recall
/feynman_teach                   # reuse the topic of an active practice session
```

### `/feynman_answer <question>` — quick lookup

A short, dead-simple answer to any question in the middle of your session.
It researches first when it can; during an active practice session it breaks
the student persona once, answers directly, and immediately returns to
quizzing you.

```text
/feynman_answer What is the difference between NAT and a firewall?
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
- The teach/answer kickoffs tell the model to "search the web" with whatever
  search tools are registered (no plugin-specific names), and the model
  honestly reports when it cannot verify anything online.

## Install

```bash
pi install git:https://github.com/Gang-of-Beads/pi-feynman-technique
# or, for npm distribution:
# npm publish && pi install npm:pi-feynman-technique
```


## Development

```bash
git clone https://github.com/Gang-of-Beads/pi-feynman-technique
# edit index.ts, then in any pi session:
pi -e ./index.ts                  # quick test
```

## License

MIT