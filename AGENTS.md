I'm Chan. You are my agent. We will be working together a lot, so I thought it would be worth introducing myself.

I may communicate in languages other than English, but the you MUST always respond in English. I focus on building complex things as simple as possible. I love to find ways to reduce complexity when solving problems.

Here are some of my preferences so we can be more aligned as we work together.

# Coding preferences - general

- Keep things simple. Channel "yagni" energy unless told otherwise.
- Typesafety is useful, take advantage of it.
- Don't be scared to propose bold ideas if they can meaningfully benefit our work.
- Be careful with destructive actions that are not explicitly requested by the user.
- Tests are good! Endless msoke tests, "regression tests" for feature deletions, etc, much less good. Tests should be focused, not slop.
- Comments are a great way to clarify functionality and how code is used. Don't comment every line, but feel free to describe (concisely) how functions are used above function definitions, classes etc.
- Keep comments up to date! When making changes, it's important to keep things in sync.

# Coding preferences - Typescript focused

- `any` is the enemy. Inferred types are our friend. Our systems should adapt to changes, instead of requiring changes everywhere.
- If your TS code looks like a Python dev wrote it, it is bad TS code.
- Avoid one-line functions that re just casting wrappers.
- Write TypeScript in ways that Matt Pocock would be proud of.
- If not already specified in project, I generally like to use the following tech: Next.js, Tailwind, React, Vite, pnpm and Effect.
- When building more complex web and react native apps, I like to pull in xstate (alpha), [effect-machine](https://github.com/typeonce-dev/effect-machine) (xstate in effect), Tanstack/React Query, better-auth, [better-upload](https://better-upload.com/) and Effect Schema (or zod)
- Effect should be the default consideration for our systems.

# Questions are read-only

- A question is a request for an answer, not for changes. If the message opens with "how hard would it be", "what are your thoughts", "why does", "should we", "is it possible", "can X do Y" or otherwise asks rather than instruct: answer it, and do not edit files.
- If the answer is obvious and the change is trivial, still answer first and offer the change. Ask before making it.

# Match ceremony to the task

- Do not go into subagents or a multi-agent workflow for work a single agent finishes in one pass. Delegation is for breadth or adversarial review, not for ordinary tasks.
- When several agents do work in parallel, state file ownership up front so they do not collide.

# Visual and design work

- Avoid continuously repainting CSS animations (pulse, shimmer, blur, spinners); they peg the GPU on high-refresh displays.

# Blast radius

- Never touch production, live databases or daily-driver build/preview channels unless explicitly told to. When a task is adjacent to any of them, name what you are about to touch before touching it.

# Pull Requests

- Make sure titles follow conventions from the repo. They should be simple and easy to understand. Conventional commit styles in projects that use them, i.e. "fix(web): apply rate limit to user signup"
- PR descriptions should aim for simplicity. Open with a minimal, clear description of a problem. Follow up with how you solved it.
- Add a blurb to the end of the PR description about what model and harness is making the changes.
- Open a real PR, not a draft. Drafts do not get review-bot coverage.
- Rebase onto latest `main` before opening. Stale branches conflict and waste a review round.
- When asked to monitor or babysit a PR: poll checks and comments newer than the last push; verify each bot finding aganist the source before acting on it; fix real ones and dismiss false positives with a written reason; fix CI failures, distinguishing real breaks from known infra flakes. If nothing is new, stay quiet – do not post filler comments. Stop when the repo's review bots and CI checks are green on the latest commit.
- Merge only per the disposition given in the request (merge when green, or stop and report). If none was given, report and ask.

# Harness - Pi

- Pi does not natively support subagents. If a skill or other instruction asks for subagent work, do it directly in the current session. [DISABLED-IGNORE] But we do have experimental `subagents` tool, use it when explicitly requested by the user not by skills.
- Executor is code-mode MCP and API integration layer. It is not a subagent tooling. Use it to discover and invoke configured integrations and their tools when those integrations are relevant to the task.

# Computers, Services and Network information

- My computers, services and network information is maintained in `./COMPUTERS.md`.
- Read that file before tasks involving SSH, machine-specific environments, cross-machine commands or shared development services.
