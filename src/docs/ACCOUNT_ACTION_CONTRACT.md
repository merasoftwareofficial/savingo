# ACCOUNT_ACTION_CONTRACT

Last updated: 2026-06-22 00:00:00 +05:30

Purpose: freeze account action behavior before code changes. If code and this contract disagree, stop and report the mismatch before editing.

## Core Rules
- Account balance is derived from active transaction rows.
- Transaction row shape must be decided by the action contract, not by screen-specific assumptions.
- `AmountEntryScreen` may collect amount, note, date, receipt, and selected account, but action semantics must stay consistent across immediate and scheduled execution.
- Transfer-style rows use a matched pair: source negative row and destination positive row.
- Metrics/history must not infer a different business meaning from the same row shape.

## Account Types
- `earning`: user income/cash source account.
- `expenses`: budget/expense bucket account.
- `saving`: savings account; withdraw CTA acts as transfer.
- `credit`: credit card account; debits may go negative up to selected credit limit.

## Expenses Withdraw
User starts from an expenses account and withdraws an amount.

Expected rows when expenses balance covers the amount:
```text
expenses: -amount
```

Expected rows when amount is greater than expenses balance:
```text
source:   -shortfall
expenses: +shortfall
expenses: -amount
```

Rules:
- Use existing expenses balance first.
- Ask for earning/credit source only for the shortfall.
- Expense metrics must count the full withdrawn amount.
- Source account is debited only for the shortfall.

## Earning Withdraw
User starts from an earning account, selects an expenses account, and withdraws an amount.

Expected rows when selected expenses balance covers the amount:
```text
expenses: -amount
```

Expected rows when amount is greater than selected expenses balance:
```text
earning:  -shortfall
expenses: +shortfall
expenses: -amount
```

Rules:
- Selected expenses balance is used first.
- Opened earning account covers only the shortfall.
- Expense metrics must count the full withdrawn amount.
- Immediate earning withdraw currently does not write a zero log row.
- Scheduled earning/expenses withdraw does not currently mirror this balance-first shortfall row shape; review scheduled execution before changing that flow.

## Credit Withdraw
User starts from a credit card account, selects an expenses account, and withdraws an amount.

Expected rows:
```text
credit:   -amount
expenses: +amount
expenses: -amount
credit:    0 credit_withdraw_log
```

Rules:
- Selected expenses balance is not used.
- Credit account funds the full amount.
- Expenses account remains net unchanged after the paired credit and debit.
- Credit balance may go negative up to selected credit limit.
- Immediate and scheduled credit withdraw must produce the same row shape.

## Pay Bill
User starts from a credit card account and selects an earning account to pay bill.

Expected rows:
```text
earning: -amount, entry_kind=pay_bill
credit:  +amount, entry_kind=pay_bill
```

Rules:
- Earning account must have enough balance under active validation rules.
- Pay bill is visible in credit detail/history.
- Pay bill is excluded from dashboard expense slices.

## Add Budget
User starts from an expenses account and adds budget.

Expected rows:
```text
expenses: +amount
```

Rules:
- Budget metric counts the positive budget inflow.
- Expense metric does not count this row.

## Add Amount
User starts from an earning account and adds income/amount.

Expected rows:
```text
earning: +amount
```

Rules:
- Earning metric counts the positive earning inflow.

## Transfer
User transfers amount between allowed accounts.

Expected rows:
```text
source:      -amount
destination: +amount
```

Rules:
- Source validation depends on source account type.
- Credit source can debit up to selected credit limit.
- Non-credit source must satisfy active balance/timeline rules.

## Regression Checklist
- Expenses withdraw within balance.
- Expenses withdraw with shortfall from earning.
- Expenses withdraw with shortfall from credit.
- Earning withdraw when selected expenses balance covers amount.
- Earning withdraw with earning shortfall.
- Credit withdraw immediate.
- Credit withdraw scheduled.
- Pay bill immediate.
- Pay bill scheduled.
- Add budget.
- Add amount.
- Transfer from earning.
- Transfer from credit.
