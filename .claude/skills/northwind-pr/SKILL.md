---
name: northwind-pr
description: Use when writing or drafting the pull request description for the current branch, when the user invokes /northwind-pr, or when /submit needs a PR body. Northwind's required PR format; takes precedence over /pr.
---

# /northwind-pr

Write the pull request description for this branch in the team's required format. The reviewer reads it before the diff and the grader checks every claim against the code and the ticket, so collect the evidence first and write second.

## 1. Gather. Do not guess.

- Ticket ID from the branch name (`NWP-201-issue-cards` → `NWP-201`). Read `docs/tickets/<ID>.md` in full, including the out-of-scope list.
- Base: `upstream/main` if an `upstream` remote exists, otherwise `main`. Local `main` may be stale.
- `git log <base>..HEAD --oneline`, `git diff <base>...HEAD --stat`, then the diff itself.
- `docs/specs/<ID>-*.md` if present: what was planned, where the build departed from it.
- `git status --porcelain`. Uncommitted files are not in the PR.

## 2. Run the verification before writing about it

In `build-battle/merchant-console`: `npm test`, `npm run lint`, `npx tsc --noEmit`. Keep each summary line verbatim (`Tests  98 passed (98)`, `✔ No ESLint warnings or errors`, `exit 0`). That is the whole set, plus any command or browser check the user described in this conversation with its result. A failing command is reported as failing, with its output.

## 3. Check every ticket checkbox against the code

Core and stretch. Tick only when you can name the file that satisfies it. Half done stays unticked with `— partial: <what works>; missing <what does not>`. Untouched is `— not done`.

## 4. Write exactly this shape

```
<TICKET-ID>: <what it does>

Closes <TICKET-ID>

## What changed
One paragraph, at most 120 words, plain language: what ops can do now that they could not before. No file names, except one sentence per fix outside the ticket naming the file and the root cause.

## How I verified it
- `<command>` — <its summary line, verbatim>
One bullet per command from step 2. One bullet per browser check the user described: what was clicked, what appeared.

## Acceptance criteria
Every checkbox from the ticket, wording verbatim, ticked per step 3.

## Deliberately not done
- The ticket's out-of-scope items in one bullet, naming the follow-up tickets
- Each unmet or partial stretch goal
- Uncommitted files, by path (only when `git status --porcelain` is not empty)
- Anything else left for a follow-up, one line each, saying what would close it
```

The first line is the PR title; `/submit` and `gh pr create --title` take it from there.

## 5. Hand off

Print the description alone, starting with the title line. Write it to a temp file and offer:

    gh pr create --title "<title>" --body-file <file>

Do not run it unasked. Anything for the user's eyes only (a failing command, the uncommitted files) goes after the description, under a `---` line.

## Red flags. Fix the section before printing.

- A verification bullet with no captured output. Run the command or delete the bullet.
- "Tests passed earlier." Quote that output or run them again.
- The PR template's checkboxes (`npm test passes`, `Checked it in the browser`) pasted in. They are not commands.
- A ticked criterion whose file you cannot name.
- Sections this format does not have: Ticket, Bugs fixed along the way, Notes for the reviewer, Beyond the ticket.
- A Deliberately-not-done bullet about something that is done: a design choice, a compatibility note, a rule stricter than the ticket. This section holds gaps only.
- Verification that grows a harness: a production build, a second server, curl scripts. Step 2 is the set.
