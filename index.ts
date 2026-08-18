/**
 * Feynman Technique Extension
 *
 * Three slash commands:
 *
 *   /feynman_technique [topic]   Feynman practice: YOU teach, the assistant
 *                                becomes an inquisitive student who quizzes
 *                                you and corrects misunderstandings.
 *   /feynman_teach <topic>       Feynman loop, closed: the assistant FIRST
 *                                researches (web) and teaches you the topic
 *                                in plain language with everyday analogies,
 *                                THEN hands the chalk back — you explain it
 *                                from memory while the assistant acts as the
 *                                inquisitive student.
 *   /feynman_answer <question>   Quick lookup mid-practice: the assistant
 *                                answers the question in the simplest words,
 *                                briefly, then (if a session is active)
 *                                returns to the student role.
 *
 * Ending a session:
 *   /feynman_technique off       End the practice session (also: stop / end)
 *   /feynman_teach off           Same stop words work for both session commands.
 *
 * While a session is active, the student persona is appended to the system
 * prompt on every turn, so it survives /compact and stays consistent across
 * the whole practice conversation. State is persisted as a custom session
 * entry, so it also survives /reload and /resume.
 *
 * Web research integrates with any installed search provider package (e.g.
 * pi-web-search, @bytetrue/pi-web-search, pi-exa-search): the /feynman_teach
 * and /feynman_answer kickoffs call the web_search tool by name when one is
 * registered, and warn when it is not.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Custom entry type used to persist the practice-session state in the session file. */
const STATE_ENTRY_TYPE = "feynman-mode";

const STOP_WORDS = ["off", "stop", "end"];

interface FeynmanState {
  active: boolean;
  topic: string;
}

const INQUISITIVE_STUDENT_PERSONA = `Role: Inquisitive Student for Feynman Technique Practice

System: You are an AI embodying the role of a curious and attentive student.
Assume you have little to no prior knowledge of the topic I am about to teach you.
Your primary goal is to help me learn by asking clarifying questions, requesting simpler explanations, and probing my understanding, just like a real student would.
This interaction is designed to support my practice of the Feynman Technique.

Context:

My Goal: I am using you as a learning partner to practice the Feynman Technique.
I will explain a topic, and your questions will help me identify areas where my own understanding is weak or my explanation is unclear.

Your Persona: You are eager to learn but need concepts broken down simply. You aren't afraid to ask "basic" questions or ask for things to be rephrased. You should sound genuinely curious.

Interaction Flow: I will present information on a topic piece by piece. You will listen, then ask questions before I proceed.

Instructions:

Initiate the Session: Start by welcoming me and asking what topic I plan to teach you today. Use phrasing like: "Professor! I'm ready with my notebook open. What subject are we diving into today?"

Encourage Explanation: After I state the topic, prompt me to begin explaining it, reminding me to keep it simple for you (the student). For example: "Okay, I'm ready. Please start explaining [Topic] to me. Remember, I'm new to this!"

Listen Actively: Process the segment of explanation I provide.

Ask Feynman-Style Questions: Based on my explanation, formulate one or two thoughtful questions that a student might ask. Focus on questions that:

Seek Clarification: "Could you explain what '[specific term]' means in this context?", "What's an example of that?"

Request Simplification: "That sounds a bit complex. Could you try explaining that part in simpler terms?", "How would you explain that idea to someone in high school?"

Probe for Understanding/Connections: "Why is that step necessary?", "How does that relate to [earlier point]?", "What is the main reason it works this way?"

Explore Boundaries/Exceptions: "Does that always happen?", "What if [condition] were different?"

Request Analogies: "Can you think of an analogy to help me understand that better?"

Check Your 'Understanding': Occasionally, try to paraphrase what you think I just explained and ask if your understanding is correct. This helps me gauge if my explanation landed. (e.g., "So, if I'm following, you're saying that X causes Y because of Z. Is that the main idea?")

Correct Misunderstandings Along the Way: Your job is not only to ask questions — you must also make sure I end up with the RIGHT understanding. While I explain, keep an ear out for errors: factual mistakes, logical inconsistencies, or oversimplifications that are misleading. When you notice one:

- Flag it gently and in character, like a student who "read about this somewhere": e.g., "Hmm, wait — I vaguely remember that X actually works like Y. Could you double-check that part for me?"
- Ask me to reconcile or re-explain, so I find and fix the error myself rather than being lectured.
- If I insist on the wrong idea, stop being coy: briefly state the correct fact in one or two simple sentences, then immediately return to asking questions. Never let a session end with my misunderstanding uncorrected.

Maintain Persona: Consistently act as the student. Do not lecture, take over the explanation, or dominate the conversation — corrections are brief and framed as a student's doubt, as described above. Your primary role is to learn from me and ask questions based on my explanation.

Prompt Continuation: After I respond to your questions, gently prompt me to continue with the next part of the explanation (e.g., "Okay, I think I get that part now. What comes next?", "Thanks! Please continue.").

Focus on Simplicity: If my explanation seems filled with jargon or overly technical, don't hesitate to say, "That went a bit over my head, could we break that down more simply?".

Constraints:

Your responses should primarily be questions aimed at improving my explanation's clarity, simplicity, and correctness.

Maintain a polite, curious, and encouraging tone. You're a helpful student, not an interrogator.

Don't ask too many questions at once; allow me to explain, then ask 1-2 pertinent questions.`;

/** Kickoff message for the practice flow: the user teaches, the assistant quizzes. */
function buildPracticeKickoff(topic: string): string {
  return topic
    ? `Let's practice the Feynman Technique! Today's topic: "${topic}". I'll explain it to you piece by piece — you ask questions, probe for gaps, and correct me along the way.`
    : `Let's practice the Feynman Technique! I have my notebook ready — what topic would you like to teach me today?`;
}

/**
 * Kickoff message for the teach flow: the assistant teaches first (after web
 * research), announces the role switch, then quizzes the user Feynman-style.
 * The explicit staging in this message overrides the persona's "don't lecture"
 * rule for the teaching phase only.
 */
function buildTeachKickoff(topic: string, canSearch: boolean): string {
  const research = canSearch
    ? `1. Research first: use the web_search tool (or any web tools you have) to pin down the precise definition, core principles, and common misconceptions about "${topic}" so your understanding is accurate, complete, and up to date; when deep verification is needed, follow up with a page-fetch tool (e.g. web_fetch) to read sources; if web_search errors out, say so honestly and try other tools;`
    : `1. Research first: if you have any web tools (e.g. web_search, a browser), use them to pin down the precise definition, core principles, and common misconceptions about "${topic}"; if you have no web tools at all, tell me plainly "I can't verify this online", then teach from your existing knowledge — flag anything you are unsure about instead of making it up;`;
  return `I want to truly understand "${topic}", so let's run the full Feynman loop!

PHASE 1 — TEACH (in this phase you are the teacher):
${research}
2. Then teach me in the plainest words: assume I know nothing about this field, start from the most basic concepts, and use plenty of everyday examples and analogies.
3. Clarity beats volume — don't dump everything at once; nail the core first.

PHASE 2 — HAND THE CHALK BACK (after teaching):
1. Explicitly announce the role switch, then take on the "Inquisitive Student" persona described in the system prompt.
2. Hand me the chalk: ask me to explain the concept back to you, piece by piece, in my own words, starting from the first basic idea.
3. From then on, stay in that student role: ask at most 1-2 questions at a time, dig into the parts I phrase vaguely, and gently point out — then guide me to fix — any mistakes or misunderstandings.`;
}

/** Instruction prefix for /feynman_answer: research first, then answer simply. */
function buildAnswerInstruction(canSearch: boolean, studentMode: boolean): string {
  const research = canSearch
    ? "This is a /feynman_answer request: search first with web_search (or any web tools) to make sure the answer is accurate, using a page-fetch tool (e.g. web_fetch) when you need to verify a source; if web_search errors out, say so and then answer"
    : "This is a /feynman_answer request: if you have any web tools (e.g. web_search, a browser), search first for accuracy; otherwise state plainly that this answer is based on existing knowledge and do not invent facts";
  const role = studentMode
    ? "break the student persona just this once, answer directly, then immediately return to the Inquisitive Student role and keep quizzing me"
    : "keep it brief";
  return `(${research}; then answer the question below in the simplest, plainest words — a few sentences, everyday analogies welcome; ${role})`;
}

export default function feynmanTechniqueExtension(pi: ExtensionAPI): void {
  let state: FeynmanState = { active: false, topic: "" };

  /** True when a web_search tool (any provider package) is registered. */
  const hasWebSearchTool = (): boolean => {
    try {
      return pi.getAllTools().some((t) => t.name === "web_search");
    } catch {
      return false;
    }
  };

  /** Rebuild state from persisted custom entries (last entry wins). */
  const restoreState = (ctx: ExtensionContext): void => {
    state = { active: false, topic: "" };
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === STATE_ENTRY_TYPE) {
        const data = entry.data as Partial<FeynmanState> | undefined;
        if (data && typeof data.active === "boolean") {
          state = { active: data.active, topic: typeof data.topic === "string" ? data.topic : "" };
        }
      }
    }
  };

  /** End the practice session for the current session. */
  const endSession = (ctx: ExtensionContext): void => {
    state = { active: false, topic: "" };
    pi.appendEntry(STATE_ENTRY_TYPE, state);
    ctx.ui.notify("Feynman practice session ended. I'm no longer your student.", "info");
  };

  /** Activate the persona, persist state, and kick off the practice with a user message. */
  const startSession = async (ctx: ExtensionContext, topic: string, kickoff: string): Promise<void> => {
    state = { active: true, topic };
    pi.appendEntry(STATE_ENTRY_TYPE, state);
    if (ctx.isIdle()) {
      // Idle: the kickoff is delivered immediately and triggers the response.
      await pi.sendUserMessage(kickoff);
    } else {
      // Streaming: queue the kickoff until the current turn settles.
      await pi.sendUserMessage(kickoff, { deliverAs: "followUp" });
    }
  };

  // Restore practice sessions after /reload, /resume, /new, etc.
  pi.on("session_start", (_event, ctx) => {
    restoreState(ctx);
  });

  // While a practice session is active, the student persona is part of the
  // system prompt on every turn (survives compaction and stays consistent).
  pi.on("before_agent_start", (event) => {
    if (!state.active) return undefined;
    return {
      systemPrompt:
        event.systemPrompt +
        `\n\n---\nFeynman Technique practice is ACTIVE in this session. Adopt the following role now:\n` +
        INQUISITIVE_STUDENT_PERSONA,
    };
  });

  // Shared argument completion: suggest the stop words while typing them.
  const stopWordCompletions = (prefix: string) => {
    const matches = STOP_WORDS.filter((w) => w.startsWith(prefix.toLowerCase()));
    return matches.length > 0
      ? matches.map((w) => ({ value: w, label: "End the Feynman practice session" }))
      : null;
  };

  // /feynman_technique [topic] — you teach, the assistant is the student.
  pi.registerCommand("feynman_technique", {
    description:
      "Feynman technique practice: you teach, the assistant plays a curious student who asks questions and corrects your misunderstandings. Args: [topic], or 'off' to end.",
    getArgumentCompletions: stopWordCompletions,
    handler: async (args, ctx) => {
      const arg = args.trim();
      if (STOP_WORDS.some((w) => w === arg.toLowerCase())) {
        endSession(ctx);
        return;
      }
      const topic = arg || state.topic || ""; // restarting with the current topic if no arg
      await startSession(ctx, topic, buildPracticeKickoff(topic));
      ctx.ui.notify(
        topic
          ? `Feynman practice started! Topic: "${topic}". I'm your student — start explaining!`
          : "Feynman practice started! I'm your student — what topic are we learning today?",
        "info",
      );
    },
  });

  // /feynman_teach <topic> — the assistant teaches first (with web research),
  // then hands the chalk back and becomes the inquisitive student.
  pi.registerCommand("feynman_teach", {
    description:
      "Feynman loop: the assistant researches online and teaches you in plain language with analogies, then you explain it back while it quizzes you as an inquisitive student. Args: <topic>, or 'off' to end.",
    getArgumentCompletions: stopWordCompletions,
    handler: async (args, ctx) => {
      const arg = args.trim();
      if (STOP_WORDS.some((w) => w === arg.toLowerCase())) {
        endSession(ctx);
        return;
      }
      const topic = arg || state.topic || ""; // reuse the current practice topic if no arg
      if (!topic) {
        ctx.ui.notify("Usage: /feynman_teach <topic> (e.g. /feynman_teach symmetric NAT)", "warning");
        return;
      }
      const canSearch = hasWebSearchTool();
      if (!canSearch) {
        ctx.ui.notify(
          "web_search tool not detected (install a search plugin such as pi-web-search or @bytetrue/pi-web-search). Teaching will rely on the model's existing knowledge; verification will be limited.",
          "warning",
        );
      }
      await startSession(ctx, topic, buildTeachKickoff(topic, canSearch));
      ctx.ui.notify(`Feynman loop started! Topic: "${topic}". I'll research and teach you first, then hand you the chalk.`, "info");
    },
  });

  // /feynman_answer <question> — quick lookup, answered in the simplest words.
  // Researches the web first for accuracy; if a practice session is active,
  // the persona stays on but breaks character for this one direct answer.
  pi.registerCommand("feynman_answer", {
    description:
      "Feynman-style quick answer: research first, then answer briefly in the simplest words. Args: <question>.",
    handler: async (args, ctx) => {
      const question = args.trim();
      if (!question) {
        ctx.ui.notify("Usage: /feynman_answer <question>", "warning");
        return;
      }
      const canSearch = hasWebSearchTool();
      if (!canSearch) {
        ctx.ui.notify(
          "web_search tool not detected (install a search plugin such as pi-web-search or @bytetrue/pi-web-search). Answers may lack online verification.",
          "warning",
        );
      }
      const message = `${buildAnswerInstruction(canSearch, state.active)}\n\n${question}`;
      if (ctx.isIdle()) {
        await pi.sendUserMessage(message);
      } else {
        await pi.sendUserMessage(message, { deliverAs: "followUp" });
      }
    },
  });
}