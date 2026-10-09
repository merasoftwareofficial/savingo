# UI Baseline

Purpose: Capture a minimal, human-readable UI baseline so accidental regressions are caught during review.
Scope: Key screens only (expand as needed).

## Screens

### Dashboard
- Accounts list layout and spacing should match current design.
- Add Account modal: "Create New Account" header, preview card, segmented Earning/Liability tabs, icon/color rows.
- Context menu (long-press on account): bottom-up slide with icons and Cancel action.

### Add Account Modal
- Header: "Create New Account" with close X on right.
- Preview card: colored card with icon + account name.
- Segmented tabs for Account Type (Earning/Liability).
- Primary toggle row (disabled for Liability).
- Icon row + color row, both circular buttons.
- CTA: "Create Account" button.

### Account Detail (Earning)
- 3-dots menu opens bottom-up slide popup.
- Menu options include Rename, Personalization, Set as Primary, Delete, Cancel with icons.

### Account Detail (Liability)
- 3-dots menu opens bottom-up slide popup.
- Menu options include Rename, Personalization, Delete, Cancel with icons.

## How to Use
- When you change any of the above screens, update this file with the new expected UI.
- During review, verify changed screens against this baseline.
