# Public Debt View Specification

## Purpose

Defines the contract of the unauthenticated public serverless function that exposes member debt and bank-transfer info, without requiring any login and without exposing sensitive data or weakening base-table protection.

## ADDED Requirements

### Requirement: Public Read-Only Response Contract

The public debt-view function MUST return, for each active member, the member's nickname, their total pending balance (`total pendiente`), and the bank account information needed to pay it. It MUST NOT require any authentication to be called.

#### Scenario: Unauthenticated request returns debt and bank info

- GIVEN the public debt-view endpoint is deployed
- WHEN a client calls it with no `Authorization` header and no session cookie
- THEN the response includes, per member, nickname, total pendiente, and bank account info
- AND the call succeeds without any login step

### Requirement: Sensitive Field Exclusion

The public debt-view function's response MUST NOT include member emails, the identity of the capturador (the admin who recorded a cargo/pago), internal `observaciones`, or any field not explicitly part of the public contract (nickname, total pendiente, bank account info).

#### Scenario: Response omits sensitive fields

- GIVEN a member with an email, cargos recorded by an identified admin, and cargos carrying internal `observaciones`
- WHEN the public debt-view endpoint returns that member's entry
- THEN the response contains no email field, no capturador identity, and no `observaciones` content

### Requirement: Base Tables Remain Protected Behind the Function

The public debt-view function MUST read its data using the `service_role` key on the server side only; this function's existence MUST NOT create or require any direct `anon` grant on `miembros`, `cargos`, `registro_apoyos`, or `registro_pagos`.

#### Scenario: Direct anon access still denied while the public function works

- GIVEN the public debt-view function is deployed and returns correct data
- WHEN an `anon` client attempts a direct `SELECT` against `miembros` or `cargos`
- THEN that direct query is still denied
