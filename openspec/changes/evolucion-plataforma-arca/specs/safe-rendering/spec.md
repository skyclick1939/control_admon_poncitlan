# Safe Rendering Specification

## Purpose

Defines mandatory HTML escaping for all user-supplied text before it is rendered anywhere in the application, closing the current unescaped-rendering XSS exposure across both the authenticated admin UI and the new public dashboard.

## ADDED Requirements

### Requirement: HTML Escaping for User-Supplied Text

The system MUST HTML-escape every user-supplied text field (including, at minimum, member nickname, `motivo`, and `observaciones`) before that text is rendered into any page, in both the authenticated admin UI and the public dashboard. No user-supplied string SHALL be rendered as raw HTML.

#### Scenario: XSS payload in nickname renders as literal text in the admin UI

- GIVEN a `miembros` row whose nickname is `<script>alert(1)</script>`
- WHEN the admin UI renders a list or detail view containing that member
- THEN the page displays the literal text `<script>alert(1)</script>`
- AND no script executes

#### Scenario: XSS payload in nickname renders as literal text in the public dashboard

- GIVEN a `miembros` row whose nickname is `<img src=x onerror=alert(1)>`
- WHEN the public debt dashboard renders that member's entry
- THEN the page displays the literal text of the payload
- AND no script executes

#### Scenario: Normal text renders unchanged

- GIVEN a `cargos` row whose `motivo` is `Cuota mensual de mantenimiento`
- WHEN either the admin UI or the public dashboard renders that field
- THEN the text displays exactly as entered, with no visible escape artifacts
