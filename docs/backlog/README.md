# Backlog

One file per unit of work. A session with none of the originating
conversation in context should be able to read one ticket and execute it
without rediscovering anything — that is what these are for, and a ticket
that does not meet that bar is not finished.


**Sources.** Most of these come from the 2026-09-12 journey audit, which
drove every product as a user and reproduced each defect. Each was then
re-verified against main before being written down, so a ticket here is a
defect that still existed at that commit — not an audit note.


**Conventions.** `status` is `open` until the fixing PR merges, then the
file is deleted (git history is the archive). `decision` names a question
only the owner can answer; those are blocked, not stalled. `depends_on`
means what it says — do not start a ticket whose dependencies are open.
Every `file:line` in a ticket was read before it was written; if one is
stale, fix it in the same PR that discovers it.


## Blocked on a decision

- [`T4-033`](T4-033.md) — t4bs still records no analytics, and on main it ships a beacon whose every report is dropped cross-origin
  - **Do you want page-view analytics on t4bs — if yes, someone with the Cloudflare account needs to re-add t4bs.com to Web Analytics using Manual setup, turn automatic injection off, and hand over the new token; if no, we take the analytics permissions back out of the security policy and stop claiming it.**

---

1 open ticket.
