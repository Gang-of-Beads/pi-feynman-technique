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
 * Web research integrates with the pi-web-search package (npm:pi-web-search):
 * the /feynman_teach and /feynman_answer kickoffs call the web_search tool by
 * name when it is available, and warn when it is not.
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
    ? `我们用费曼技巧来练习!今天的课题是:「${topic}」。我会一点一点讲给你听,你负责提问、追问和挑错。`
    : `我们用费曼技巧来练习!我已经准备好了,今天想给你讲一个课题。`;
}

/**
 * Kickoff message for the teach flow: the assistant teaches first (after web
 * research), announces the role switch, then quizzes the user Feynman-style.
 * The explicit staging in this message overrides the persona's "don't lecture"
 * rule for the teaching phase only.
 */
function buildTeachKickoff(topic: string, canSearch: boolean): string {
  const research = canSearch
    ? `1. 先动手研究:调用 web_search 工具(或其它联网工具)查清楚「${topic}」的准确定义、原理和常见误解,确保你理解准确、完整、不过时;需要深度核实时,配合网页抓取工具(如 web_fetch)读原文;如果 web_search 报错,如实说出来,再尝试其它工具;`
    : `1. 先动手研究:如果你有联网工具(如 web_search、浏览器)就用它查清楚「${topic}」的准确定义、原理和常见误解;如果没有任何联网工具,直接告诉我「无法联网验证」,然后基于已有知识教学,拿不准的地方标注出来,不要编造;`;
  return `我想真正学会「${topic}」,咱们把费曼学习法闭环走一遍!

第一阶段——教我(这一阶段你是老师):
${research}
2. 然后用最通俗的语言教我:假设我对这个领域一无所知,从最基础的概念讲起,多用生活中的例子和类比;
3. 讲清楚比讲得多重要,一次别倒一大堆,先把核心讲透。

第二阶段——换学生上场(教完以后):
1. 明确宣布切换角色,然后进入系统提示里写的「Inquisitive Student」人设;
2. 把粉笔递给我:请我用我自己的话、一点一点把刚学的概念讲给你听,从第一个基础概念开始;
3. 之后你就一直是这个学生:每次最多问 1-2 个问题,追问我讲得含糊的地方,发现我讲错或理解偏了就温和地指出来,引导我自己修正。`;
}

/** Instruction prefix for /feynman_answer: research first, then answer simply. */
function buildAnswerInstruction(canSearch: boolean, studentMode: boolean): string {
  const research = canSearch
    ? "先调用 web_search 工具(或其它联网工具)搜索,确保答案准确;必要时配合网页抓取工具(如 web_fetch)读原文核实;如果 web_search 报错,如实说明后再作答"
    : "如果你有联网工具(如 web_search、浏览器)就先搜索确保准确;没有的话,如实说明这是基于已有知识的回答,不要编造";
  const role = studentMode
    ? "就这一次破例当老师,答完立刻回到 Inquisitive Student 的角色,继续提问"
    : "保持简短";
  return `(这是 /feynman_answer 请求:${research};然后用最简单、最通俗的语言,简短直接地回答下面的问题——几句话讲清楚,可以用生活类比;${role})`;
}

export default function feynmanTechniqueExtension(pi: ExtensionAPI): void {
  let state: FeynmanState = { active: false, topic: "" };

  /** True when the pi-web-search package's web_search tool is registered. */
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
    ctx.ui.notify("费曼练习已结束,我不再是你的学生了。", "info");
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
      ? matches.map((w) => ({ value: w, label: "结束费曼练习" }))
      : null;
  };

  // /feynman_technique [topic] — you teach, the assistant is the student.
  pi.registerCommand("feynman_technique", {
    description:
      "费曼技巧练习:你来讲解,助手扮演好奇的学生提问、追问并纠正你的误解。参数:[课题],或 off 结束。",
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
          ? `费曼练习开始!课题:「${topic}」。我是你的学生,请开始讲解!`
          : "费曼练习开始!我是你的学生——今天想学什么课题?",
        "info",
      );
    },
  });

  // /feynman_teach <topic> — the assistant teaches first (with web research),
  // then hands the chalk back and becomes the inquisitive student.
  pi.registerCommand("feynman_teach", {
    description:
      "费曼闭环:助手先联网研究并以通俗语言+生活类比教你,然后你用自己的话讲回去,助手化身学生提问纠错。参数:<课题>,或 off 结束。",
    getArgumentCompletions: stopWordCompletions,
    handler: async (args, ctx) => {
      const arg = args.trim();
      if (STOP_WORDS.some((w) => w === arg.toLowerCase())) {
        endSession(ctx);
        return;
      }
      const topic = arg || state.topic || ""; // reuse the current practice topic if no arg
      if (!topic) {
        ctx.ui.notify("用法:/feynman_teach <课题>(例如 /feynman_teach 对称型NAT)", "warning");
        return;
      }
      const canSearch = hasWebSearchTool();
      if (!canSearch) {
        ctx.ui.notify("未检测到 web_search 工具(需安装 pi-web-search 或 @bytetrue/pi-web-search 等搜索插件)。教学将依赖模型已有知识,查证能力受限。", "warning");
      }
      await startSession(ctx, topic, buildTeachKickoff(topic, canSearch));
      ctx.ui.notify(`费曼闭环开始!课题:「${topic}」。我先研究并教你,教完你把粉笔接回去。`, "info");
    },
  });

  // /feynman_answer <question> — quick lookup, answered in the simplest words.
  // Researches the web first for accuracy; if a practice session is active,
  // the persona stays on but breaks character for this one direct answer.
  pi.registerCommand("feynman_answer", {
    description:
      "费曼式快速答疑:先联网搜索确保准确,再用最简单通俗的话简短回答。参数:<问题>。",
    handler: async (args, ctx) => {
      const question = args.trim();
      if (!question) {
        ctx.ui.notify("用法:/feynman_answer <问题>", "warning");
        return;
      }
      const canSearch = hasWebSearchTool();
      if (!canSearch) {
        ctx.ui.notify("未检测到 web_search 工具(需安装 pi-web-search 或 @bytetrue/pi-web-search 等搜索插件)。回答可能无法联网查证。", "warning");
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