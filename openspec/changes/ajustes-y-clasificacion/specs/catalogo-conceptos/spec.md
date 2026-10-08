# Delta: catalogo-conceptos

## ADDED Requirements

### Requirement: Concept Catalog

The system MUST maintain a catalog of concepts used to classify movements, stored in `catalogo_conceptos` with a name, a nature, and an active flag. The catalog MUST ship pre-seeded with the operator's concepts: support to accident victims, support for a fallen brother, legal support, anniversary support, chapter acquisitions, and donations. A concept MUST NOT be a free-text-only field: classification MUST be a value from the catalog so that movements can be filtered and totalled by purpose.

#### Scenario: A catalog exists and is pre-seeded

- GIVEN a fresh deployment of this change
- WHEN the catalog is read
- THEN it contains the operator's concepts
- AND each one carries a nature

#### Scenario: Movements are filterable by concept

- GIVEN movements recorded with concepts
- WHEN the operator filters by a concept
- THEN the matching movements are listed
- AND the filter uses the stored concept, not a text search over the prose

### Requirement: Nature Makes Misclassification Impossible

Each concept MUST carry a nature: `recuperable` (the disbursement creates a debt that returns) or `no_recuperable` (it does not). The capture surface MUST filter the selector by nature: a modality that creates debts MUST offer only recoverable concepts, and a modality that creates no debt MUST offer only non-recoverable ones.

#### Scenario: A non-recoverable concept cannot create a debt

- GIVEN a non-recoverable concept such as a chapter acquisition or a donation
- WHEN the operator captures with a division modality that creates cargos
- THEN that concept is not offered
- AND it cannot be selected

#### Scenario: A recoverable concept cannot be booked as an expense

- GIVEN a recoverable concept such as support to accident victims
- WHEN the operator captures through the "sin cargos" modality
- THEN that concept is not offered
- AND the movement cannot be recorded as non-recoverable under it

### Requirement: Fixed Dropdown with In-Line Creation

The concept field MUST be a single-choice dropdown populated from the catalog with the concepts of the chosen modality's nature, in catalog order, so that the operator selects a classification instead of typing one. The list MUST exclude deactivated concepts. The selector MUST offer to add a concept without leaving the capture form, requiring a name and a nature. The selector MUST NOT require a migration, a redeploy, or a second screen to add a concept.

**Why this replaced the previous searchable-selector requirement (product owner, 2026-10-08).** The operator asked for the fixed list explicitly: *"necesito que puntualmente en 'Concepto (clasificación)' se desplieguen las opciones para poder seleccionar, son conceptos FIJOS, para que más adelante se puedan aprovechar correctamente por filtros, por consultas… por eso quiero una lista desplegable de esas opciones ya determinadas."* With six concepts and at most four per nature, type-to-filter added no capability the list does not already give, and it hid the options behind an empty text field — which is exactly how the operator came to report that the dropdown was missing.

#### Scenario: The concepts are offered as a list

- GIVEN a modality whose nature is recoverable
- WHEN the operator opens the concept field
- THEN every active recoverable concept is offered
- AND a deactivated concept is not
- AND no typing is required to see them

#### Scenario: A new concept can be created in place

- GIVEN the operator needs a concept that is not in the catalog
- WHEN they choose to create it from the dropdown and give it a name and a nature
- THEN a new catalog entry is created with that nature
- AND the capture continues with that concept selected
- AND no code change or migration was required

### Requirement: Concept Is Required for New Captures

Every apoyo and every egreso recorded after this change MUST carry a concept. A row recorded before the catalog existed MAY carry none; absence MUST mean "recorded before the catalog existed" and MUST NOT be silently filled with a guess.

#### Scenario: A new capture without a concept is refused

- GIVEN a new apoyo
- WHEN the operator attempts to save it without choosing a concept
- THEN the save is blocked
- AND the operator is told that the concept is required

#### Scenario: Historical rows may have no concept

- GIVEN a movement recorded before this change
- WHEN it is displayed
- THEN it may show no concept
- AND no classification is invented for it

### Requirement: The Guided Backfill Is Reviewed, Never Guessed

The classification of existing movements MUST be produced by a keyword-based proposal over each row's `motivo` and MUST be presented to the operator for approval or correction before any row is updated. A backfill MUST NOT be applied without that review.

#### Scenario: Backfill proposals are reviewed first

- GIVEN existing movements with prose in `motivo`
- WHEN the backfill runs
- THEN it produces a list of proposals, one per row
- AND no row is updated until the operator approves or corrects the proposal

### Requirement: Concepts Are Deactivated, Never Deleted

A concept that has been used MUST NOT be deleted; it MUST be deactivated so that historical classifications and totals stay intact. A deactivated concept MUST NOT be offered for new captures.

#### Scenario: A used concept cannot be removed from history

- GIVEN a concept used by at least one movement
- WHEN an operator tries to delete it
- THEN the deletion is refused or converted to deactivation
- AND the historical movements keep their classification

#### Scenario: A deactivated concept is not offered

- GIVEN a deactivated concept
- WHEN the operator opens the selector for a new capture
- THEN that concept is not offered

### Requirement: The Concept Complements the Motive

`motivo` MUST remain free text and MUST retain the specific detail of the movement. The concept MUST be an additional classification, never a replacement for the prose.

#### Scenario: Both are kept

- GIVEN a movement with a concept and a detailed motive
- WHEN it is displayed in any admin surface that shows the motive
- THEN the concept and the motive are both shown
- AND the prose is not overwritten by the concept name
