---
change_id: durability-acces-control
title: Durability + access control integration tests (Phase 2)
status: archived
created: 2026-09-13
updated: 2026-09-13
archived_at: 2026-09-13T13:22:19Z
---

## Notes

Phase 2 of test-plan rollout: protect deck mutations, session recovery, and RLS enforcement. Covers risks #3, #4, #6. Integration tests for card edit/delete without state corruption, session persistence across browser refresh, and RLS boundary validation (user cannot access another user's deck).
