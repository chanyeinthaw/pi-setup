---
name: make-document
description: Create polished, standalone, navigable HTML research documents, technical reports, architecture proposals, cost analyses, performance reports, and engineering decision briefs. Use when findings or recommendations should become a formal browser-readable and print-friendly document.
---

# Make Document

Create evidence-led HTML research documents in Chan's preferred monochrome technical-report style.

## Before implementation

Unless already specified, first propose the audience, supported decision, tone, central thesis, outline, evidence, and assumptions. If the user asks for an overview or outline first, wait for approval before writing HTML.

## Required references

Before creating or substantially revising a document, read completely:

- [references/style-guide.md](references/style-guide.md)
- [assets/research-document-template.html](assets/research-document-template.html)

Copy the template to the requested output path and adapt the copy. Never edit the bundled template for an individual report.

## Workflow

1. Inspect evidence, source material, audience, and destination requirements.
2. Identify the decision the report must support.
3. Classify claims:
   - **Observed** — directly measured or read from authoritative evidence.
   - **Calculated** — transparently derived from observed values.
   - **Estimated** — based on published rates or explicit assumptions.
   - **Proposed** — recommended future configuration or action.
4. Establish one central thesis. Every major section must support it.
5. Build from the bundled standalone HTML template.
6. Keep the first page concise and decision-oriented.
7. Add a sticky navigable outline for long documents.
8. Cite first-party sources for consequential external claims.
9. State assumptions, uncertainty, risks, and validation requirements.
10. Include the default attribution unless another author is specified:

```text
Prepared by Chan Nyein Thaw · chanyeinthaw@gmail.com
```

11. Validate HTML, anchors, responsive behavior, print behavior, and requested copies.

## Narrative structure

Prefer:

```text
Problem
→ Evidence
→ Recommendation
→ Cost or impact
→ Risks
→ Validation plan
→ Decision request
```

The reader must quickly understand what is happening, why it matters, what evidence shows, what should be done, what remains uncertain, and what decision is requested.

## First page

Use a decision brief, not a decorative cover or dashboard. Include in order:

1. Small report identifier.
2. Decision-oriented title.
3. Two- or three-line thesis.
4. One dominant recommendation or target block.
5. Direct current-versus-proposed comparison when relevant.
6. One consolidated result, cost, or savings strip.
7. Short recommendation or decision request.
8. Compact metadata line.
9. One-line caveat.

Do not include a generic oversized title, long technology list in the subtitle, competing dashboard rows, large metadata cards, paragraph-sized disclaimer, or detailed implementation analysis.

## Writing

Use an evidence-led technical business-case voice:

- direct and precise;
- calm, not promotional;
- cautiously confident;
- explicit about uncertainty;
- useful to engineering and management;
- centered on a decision;
- concise first, detailed later.

Avoid marketing language, unsupported superlatives, vague claims, false precision, repeated recommendations, hidden limitations, generic AI-report phrasing, and unnecessary opening jargon.

Use ranges when attribution or future usage is uncertain. Keep units, periods, currencies, and timezones explicit.

## Visual language

The document must feel like an internal engineering research report, not a landing page, slide deck, or SaaS dashboard.

Required:

- pure black and white;
- white background;
- system monospace font stack;
- approximately 980px reading column;
- strong top rule and thin section rules;
- square corners and plain bordered blocks;
- no gradients, shadows, decorative color, or illustrations;
- tabular numbers;
- black or hatched charts;
- semantic HTML and stable anchors;
- A4 print CSS.

## Outline sidebar

For more than five major sections, use the template sidebar. It must:

- be sticky on desktop;
- link to every major section and appendix;
- have content-driven height and end after its content;
- use `align-self: start` and `height: fit-content` as a grid item;
- not use `height: 100vh`, `height: calc(...)`, stretching `min-height`, or panel `overflow: auto`;
- become a compact two-column outline on small screens;
- be hidden in print.

## Charts and diagrams

Use charts only when they reduce reading effort. Prefer horizontal bars, solid black primary marks, and black hatching for a second series. Put exact values next to marks and never depend on color. Use text architecture diagrams when sufficient, followed by prose explaining the consequence.

## Tables

Use tables for exact comparisons, assumptions, costs, risks, and specifications. Keep headers short, right-align numeric values, state units, and avoid false precision. Wrap only wide tables in a horizontally scrollable `.table-wrap`; never make the page overflow.

## Sources

Prefer product documentation, official pricing, source code, specifications, direct logs, metrics, and billing output. Put consequential sources in an appendix and distinguish evidence from interpretation.

## Accessibility

- Use semantic headings in order.
- Give every major section a unique `id`.
- Verify sidebar links.
- Provide visible keyboard focus.
- Do not communicate meaning using color alone.
- Keep the document useful without JavaScript; prefer no JavaScript.

## File behavior

Create one standalone `.html` unless a bundle is requested:

- inline CSS;
- no build step;
- no external runtime dependencies;
- no web fonts;
- no secrets, credentials, or sensitive raw logs;
- verify any copied destination file.

## Final validation

- [ ] One opening and closing `html`, `head`, and `body`.
- [ ] Title and meta description.
- [ ] First page clearly states decision and recommendation.
- [ ] Facts and estimates are distinguishable.
- [ ] All sidebar anchors resolve.
- [ ] Sidebar has no forced viewport height or internal scrolling.
- [ ] No unintended horizontal overflow.
- [ ] Readable mobile layout.
- [ ] Print CSS hides navigation and preserves content where practical.
- [ ] First-party sources where available.
- [ ] Attribution present.
- [ ] No sensitive information.
- [ ] Requested destination copy verified.
