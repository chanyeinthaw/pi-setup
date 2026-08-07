# Monochrome Research Document Style Guide

## Purpose

Use this style for technical research reports, engineering proposals, architecture decisions, cost analyses, performance investigations, and decision briefs. It must make evidence inspectable and recommendations challengeable.

The result should resemble a carefully typeset internal engineering report in a browser—not a marketing page, slide deck, admin dashboard, or raw Markdown export.

## How it reads

### Voice

Use an evidence-led technical business-case voice. The prose is direct, precise, calm, candid about uncertainty, technically credible, understandable without oversimplification, and oriented toward a decision.

Prefer:

> The production service averaged 2.5% CPU in July. Because examination traffic is scheduled, continuously provisioning peak capacity is not economically aligned with the workload.

Avoid:

> This revolutionary serverless transformation unlocks massive efficiency and unparalleled scalability.

### Claim discipline

| Class | Meaning | Typical phrasing |
|---|---|---|
| Observed | Direct evidence | “CloudWatch recorded…” |
| Calculated | Arithmetic from evidence | “At the published rate, this equals…” |
| Estimated | Assumption-dependent planning value | “The expected range is…” |
| Proposed | Recommended future state | “Start with…” |

Do not mix classes without making the transition explicit.

### Information order

Lead with the decision, not the research journey:

1. Problem.
2. Most important evidence.
3. Recommendation.
4. Expected cost or impact.
5. Constraints and risks.
6. Validation and rollout.
7. Decision request.

Detailed methodology belongs later or in appendices.

### Titles

Express a decision, finding, or tension.

Good:

- “Reduce idle infrastructure cost without reducing exam-day capacity.”
- “Direct SQL removes the connection bottleneck under constrained CPU.”
- “Move static delivery out of the application request path.”

Weak: “Infrastructure Report,” “Performance Analysis,” or “Workload-Aligned Capacity.”

### Numbers

Include currency and period, timezone for traffic windows, ranges for uncertain attribution, consistent precision, and formulas for important estimates. State exclusions. Avoid decimals unsupported by source precision.

### Recommendations

Make them actionable and testable:

> Approve a non-production prototype. Keep ECS and Aurora available until the complete examination workflow passes representative load testing.

## How it feels

It should feel serious, calm, inspectable, authored, restrained, operationally realistic, credible in print, and useful in a review meeting.

It should not feel glossy, playful, promotional, app-like, card-heavy, excessively spacious, noisy, or dependent on animation.

## How it looks

### Palette

Black and white only:

```css
--ink: #000;
--paper: #fff;
--rule: #000;
--soft-rule: #999;
```

Use words, border weight, hatching, and typography—not color—for status.

### Typography

```css
font-family: ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Monaco,
  Consolas, "Liberation Mono", "Courier New", monospace;
font-size: 15px;
line-height: 1.58;
```

Use bold sparingly for labels, totals, and decisions.

### Primary layout

Desktop:

```text
[ sticky outline, ~220px ] [ report column, max 980px ]
```

Center the shell with approximately 24–42px between sidebar and report. Keep prose under roughly 90 characters per line.

### Sidebar

The outline is navigation, not an app menu.

```css
.rail {
  position: sticky;
  top: 24px;
  align-self: start;
  height: fit-content;
}
```

Never add `height: 100vh`, `height: calc(...)`, stretching `min-height`, or `overflow: auto`. Those cause empty space or nested scrolling. The border must end after content.

Include short report identity, version/category, divider, section links, and optional status/confidence. On mobile, make it a normal block with links in two columns. Hide it in print.

### First page

Use a heavy top rule, small identifier, decision-oriented title, short thesis, dominant recommendation block, direct comparison, one result strip, short recommendation, metadata line, and one-line caveat.

Wireframe:

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REPORT / CATEGORY / STATUS

Decision-oriented title.

Two- or three-line thesis.

┌ RECOMMENDED TARGET ─────────────────┐
│ Normal       ...                    │
│ Peak/window  ...                    │
└─────────────────────────────────────┘

CURRENT                    PROPOSED
...                        ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESULT / SAVING / PRIMARY FINDING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Recommendation.
Metadata.
One-line caveat.
```

Avoid a decorative cover, large empty hero area, long technology subtitle, large metadata cells, paragraph disclaimer, or unrelated metric dashboard.

### Sections

Number long reports. Style section headings with a thin bottom rule and enough top margin to establish chapters without wasting space.

### Blocks

Use white, square, one-pixel-bordered report blocks. No shadows, rounding, tint, or decorative card treatment. Each block should contain one coherent idea; do not card every paragraph.

### Tables

Use black outer borders, gray internal rules, left-aligned text, right-aligned numeric columns, tabular numbers, explicit units, and restrained total rows. Wrap only wide tables in `.table-wrap`.

### Notes

```css
.note {
  margin: 22px 0;
  padding: 14px 16px;
  border-left: 4px solid #000;
}
```

Use labels such as `Finding:`, `Recommendation:`, or `Limitation:`.

### Diagrams

Prefer simple text diagrams with a black one-pixel border. Follow each diagram with prose explaining the consequence.

### Charts

Use sparingly. Solid black is primary. Hatching is secondary:

```css
.bar-fill.hatched {
  background-color: #fff;
  background-image: repeating-linear-gradient(
    135deg, #000 0, #000 2px, #fff 2px, #fff 6px
  );
}
```

Always show exact values.

### Footer

Use a two-pixel top rule and small text. Default attribution:

```text
Prepared by Chan Nyein Thaw · chanyeinthaw@gmail.com
```

Keep attribution visible in browser and print.

### Responsive behavior

Below about 760px: stack columns, make the sidebar a normal block, arrange links in two columns, keep 12px gutters, and allow only wide table wrappers to scroll.

### Print

Use A4 with 15mm margins. Hide sidebar, remove screen-only margins, avoid orphaned headings and breaks inside tables/figures/notes where practical, preserve attribution, and do not depend on background colors.

## Anti-patterns

Do not use gradients, shadows, rounded cards, giant hero whitespace, full-viewport covers, colored badges, dashboard widgets without narrative order, forced-height sidebars, internal sidebar scrolling, web fonts, JavaScript for navigation, animated charts, vague titles, paragraph disclaimers on page one, or several competing headline metrics without a dominant conclusion.

## One-minute editorial test

A reader must be able to answer within one minute:

1. What problem is being solved?
2. What does the evidence show?
3. What is recommended?
4. What is the expected effect?
5. What must be validated before acting?

If not, revise the first page before polishing later sections.
