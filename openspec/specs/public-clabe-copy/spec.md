# Public CLABE Copy Specification

## Purpose

Defines the copy-to-clipboard affordance for the CLABE in the public no-login view, with a graceful fallback and clear feedback. The shared helper must stay dependency-free so it never pulls Supabase code into the public bundle.

## ADDED Requirements

### Requirement: CLABE Copy Affordance

The public no-login view MUST provide a copy-to-clipboard affordance for the CLABE. When the Clipboard API is unavailable, it MUST fall back gracefully, and it MUST give clear success and failure feedback.

#### Scenario: Copy succeeds

- GIVEN a browser with the Clipboard API available
- WHEN the visitor activates the copy affordance
- THEN the CLABE is written to the clipboard
- AND success feedback is shown

#### Scenario: Clipboard API unavailable

- GIVEN a browser without a usable Clipboard API
- WHEN the visitor activates the copy affordance
- THEN the operation fails gracefully without throwing
- AND failure feedback is shown

### Requirement: Dependency-Free Copy Helper

The shared copy helper (`src/lib/clipboard.ts`) MUST be dependency-free. It MUST NOT import supabase-js or the anon key, so importing it into the public view does not pull those into the public bundle.

#### Scenario: Public bundle stays clean

- GIVEN `src/public-view.ts` imports the shared helper
- WHEN the public bundle is built
- THEN the helper imports no supabase-js module and no anon key
- AND the public bundle gains no Supabase dependency
