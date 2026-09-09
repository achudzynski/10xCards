---
change_id: srs-review-session
title: Spaced-repetition review session with answer tracking
status: implemented
created: 2026-09-06
updated: 2026-09-09
archived_at: null
---

## Notes

User can start a review session, answer due cards per SM-2 schema (0-5 self-rating), and have schedules updated. New SRS columns (ease_factor, interval, repetitions, due_date) added to cards table. Review session state must be durable (survive browser refresh) per NFR. Parallel with s-04 (ui-improvements).
