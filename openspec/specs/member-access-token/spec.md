# Member Access Token Specification

## Purpose

Defines the admin-only capability to issue and rotate a per-member bearer token that grants read access to that member's own data (see `member-private-view`). Tokens are hashed at rest, entropy-bound, and single-live-per-member: generating a new token immediately and permanently invalidates the previous one. This capability is gated by the existing `is_admin()` authorization; it is not member-facing.

## ADDED Requirements

### Requirement: Single Live Token With Atomic Rotation

The system MUST guarantee at most one live (valid) token per member at any time. Generating a new token for a member MUST invalidate the previous token immediately and atomically, with no grace period during which both tokens are valid.

#### Scenario: First token generation for a member

- GIVEN a member with no existing token
- WHEN the admin generates a token
- THEN exactly one live token exists for that member afterward

#### Scenario: Regeneration invalidates the previous token immediately

- GIVEN a member with a live token
- WHEN the admin regenerates the token
- THEN the previous token stops granting access immediately, in the same operation
- AND the new token is the only live token for that member afterward

### Requirement: One-Time Plaintext Disclosure, Hash-Only Storage

The system MUST display the plaintext token to the admin exactly once, at the moment of generation or regeneration. The system MUST NOT persist the plaintext token anywhere; only a cryptographic hash of the token MUST be stored, and the system MUST NOT provide any later way to retrieve the plaintext.

#### Scenario: Plaintext shown once at generation time

- GIVEN an admin generates a token for a member
- WHEN the generation action completes
- THEN the admin's response/UI displays the plaintext token value once

#### Scenario: Plaintext is unrecoverable afterward

- GIVEN a token was generated in a prior action
- WHEN the admin reopens that member's panel later
- THEN only token status metadata (for example, that a live token exists) is shown
- AND the plaintext token value is not retrievable through any system surface

#### Scenario: Only a hash exists in storage

- GIVEN a token has been generated
- WHEN the token's persisted storage is inspected
- THEN it contains only a cryptographic hash of the token
- AND no plaintext token value is present

### Requirement: Token Entropy

Generated tokens MUST be derived from at least 32 bytes of cryptographically secure random data (or equivalent entropy), encoded for safe use in a URL query string.

#### Scenario: Generated token meets the entropy floor

- GIVEN the admin triggers token generation
- WHEN the token is created
- THEN it is derived from at least 32 bytes of cryptographically secure randomness

#### Scenario: Successive tokens never collide

- GIVEN multiple tokens are generated across members and over time
- WHEN any two generated tokens are compared
- THEN they are never equal

### Requirement: Admin-Only Issuance and Rotation

Token generation and rotation MUST be gated by the existing `is_admin()` authorization. Non-admin users MUST NOT be able to generate, rotate, or view token status for any member.

#### Scenario: Admin generates or rotates a token successfully

- GIVEN an authenticated admin session
- WHEN the admin requests token generation or rotation for a member
- THEN the action succeeds and a new live token results

#### Scenario: Non-admin request is denied

- GIVEN a member or unauthenticated (`anon`) request
- WHEN that request attempts to generate, rotate, or view token status for any member
- THEN the request is denied
