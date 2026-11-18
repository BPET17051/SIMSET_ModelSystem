# List View V2 Spec

Project: SIMSET Borrow Runtime  
Page: `/borrow`  
Scope: Step 2 equipment list only  
Status: Ready for implementation

## Objective

Replace the current oversized list card with a compact table-hybrid row so users can scan more equipment in one viewport without losing the key borrowing decisions.

## Reference Direction

- Primary: compact table / table-hybrid
- Secondary: inventory row with compact status and actions
- Optional: row-level secondary detail only when needed

## Rules

- `1 row = 1 equipment`
- Grid view stays unchanged
- List view uses dedicated markup, not the grid card compressed by CSS
- Desktop row target height: about `92px - 116px`
- Thumbnail target: about `72px - 88px`
- Primary action stays on the right and must not stretch full row width

## Row Structure

1. Media
   - Small preview thumbnail
2. Primary info
   - Equipment name
   - Short use case
   - Team code and age group
3. Operational info
   - Availability on selected dates
   - Borrow status badge
   - Up to 2 capability tags and `+N` overflow
4. Action
   - Add-to-cart button or quantity stepper
5. Expand detail
   - Secondary information opens below the row only when requested

## Information Priority

- Must be visible in one scan:
  - Name
  - Availability
  - Action
- Must stay secondary:
  - Long notes
  - Full capability list
  - Mapping warnings

## Expand Behavior

- The main row must stay compact and decision-oriented
- Secondary notes move into a row-expand panel
- Expand content may include:
  - full capability list
  - availability explanation
  - mapping warning
  - state note
- Expand state should persist while the current result set is rendered

## Anti-Patterns

- Do not use marketplace-style tall cards in list mode
- Do not use full-width CTA inside each row
- Do not show all tags in the main row
- Do not keep large empty whitespace above or below content
- Do not keep warning or note paragraphs in the primary row

## Acceptance

- More rows are visible per viewport than the current implementation
- Name, availability, and action align horizontally on desktop
- Grid/List switch does not reset filters, dates, pagination, or cart
- Mobile remains readable and actionable without reverting to the old tall card
