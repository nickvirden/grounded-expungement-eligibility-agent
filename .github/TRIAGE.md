# Issue triage

Every open issue carries exactly one priority label (`P0`–`P3`). This file defines what each
level means, how issues get a level, and how low-value issues retire. Issue type labels (`bug`,
`enhancement`, `accessibility`, ...) are separate and unchanged; `released` is owned by
semantic-release and ignored by triage.

## Why the bar is shaped this way

- Criminal-history data is PII (`DECISIONS.md` section 9).
- A wrong eligibility answer is a legal-harm risk, not just a UX bug.
- CSP, CSRF and origin checks are load-bearing.
- Texas decision-tree content needs a content owner's sign-off, so many bugs are blocked on a
  human rather than on engineering.

When torn between two levels, pick the higher one for security and eligibility correctness and
the lower one for everything else.

## Priorities

| | Meaning | Examples | Response |
|---|---|---|---|
| **P0** | Stop and fix. Harm is happening or one step away. | Production down or deploys blocked; secret or intake-PII exposure; exploitable authz, CSRF or origin bypass on a deployed surface; a wrong eligibility result served on a mainstream path with no warning; CI on `main` red and blocking every merge with no workaround. | Same day. Interrupts everything. |
| **P1** | Next up. Correctness or safety gap on a reachable path. | An eligibility outcome can change because of a logic, routing or content error; a user dead-end on a core flow (loop, unreachable screen); a security weakness with a real attack path but a mitigating control or a precondition; CI that gives false confidence or regularly blocks agents. | Next 1–2 weeks. A P1 that is not `blocked` and has no PR after 30 days is mislabeled: schedule it or demote it. A `blocked` P1 keeps its level while the blocker is real. |
| **P2** | Planned. Real defect with a workaround, or meaningful friction. **Default for a triaged issue.** | Misleading copy; a11y gaps that do not block; degraded or unstyled failure pages; defense-in-depth hardening with no demonstrated path; flaky tests, slow CI, and DX papercuts that cost time every week. | This quarter. No commitment. |
| **P3** | Nice-to-have. Nobody is hurt if this never ships. | Polish; cosmetic console noise; a second-line guard for a risk another control already catches; design explorations gated on a future trigger. | None. Subject to stale retirement. |

Soft WIP cap: at most 5 open P1s that are not `blocked`. Above that, demote one or finish one
before adding another.

## Labels

| Label | Color | Meaning |
|---|---|---|
| `P0` | `#B60205` | Priority, as defined above. Exactly one P label per issue. |
| `P1` | `#D93F0B` | |
| `P2` | `#FBCA04` | |
| `P3` | `#C5DEF5` | |
| `needs-verification` | `#D4C5F9` | The claim or its priority depends on behavior not yet observed (runtime, deployment, a user path). A defect visible directly in committed code or data counts as verified. |
| `spike` | `#5319E7` | Time-boxed investigation or design. The deliverable is a decision, not code. |
| `blocked` | `#24292F` | Cannot proceed until something outside the code changes. The issue body or a comment must say `Blocked on: ...` (content owner, legal review, another issue). |

`needs-verification` asks "is this even true?"; `spike` asks "what should we do?". To recreate
the labels (idempotent):

```sh
gh label create P0 --color B60205 --description "Stop and fix: harm is happening or imminent. Same day." --force
gh label create P1 --color D93F0B --description "Next up: correctness or safety gap on a reachable path. 1–2 weeks." --force
gh label create P2 --color FBCA04 --description "Planned: real defect with a workaround, or meaningful friction." --force
gh label create P3 --color C5DEF5 --description "Nice-to-have: subject to stale retirement after 90 idle days." --force
gh label create needs-verification --color D4C5F9 --description "The claim or priority depends on behavior not yet observed. Priority is provisional." --force
gh label create spike --color 5319E7 --description "Time-boxed investigation or design. The deliverable is a decision, not code." --force
gh label create blocked --color 24292F --description "Cannot proceed until something outside the code changes. The issue must say 'Blocked on: …'." --force
```

An issue with no P label is untriaged; find them with:

```sh
gh issue list --state open --search "-label:P0 -label:P1 -label:P2 -label:P3"
```

## Workflow

- **Who sets priority.** The filer (human or agent) suggests a priority and a verification status
  in the issue body and applies the matching label at filing time. The maintainer owns the final
  call and overrides it in the next triage pass. Agents file P1–P3 on their own. An agent that
  suspects a P0 files it and tells the maintainer in the same turn.
- **At filing.** Every issue gets exactly one P label. Add `needs-verification` if the claim or
  its priority depends on behavior nobody has observed yet. Add `blocked` plus a `Blocked on:` line if it cannot move without a human
  or another issue.
- **Weekly pass (15 minutes, fixed slot).** In order:
  1. Untriaged issues.
  2. Every `needs-verification` issue: reproduce and drop the label, or add `invalid` and close as not planned.
  3. P0/P1 sanity and the WIP cap.
  4. `blocked` items: is the blocker still real?
- **Monthly sweep (30 minutes, first pass of the month).** Re-rank P2s, demote P2s idle for
  180 days to P3, and retire stale P3s (below). Idle P2s:

  ```sh
  gh issue list --label P2 --search "-label:blocked updated:<$(date -v-180d +%F 2>/dev/null || date -d '180 days ago' +%F)"
  ```
- **Event-driven re-triage.** On an incident, a release, a dependency or CSP change, or a PR that
  touches the same files. New information in a comment is a reason to relabel immediately.
- **Batching.** Issues that edit the same artifact are fixed together. For example, Texas
  wording fixes all change `texas.json`, its mirror and the parity fixtures, so one change beats
  several.

## Retiring stale P3s

A P3 is stale after 90 days with no activity.

1. Skip it if it is `blocked`, if a committed document cites it (for example `DECISIONS.md`
   cites #25, #26 and #27), or if it names a trigger that has not fired yet.
2. Otherwise close it as not planned. Closing is reversible and the issue stays searchable:

   ```sh
   gh issue close N --reason "not planned" --comment "Closing as stale. Reopen if it starts to matter."
   ```

Query (macOS and Linux):

```sh
gh issue list --label P3 --search "-label:blocked updated:<$(date -v-90d +%F 2>/dev/null || date -d '90 days ago' +%F)"
```

Closing is a maintainer action. An agent may run the query and propose the list, and closes only
what the maintainer approves.

Not adopted: an `actions/stale` workflow. It would close issues unattended and adds CI to
maintain. Revisit if the manual sweep stops happening.

## Filing from an agent

Agents file with `gh issue create`, which bypasses GitHub issue forms, so the template at
`.github/ISSUE_TEMPLATE/follow-up.md` is plain markdown. Interactive filers can start from it with
`--template "Follow-up"`; non-interactive filers copy its headings into the body and pass labels
explicitly:

```sh
gh issue create --title "..." --body-file body.md --label P2 --label needs-verification
```

A suspected P0 security issue is filed with impact and affected surface only. Exploit details go
to the maintainer privately, never into the public issue.
