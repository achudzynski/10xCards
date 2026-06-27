---
project: "10xCards"
context_type: greenfield
created: 2026-06-07
updated: 2026-06-07
checkpoint:
  current_phase: 7
  phases_completed: [1, 2, 3, 4, 5, 6]
  gray_areas_resolved:
    - topic: "primary persona"
      decision: "professionals learning new domain knowledge (developers, doctors, lawyers)"
    - topic: "pain category"
      decision: "workflow friction — manual card creation is too slow"
    - topic: "insight"
      decision: "existing tools (Anki, Quizlet) solve review; nobody solved fast, high-quality card creation"
    - topic: "auth strategy"
      decision: "email + password; flat user model (no roles)"
    - topic: "MVP timeline"
      decision: "3 weeks of after-hours work"
    - topic: "FR-004 constraint"
      decision: "cap text length for MVP to reduce AI cost/complexity"
    - topic: "FR-012 constraint"
      decision: "integrate a ready-made SRS library — do not build from scratch"
    - topic: "product type"
      decision: "web-app"
    - topic: "target scale"
      decision: "medium (dozens to a hundred users)"
    - topic: "AI cost at scale"
      decision: "keep open for now — cost is MVP-scale non-issue"
  frs_drafted: 14
  quality_check_status: accepted
---

## Vision & Problem Statement

Manual flashcard creation is too slow — workflow friction kills adoption of spaced repetition.
Professionals learning new domain knowledge (developers, doctors, lawyers) have content to study
but must hand-craft every card, which is tedious enough to abandon the method altogether.

Existing tools (Anki, Quizlet) focus on the review side of the loop; nobody has solved fast,
high-quality card *creation*. The insight: reduce creation friction to near-zero and the proven
spaced-repetition method becomes accessible to anyone with a block of text to study.

## User & Persona

**Primary persona**: A professional learning new domain knowledge — a developer studying a new
technology, a doctor reviewing clinical guidelines, a lawyer absorbing case law. They have source
material (articles, documentation, notes) and want to convert it into a study deck without spending
more time on setup than on actual studying.

They reach for 10xCards when they have a block of text they want to retain long-term and no
time to manually produce cards from it.

## Success Criteria

### Primary
- 75% of AI-generated flashcards are accepted by the user (not edited-out or deleted).
- Users create 75% of their flashcards using AI generation (vs. manual creation).

### Secondary
- Users return for a second review session (indicating the first session created enough value
  to warrant coming back).

### Guardrails
- A review session must never lose progress or show the wrong card — any such failure is treated
  as a regression regardless of primary metric performance.

## Access Control

Multi-user web app. Users authenticate with email and password. Flat user model — every
registered user has the same capabilities; no admin or role separation in MVP.

Unauthenticated users cannot access any deck or generation feature. All flashcard data is
scoped strictly to the authenticated user — one user cannot see another's cards.

## User Stories

### US-01: User generates flashcards from pasted text

- **Given** a logged-in user who has a block of text to study
- **When** they paste the text and trigger AI card generation
- **Then** they see a list of AI-generated flashcards, each with a front (question) and back (answer), ready for review

#### Acceptance Criteria
- _Open question — acceptance criteria (minimum card count, response time, empty-state) to be defined; see Open Questions._

### US-02: User completes a spaced-repetition review session

- **Given** a logged-in user with cards due for review
- **When** they start a review session and answer each card
- **Then** the app records their answers and schedules each card's next review according to the SRS algorithm

#### Acceptance Criteria
- Progress is never lost if the user closes and reopens the app mid-session.
- Cards are surfaced in the order determined by the SRS algorithm, not in creation order.

## Functional Requirements

### Authentication
- FR-001: User can register with email and password. Priority: must-have
  > Socrates: Counter-argument considered: "Registration is friction — a user who can't try without an account may never reach the moment where it proves its value." Resolution: kept; card persistence across sessions requires identity.

- FR-002: User can log in with email and password. Priority: must-have
  > Socrates: Counter-argument considered: "Session management, tokens, and password reset add implementation effort that delays core AI generation." Resolution: kept; login is the gate to a user's personal deck.

- FR-003: User can log out. Priority: must-have
  > Socrates: Counter-argument considered: "Explicit logout is rarely used on personal devices — session expiry could cover this for MVP." Resolution: kept; basic security requirement.

### Card Generation
- FR-004: User can paste text (up to a capped length) and trigger AI generation of flashcards. Priority: must-have
  > Socrates: Counter-argument considered: "AI quality is unpredictable — poor early cards break trust and the 75% acceptance metric before the product proves itself." Resolution: kept as core value proposition; text length capped for MVP to manage cost and complexity.

### Card Management
- FR-005: User can review AI-generated cards one-by-one and accept each one. Priority: must-have
  > Socrates: Counter-argument considered: "Card-by-card review may itself be friction — reviewing 20 cards individually takes longer than creating them manually." Resolution: kept; one-by-one review gives the user full control over what enters their deck.

- FR-006: User can edit an AI-generated card before saving. Priority: must-have
  > Socrates: Counter-argument considered: "Editing before saving encourages over-polishing." Resolution: kept; editing is necessary when AI quality isn't perfect.

- FR-007: User can delete an AI-generated card before saving. Priority: must-have
  > Socrates: Counter-argument considered: "If FR-006 (edit) exists, deletion is redundant — a bad card can be edited into a good one." Resolution: kept; deletion is the explicit reject action and is semantically distinct from editing.

- FR-008: User can create a flashcard manually (front and back). Priority: must-have
  > Socrates: Counter-argument considered: "Manual creation is the status quo the product is replacing — including it as must-have validates the old workflow." Resolution: kept; some knowledge cannot be expressed in paste-able text, and manual creation complements AI generation.

- FR-009: User can view all saved flashcards in their deck. Priority: must-have
  > Socrates: Counter-argument considered: "A browseable card list is table-stakes but not the value differentiator — it costs time that could go toward AI quality." Resolution: kept; users need to audit and manage their deck.

- FR-010: User can edit a saved flashcard. Priority: must-have
  > Socrates: Counter-argument considered: "Post-save editing with SRS creates edge cases — what happens to the schedule when card content changes?" Resolution: kept; cards need correction after reviewing with the SRS.

- FR-011: User can delete a saved flashcard. Priority: must-have
  > Socrates: Counter-argument considered: "Hard-deleting after SRS entry erases review history — regret loses learning progression data." Resolution: kept; bad cards should be removable at any time; progression data loss is an accepted tradeoff for MVP.

### Review
- FR-012: User can start a spaced-repetition review session using a ready-made SRS library. Priority: must-have
  > Socrates: Counter-argument considered: "Integrating an SRS algorithm could push MVP past 3 weeks — a simple daily review without scheduling could prove the concept first." Resolution: constrained to use a ready-made SRS library (not built from scratch) to keep within timeline.

- FR-013: User can answer a flashcard during a review session (per the SRS answer schema). Priority: must-have
  > Socrates: Counter-argument considered: "Binary pass/fail is noisy — explicit self-rating would give the SRS better signal." Resolution: kept; answer schema is determined by the chosen SRS library's interface, not invented from scratch.

- FR-014: User can see the next scheduled review date for a card. Priority: nice-to-have
  > Socrates: Counter-argument considered: "Surfacing scheduling metadata adds UI complexity — users only need to know 'cards are due today'." Resolution: kept as nice-to-have; transparency into scheduling builds trust in the algorithm.

## Business Logic

The app extracts key concepts from user-supplied text and formats them as question-answer pairs,
then surfaces those pairs to the user at algorithmically-determined intervals based on the user's
own past answers.

Inputs (user-facing): a block of source text (at generation time); a self-rating of recall
quality per card (at review time). Output: a set of ready-to-study flashcards (generation);
a personalized review schedule that adapts to the user's retention pattern (review).

The user encounters the generation rule when they paste text and receive a deck of cards.
They encounter the scheduling rule every time they open the app and see which cards are
due — the schedule is invisible until that moment.

## Non-Functional Requirements

- Pasted text submitted for AI generation must not be accessible to other users or appear
  in any operator-accessible log after the generation request completes.
- A review session must preserve the user's progress state — no card is shown out of order
  or repeated incorrectly within a single session, and progress survives a browser refresh
  or accidental close.

## Non-Goals

- **Avoid: building our own spaced repetition algorithm** — use a ready-made library (e.g., SM-2
  or FSRS-based). Custom algorithm complexity would blow the 3-week timeline and the problem
  is already solved.
- **Avoid: advanced import formats (PDF, DOCX, images)** — text paste only for MVP. Parsing
  binary formats is a separate engineering problem; text covers the primary use case.
- **Avoid: shared decks and team workspaces** — single-user decks only for MVP. Multi-user
  sharing adds access-control complexity; the primary persona studies alone.
- **Avoid: mobile apps** — web only for MVP. Mobile adds platform-specific build, testing,
  and deployment overhead; the web app is accessible from mobile browsers.
- **Avoid: integrations with external educational platforms** (LMS, Coursera, etc.) — no
  outbound integrations for MVP.
- **Avoid: SuperMemo / Anki parity features** — 10xCards is not trying to replace Anki;
  it solves the creation problem, not the full-featured review ecosystem problem.

## Open Questions

1. **What are the acceptance criteria for US-01 (AI generation)?** — Minimum card count per
   generation, expected response time, empty-state behavior. Owner: user. Blocking: no (MVP
   can ship; criteria needed for testing).
2. **What is the text length cap for FR-004?** — Specific character/token limit to be decided
   during implementation based on chosen AI provider's cost/rate-limit tradeoffs. Owner: user.
   Block: no.
3. **Which SRS library will be integrated for FR-012?** — SM-2, FSRS, or another. Determines
   the answer schema for FR-013 and the data structure for scheduling. Owner: user (stack
   selection step). Block: yes for FR-012/013 implementation.
