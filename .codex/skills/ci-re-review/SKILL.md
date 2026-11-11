---
name: ci-re-review
description: Re-analyzes a GitHub issue for requirement quality and bug-or-feature classification; updates or adds an analysis comment, synchronizes requirement-status labels, and sets the GitHub issue Type. Use when re-reviewing issues in CI, GitHub Actions workflows that comment on issues, or when the user invokes ci-re-review.
disable-model-invocation: true
---

# CI RE Review

Re-analyze this GitHub issue after recent changes.

Context:
- REPO: ${{ github.repository }}
- ISSUE: ${{ github.event.issue.number || github.event.comment.issue_url }}

If an analysis comment already exists, update it; otherwise add a new comment titled "🔄 Updated Analysis".

Detect the issue's language from its title and body, ignoring code blocks, logs, and quoted templates. For mixed-language issues, use the predominant language of the author's prose; if no language can be determined, use English.
Write the entire analysis comment in that language, including its title, headings, field labels, explanations, questions, and footer. Translate the English template below while preserving its section order and meaning. Keep technical identifiers, code, GitHub label names, and the verdict values `SUFFICIENT` and `NEEDS IMPROVEMENT` unchanged. Apply this rule when updating existing comments as well, regardless of their previous language.

You review the issue as a **software requirement**: clarity, completeness, and implementation risk.

**Check (briefly, in priority order):**
1. **Intent** — Who benefits, what changes, why it matters (user story or equivalent).
2. **Scope & acceptance** — What “done” means; measurable criteria; out-of-scope if relevant.
3. **Gaps** — Missing inputs: data, APIs, UX, NFRs (performance, security), env/constraints.
4. **Engineering impact** — Dependencies, affected areas, migrations, rollout/rollback.

**Classify the issue:**
- **Bug**: existing behavior violates documented or previously accepted behavior. Identify expected versus actual behavior using the issue and relevant repository evidence.
- **Feature**: requests new functionality or an intentional extension of existing behavior. Classify by the requested outcome, not merely the presence of words such as "bug" or "feature".
- For mixed requests, use the primary requested outcome and explain the choice briefly. If the evidence does not support a classification, mark it as unclear, ask a specific question under Gaps, and leave the issue Type unchanged until clarified.

**Synchronize the GitHub issue Type after successfully creating or updating the analysis comment:**
- Set the issue's native **Type** field to `Bug` or `Feature` according to the classification, including when updating an existing comment. This is independent of the requirement-quality verdict and replaces a previous Type such as `Task` when appropriate.
- Look up and reuse the available issue types. If the selected type is missing, create it at the organization level if supported and permitted, then assign it to the issue. Do not use `bug` or `enhancement` labels as a substitute for the native Type field.
- Verify the resulting Type. If issue types are unavailable or creating/assigning the type is denied, report the limitation and leave this step explicitly incomplete.

**Synchronize issue labels after successfully creating or updating the analysis comment:**
- If **SUFFICIENT:** add `ready-for-implementation` and remove `needs-clarification` if present.
- If **NEEDS IMPROVEMENT:** add `needs-clarification` and remove `ready-for-implementation` if present.
- The requirement-status labels above already exist. Use their exact names; do not create or rename them.
- Preserve all other issue labels and leave already-correct labels unchanged. Never replace the issue's entire label set or delete repository labels.
- Apply the labels through the GitHub API or CLI on every review, including updates to existing comments. Suggesting labels in the comment alone does not complete the review.
- Verify the resulting issue labels. If reading the issue, publishing the analysis, or updating labels fails, report what succeeded and what remains incomplete; do not claim that labels were synchronized without verification.

**Comment format (use exactly these sections, keep each section short — bullets preferred):**

## 🤖 Automated issue analysis

**Verdict:** SUFFICIENT | NEEDS IMPROVEMENT  
**Type:** Bug | Feature | Unclear — [brief reason for the classification]

**One-line summary:** [what this issue is really asking for]

### Requirement quality
- User story / intent: [OK | partial | missing] — [1–2 bullets]
- Acceptance / definition of done: [OK | partial | missing] — [1–2 bullets]

### Gaps (blockers first)
- [bullet list; empty if none]

### Implementation notes
- Dependencies & blast radius: [bullets]
- Risks / open decisions: [bullets]

### Next steps
- If **SUFFICIENT:** suggest a feature branch name.
- If **NEEDS IMPROVEMENT:** ask **specific questions** (not generic).

---
_Automated analysis._
