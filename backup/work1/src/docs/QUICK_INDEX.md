# QUICK_INDEX

Last updated: 2026-06-23 00:00:00 +05:30
Use this first. Detailed reference: `docs/CODE_AUDIT.md`.

## Scope
- Primary app: `AccountApp` (Android-first React Native)
- API backend: `backend`
- Ignore by default: `backup/`, `AccountApp/src/backup/`, generated logs/artifacts

## First Files To Open (By Task)
- Startup/Login routing: `AccountApp/App.tsx`, `src/navigation/AppNavigator.js`, `src/navigation/MainTabNavigator.js`, `src/services/startupCoordinator.js`, `src/screens/LoginScreen.js`
- Dashboard balances/accounts: `src/screens/DashboardScreen.js`, `src/services/accountsPeriodCore.js`, `src/services/accountsDatabase.js`, `src/services/transactionsDatabase.js`
- Dashboard reset live refresh: `src/screens/SettingsScreen.js`, `src/services/dashboardResetService.js`, `src/services/accountsChangeBus.js`, `src/screens/DashboardScreen.js`, `src/screens/AllAccountsScreen.js`
- Dashboard donut flow model: `src/screens/DashboardScreen.js`, `src/services/accountsPeriodCore.js`, `src/services/transactionSemantics.js`, `src/screens/SettingsScreen.js`, `src/screens/AllAccountsScreen.js`, `src/utils/dashboardNetBalance.js` (green slice from SSOT net, real expense slices from `accountsPeriodCore.periodAccountExpenses`, pay-bill settlement excluded from red expense slices, earning-account negatives grouped as Other Expenses, inner percent from donut total)
- Dashboard donut center label: `src/components/ui/DashboardBalanceDonutCard.js`, `src/screens/DashboardScreen.js`
- Dashboard donut center label styling: `src/components/ui/DashboardBalanceDonutCard.js`
- Dashboard donut footer spacing: `src/components/ui/DashboardBalanceDonutCard.js`
- Dashboard donut footer side margins: `src/components/ui/DashboardBalanceDonutCard.js`
- Dashboard donut footer vertical offset: `src/components/ui/DashboardBalanceDonutCard.js`
- Dashboard immediate period-change refresh: `src/screens/DashboardScreen.js`
- Dashboard expenses bar: `src/screens/DashboardScreen.js` (period expenses only, no balance slice)
- Dashboard top-right savings info gate: `src/screens/DashboardScreen.js`, `src/components/ui/DashboardBalanceDonutCard.js`, `src/utils/dashboardNetBalance.js`
- Dashboard donut text alignment: `src/components/ui/DashboardBalanceDonutCard.js`
- Dashboard donut top metrics vertical offset: `src/components/ui/DashboardBalanceDonutCard.js`
- Dashboard donut top metrics fine-tuning: `src/components/ui/DashboardBalanceDonutCard.js`
- Dashboard donut savings label styling: `src/components/ui/DashboardBalanceDonutCard.js`
- Reusable clean detail-page header: `src/components/ui/PageHeader.js`
- Transaction History page header implementation: `src/screens/TransactionHistoryScreen.js`, `src/components/ui/PageHeader.js`
- PageHeader exact More-style layout: `src/components/ui/PageHeader.js`, `src/screens/MoreScreen.js`
- Accounts change notification core: `src/services/accountsChangeBus.js`, `src/screens/PersonalizeAccountScreen.js`, `src/screens/AllAccountsScreen.js`, `src/screens/DashboardScreen.js`
- Add account immediate refresh: `src/screens/AddAccountScreen.js`, `src/services/accountsChangeBus.js`, `src/screens/AllAccountsScreen.js`
- Account icon/color SSOT, picker rendering, and name-based auto matching: `src/ui/accountVisuals.js`, `src/components/account/AccountIcon.js`, `src/screens/AddAccountScreen.js`, `src/screens/PersonalizeAccountScreen.js`, `src/services/accountsDatabase.js`, `src/services/accountSheetUploadService.js`
- Dashboard period/calendar sync: `src/screens/DashboardScreen.js`, `src/components/DashboardCalendarSheet.js`, `src/services/accountsPeriodCore.js`, `src/services/accountsPeriodStateStorage.js`
- Personalize account refresh path: `src/services/accountsChangeBus.js`, `src/screens/PersonalizeAccountScreen.js`, `src/screens/AllAccountsScreen.js`, `src/screens/DashboardScreen.js`
- All accounts period/metrics core: `src/screens/AllAccountsScreen.js`, `src/services/accountsPeriodCore.js`, `src/services/accountsPeriodStateStorage.js`, `src/services/accountsDatabase.js`, `src/services/transactionsDatabase.js`
- All Accounts screen account sections only: `src/screens/AllAccountsScreen.js` (recent transaction preview removed; Dashboard owns recent preview)
- Earning account period persistence: `src/screens/EarningAccountScreen.js`, `src/services/accountsPeriodCore.js`, `src/services/accountsPeriodStateStorage.js`, `src/services/accountsDatabase.js`, `src/services/transactionsDatabase.js`
- Expenses account period persistence: `src/screens/ExpensesAccountScreen.js`, `src/services/accountsPeriodCore.js`, `src/services/accountsPeriodStateStorage.js`, `src/services/accountsDatabase.js`, `src/services/transactionsDatabase.js`
- Expenses/Credit account transaction list order: `src/services/transactionsDatabase.js#getTransactionsByAccount()` returns `ORDER BY transaction_date DESC, id DESC`; detail screens render through `FlatList inverted`. The `id DESC` tie-breaker keeps same-timestamp latest-created entries stable. Do not add local ASC sort in account detail lists.
- Account detail metrics: `src/screens/ExpensesAccountScreen.js`, `src/services/accountDetailMetrics.js`, `docs/ACCOUNT_DETAIL_METRICS_SPEC.md` (detail-only expenses/saving/credit header metrics; dashboard/all-accounts math stays in `accountsPeriodCore.js`)
- Credit-card selected-limit enforcement: `src/services/creditLimitPolicy.js`, `src/services/transactionsDatabase.js`, `src/screens/AmountEntryScreen.js`, `src/services/scheduledActionExecutor.js`, `src/services/recurringDatabase.js`, `src/screens/EarningAccountScreen.js` (shared write-layer rule; credit debits must not go beyond `accounts.credit_limit`)
- Credit-card limit personalization UX: `src/screens/PersonalizeAccountScreen.js`, `src/services/accountsDatabase.js` (credit limit autosave shows an updating state while persisting)
- Credit-card pay-bill dashboard classification: `src/services/transactionSemantics.js`, `src/services/transactionsDatabase.js`, `src/services/accountsPeriodCore.js`, `src/screens/DashboardScreen.js`, `src/screens/AmountEntryScreen.js`, `src/services/scheduledActionExecutor.js` (`pay_bill` remains visible in credit detail/history but is excluded from dashboard red expense slices)
- Dashboard recent entries + global full history: `src/screens/DashboardScreen.js`, `src/components/RecentTransactionsPreview.js`, `src/screens/GlobalTransactionHistoryScreen.js`, `src/services/transactionsDatabase.js`, `src/navigation/AppNavigator.js`
- Global full history now reverse-replays the current All Accounts net balance across the full transaction table from `src/services/accountsDatabase.js`, `src/services/transactionsDatabase.js`, and `src/utils/dashboardNetBalance.js`; `src/screens/GlobalTransactionHistoryScreen.js` is the consumer/render layer and filters `[ewlog]` plus hides transfer/request rows except in saving accounts
- Amount entry/transaction edit-delete: `src/screens/AmountEntryScreen.js`, `src/services/transactionsDatabase.js`, `src/services/accountTransactionPolicy.js`
- Account action contract/rules: `src/docs/ACCOUNT_ACTION_CONTRACT.md` (read before changing withdraw, pay bill, add budget, add amount, or transfer row shapes)
- Balance-first withdraw correction: `src/screens/AmountEntryScreen.js`, `src/screens/ExpensesAccountScreen.js`, `src/screens/EarningAccountScreen.js`, `src/services/transactionTimeline.js`, `src/services/transactionsDatabase.js` (immediate expenses withdraw uses existing expenses balance first and opens earning/credit source selection only for the shortfall; immediate earning withdraw uses the selected expenses balance first and uses the opened earning account only for the shortfall; both shortfall paths write source debit, expenses transfer credit, then full expenses withdrawal debit; credit withdraw stays isolated)
- Credit withdraw contract alignment: `src/screens/AmountEntryScreen.js`, `src/services/scheduledActionExecutor.js`, `src/docs/ACCOUNT_ACTION_CONTRACT.md` (immediate credit withdraw now mirrors scheduled row shape: credit debit, expenses credit, expenses debit, credit log)
- Account SSOT + balance writes: `src/services/accountsDatabase.js`, `src/services/transactionsDatabase.js`, `src/services/transactionTimeline.js`
- Account detail route ownership: `src/navigation/AppNavigator.js`, `src/screens/EarningAccountScreen.js`, `src/screens/ExpensesAccountScreen.js`, `src/screens/AmountEntryScreen.js`
- Backend auth/profile/phone ownership: `backend/index.js`, `backend/routes/auth.js`, `backend/routes/users.js`, `backend/services/fcmTokenState.js`, `backend/models/User.js`, `backend/models/PhoneLink.js`, `backend/models/PhoneClaim.js`
- Backend messaging + ledger delivery: `backend/routes/messages.js`, `backend/routes/ledger.js`, `backend/models/MessageDelivery.js`, `backend/config/firebase.js`
- Backup versions/retention/restore: `src/services/backupService.js`, `src/screens/BackupScreen.js`, `src/utils/backupQueue.js`, `src/services/driveService.js`
- Ledger list + identity: `src/screens/LedgerScreen.js`, `src/services/ledgerChatIdentityService.js`, `src/services/ledgerContactBootstrapService.js`, `src/services/ledgerDatabase.js`
- Ledger detail timeline/chat orchestration: `src/screens/LedgerContactDetailScreen.js`, `src/hooks/useLedgerChatController.js`, `src/services/ledgerCommandService.js`, `src/services/ledgerDomain/ledgerDomainStore.js`
- Ledger paid/get account isolation: `src/screens/LedgerContactDetailScreen.js`, `src/hooks/useLedgerTransactionsController.js`, `src/services/ledgerCommandService.js` (Paid/Get now record only in ledger DB and do not create All Accounts transactions; primary-account prompts/bridges removed)
- Chat send/receive/queue: `src/services/messagingService.js`, `src/services/chatDatabase.js`, `backend/routes/messages.js`
- Ledger entry delay hot path: `src/services/ledgerCommandService.js`, `src/services/ledgerDatabase.js`, `src/screens/LedgerContactDetailScreen.js` (commit path now hydrates from in-memory domain base; DB reread stays in background refresh only)

## Account Architecture Snapshot (2026-04-30 01:50:36 +05:30)
- Current account types are `earning`, `expenses`, `saving`, and `credit`; `accountsDatabase.js` allows all four types while default-account bootstrap still creates only earning/expenses/saving.
- Source of truth for current account balance is `accounts.balance`; `transactionsDatabase.createTransaction/deleteTransaction/updateTransactionAmount` recompute balance by summing active transactions and write back to `accounts`.
- `transactionTimeline.js` is the shared running-balance rule owner. `canWithdrawAtTimestampWithEntries` blocks backdated debits that would make the timeline negative from that timestamp onward; credit-account flows now reuse the same owner with an explicit negative-allowed option instead of a separate timeline engine.
- `accountTransactionPolicy.js` is the delete-rule owner for account transactions and checks linked-entry dependency through `transactionTimeline.js`.
- `AmountEntryScreen.js` is the shared transaction-entry owner. It handles `add`, `withdraw`, `request`, `transfer`, plus credit-account `credit` and `payBill` modes, including schedule path, selected-source request/withdraw paths, transfer pair creation, and dashboard refresh emission.
- `EarningAccountScreen.js` owns earning detail route `AccountDetail` and now also renders credit-card detail through `CreditCardAccountScreen.js`. Earning CTAs are `Withdraw` and `Add Amount`; credit CTAs are `Withdraw` and `Paid Bill`.
- Earning withdraw uses `AmountEntry` with `withdrawFromExpensesOnly: true`; user selects an expenses account destination, the selected expenses balance is consumed first, and only the shortfall is funded from the opened earning account as earning debit -> expenses credit -> full expenses withdraw debit. Immediate earning withdraw currently does not write an `[ewlog]` row. Primary account and Auto Get are not used in this flow.
- Expenses withdraw is independent: it uses the opened expenses balance first; only if the amount exceeds that balance does the user select an earning or credit source for the shortfall, then the flow writes source debit -> expenses credit -> full expenses withdraw debit. Primary account and Auto Get are not used in this flow.
- Credit withdraw also uses `withdrawFromExpensesOnly: true`, but does not use the selected expenses account's existing balance or Auto Get setting. It first creates a full transfer pair from credit to expenses (`credit -amount`, `expenses +amount`), then records the expense debit (`expenses -amount`), and writes a zero-amount `[cwlog]` audit row in credit. Net result: credit balance decreases by the full amount; selected expenses balance is unchanged net.
- `ExpensesAccountScreen.js` owns route `ExpensesAccountDetail` and still serves expenses + saving accounts. Expenses CTAs are `Withdraw` and `Add Budget`; saving CTAs are `Transfer` and `Add Savings`.
- `DashboardPeriodFilter.js` plus `components/ui/MetricsBar.js` are the shared account-header metric render owners. They support per-screen metric labels. Credit detail now binds its header totals from `services/accountDetailMetrics.js` instead of the generic dashboard period summary so `Paid Bill` and `Credit Consumption` stay separate.
- `accountDetailMetrics.js` owns detail-only display metrics for expenses/saving/credit. Expenses show `Budget`/`Expenses`, saving shows `Savings`/`Transfer`, and credit shows `Paid Bill`/`Credit`; credit paid-bill total includes bill payments plus manual incoming transfers. Balance still comes from `accounts.balance`, and dashboard/all-accounts calculations stay in `accountsPeriodCore.js`.
- `AllAccountsScreen.js` is the section/order owner. Current order is `Earning Accounts`, optional `Savings Accounts`, optional `Credit Card Accounts`, then `Expenses Accounts`. Empty credit section is hidden; users without credit accounts get a one-time notice controlled by `creditCardAccounts.noticeDismissed.v1`.
- `accountVisuals.js` is the visual SSOT. Credit accounts now have credit-only dark matte colors and credit-card tag presets; Add Account and Personalize use that credit palette only for credit accounts while non-credit palettes stay unchanged.
- Current menu ownership is split: earning detail uses `buildEarningAccountMenuActions`; expenses/saving detail uses `buildExpensesAccountMenuActions`; dashboard cards use `buildDashboardAccountMenuActions`.
- Credit-card flow is implemented under existing SSOT/shared owners: credit detail renders through `EarningAccountScreen`, withdraw fully funds the selected expenses account from credit before the expense debit, `Paid Bill` is funded from the selected earning account, configurable metrics labels are added, and scheduled execution mirrors immediate credit withdraw behavior.
- Credit-card selected-limit enforcement now lives in a shared write policy: `creditLimitPolicy.js` decides whether a credit debit would exceed the selected limit, `transactionsDatabase.js` blocks the write, and UI/schedule callers surface the same error instead of creating partial side effects.
- Credit-card bill payment now carries `pay_bill` transaction semantics for manual and scheduled flows. Dashboard period classification excludes pay-bill settlement from red expense slices while leaving balances and transaction history intact.
- Personalize Account no longer exposes the `Auto-fund from Primary` toggle, and `updateAccountPersonalization()` no longer writes `auto_fund_primary`. The legacy DB column is still kept for compatibility until final cleanup.
- Ledger `Paid` and `Get` are record-only ledger entries. They no longer prompt for primary account, no longer remember primary-linked choices, and no longer write account transactions into All Accounts.

## Dark Theme & UI Redesign (2026-05-13) - COMPLETED
- **Theme system:** `src/utils/theme.js` darkColors updated to nearly-black Telegram style (12 color changes: background #070A0F, card #131820, border #262D38, etc.)
- **Theme compatibility:** `DashboardPeriodFilter.js`, `MetricsBar.js`, and `CombinedAccountsCard.js` updated to use `colors.card`/`colors.border` for automatic light/dark adaptation
- **Font sizing:** MetricsBar amount updated to 18px (matches card amounts); section headers increased to 13px for readability
- **Account cards:** Removed rounded corners and outer borders for cleaner, minimal design; individual row dividers now theme-compatible
- **Expenses Accounts fix:** Secondary value changed from Balance to Expenses (SSOT fix at source)
- **AllAccountsScreen ScrollView:** Added Ledger-style container with borderRadius: 12, borderWidth: 1.5, margins 8px, and shadow/elevation properties for consistency
- **Files modified:** `theme.js` (darkColors), `DashboardPeriodFilter.js`, `MetricsBar.js`, `CombinedAccountsCard.js`, `AllAccountsScreen.js`

## Credit-Type Impact Map (verified 2026-04-30 01:50:36 +05:30)
- DB/type constraint owner: `src/services/accountsDatabase.js` now allows `credit`; default-account bootstrap and protected-delete rules still live here.
- Readiness/type presence owner: `src/services/dbLifecycleManager.js` now reports `hasCredit`, but readiness still requires earning/expenses/saving only.
- Add-account owner: `src/screens/AddAccountScreen.js` now supports `credit` create flow and reuses expenses tags/text family for it.
- All Accounts section/add-menu owner: `src/screens/AllAccountsScreen.js` now exposes `Add Credit Card Account` and renders `Credit Card Accounts` between savings and expenses only when credit accounts exist. It also owns the one-time credit availability notice.
- Route owner: `src/navigation/AppNavigator.js` now registers `CreditCardAccountDetail`; dashboard/all-accounts routing is now ternary: earning vs credit vs other non-earning.
- Shared entry owner: `src/screens/AmountEntryScreen.js` now supports `credit` and `payBill`, but CTA behavior should be reviewed whenever credit interaction rules change because it still reuses the withdraw/request screen family.
- Shared metric-label owner: `src/components/DashboardPeriodFilter.js` and `src/components/ui/MetricsBar.js` now support configurable labels for credit detail.
- Linked-transaction search owner: `src/services/transactionLinkResolver.js` now includes credit accounts in linked-entry search.
- Strict Eco owner: `src/services/transactionsDatabase.js` and `src/services/strictEcoService.js` currently treat only earning/expenses as strict-eco-eligible accounts.
- Visual/type fallback owner: `src/ui/accountVisuals.js` supports `credit` as a real type with its own icon rotation pool, credit-card tags, and credit-only dark matte colors. `AddAccountScreen.js` and `PersonalizeAccountScreen.js` select those colors only for credit accounts.
- Net-balance helper owner: `src/utils/dashboardNetBalance.js` only has special handling for saving exclusion; any credit inclusion/exclusion decision will pass through here.
- History classification owner: `src/services/transactionHistorySelectors.js` classifies by amount and linked-entry remark rules, so credit can likely reuse it unless new labels are required.
- Base-freeze rule for future implementation: current earning/expenses/saving behavior should remain frozen; only shared owners that gate new type support should be extended.
- Fresh default bootstrap: `src/services/accountsDatabase.js` creates `Bank Credit Card` only for fresh empty account databases; existing users are not auto-seeded with credit.

## Backend Architecture Snapshot (2026-04-29 15:43:40 +05:30)
- `backend/index.js` is the backend route root. Active mounted namespaces are `/api/auth`, `/api/messages`, `/api/users`, `/api/ledger`, and `/api/internal`.
- `backend/routes/auth.js` owns sign-in/setup/login/profile mutation and phone-claim flows. It also normalizes phone numbers, syncs `PhoneLink`, and cooperates with `services/fcmTokenState.js` for token ownership and uninstall state.
- `backend/routes/users.js` owns authenticated profile sync, global search, username/mobile visibility shaping, and token reassignment during profile sync.
- `backend/routes/messages.js` owns chat push delivery. It validates sender/receiver/conversation pairing, stores delivery state in `MessageDelivery`, resolves receiver by `firebaseUid`, and sends FCM payloads.
- `backend/routes/ledger.js` owns ledger event sync between users. It normalizes op/entry type/amount, resolves peer user, and sends FCM `ledger_event` payloads.

## Ledger Performance Optimizations (2026-05-08 - COMPLETED)
- **React.memo optimization** → Wrapped 4 child components in LedgerContactDetailScreen to prevent re-renders on keystroke (1700ms → <400ms)
- **Instant state updates** → Decoupled UI updates from background sync in `submitTransaction()` (toast/modal now instant, sync happens silently)
- **Peer ID caching** → Cached peer ID when contact loads, reused for all transactions (non-app user subsequent txns: 1500ms → instant)
- **Chat deletion audit** → Scanned for orphaned data; confirmed proper cascade delete, no soft-delete mechanism found
- **Files modified:** `LedgerConversationTimeline.js`, `LedgerContactHeader.js`, `LedgerMetricsBar.js`, `LedgerBottomActions.js`, `LedgerContactDetailScreen.js`, `useLedgerChatController.js`

## Known Issues (2026-04-28)

### Ledger phoneNumbers Truncation
- **Files affected:** `src/screens/LedgerScreen.js` (line 351, line 537)
- **Issue:** `persistContacts()` and `handleAddContact()` truncate full `phoneNumbers` array to single phone number during persist
- **Impact:** Contact phone data loss after save/reload; detail screens receive incomplete phone data
- **Root cause:** `phoneNumbers: phone ? [{number: phone}] : []` truncates array to first valid number
- **Status:** Known, not fixed (recovery logic would add performance overhead)

### LedgerContactDetailScreen Signal Issue  
- **Files affected:** `src/screens/LedgerContactDetailScreen.js`, `src/hooks/useLedgerChatController.js`
- **Issue:** When contact has missing phoneNumbers, `mapContactToAppUser()` early-returns without sending backend signal to verify user state
- **Impact:** Old contacts with empty phoneNumbers stay stuck as "non-app user"; state never refreshes
- **Root cause:** Line 403-412 in `useLedgerChatController.js` — `getContactPhone()` returns `'No phone number'` → early return
- **Dependency:** Caused by phoneNumbers truncation in LedgerScreen persist
- **Status:** Known, not fixed (would require recovery logic from device cache)

### Duplicate Contact (Identity Inconsistency)
- **Files affected:** `src/screens/LedgerScreen.js` (dedupe logic line 460), `src/screens/LedgerAddContactScreen.js`
- **Issue:** Non-app contacts added after uninstall create duplicate records instead of updating existing contact
- **Root cause:** Identity format inconsistency — uninstalled app users have `recordID: app_<userId>`, but newly added non-app users have device `recordID`. Dedupe logic fails to match same person across both formats
- **Scenarios:** 
  - New non-app (never app user) → no duplicate ✓
  - Uninstalled (was app user) + re-add as non-app → duplicate created ✗
- **Status:** Known, not fixed (SSOT fix attempted but caused performance regression and app lag)
- Notification tap behavior: `AccountApp/index.js`, `AccountApp/App.tsx`, `src/services/notificationNavigationService.js`, `src/services/chatNotificationActionService.js`
- Phone claim flow: `AccountApp/App.tsx`, `src/services/phoneClaimNavigationService.js`, `backend/routes/auth.js`
- Scheduled entries/exact alarms: `src/services/recurringDatabase.js`, `src/services/scheduledActionExecutor.js`, `src/services/scheduledAlarmService.js`, `android/app/src/main/java/com/jasmeet/accountapp/ScheduledAlarmModule.kt`
- Backup/restore: `src/services/backupService.js`, `src/services/postRestoreRepairService.js`, `src/screens/BackupScreen.js`
- Backup version retention: `backup.versionCount` defaults to 2; user can select 1/2/3 backups in Backup screen. Retention pruning applies after successful backup upload. Header/login restore remain latest-only.
- Restore live settings/currency refresh: `src/services/backupService.js`, `src/services/backupRestoreEvents.js`, `src/context/ThemeContext.js`, `src/context/HeaderTextureContext.js`, `src/context/SessionUserContext.js`, `src/hooks/useCurrencySymbol.js`

## Core Data Ownership
- Accounts table: `src/services/accountsDatabase.js`
- Accounts change notifications: `src/services/accountsChangeBus.js`
- Transactions table + global recent/full-history reads: `src/services/transactionsDatabase.js`
- Ledger transactions: `src/services/ledgerDatabase.js`
- Chat local DB: `src/services/chatDatabase.js`
- Recurring schedules: `src/services/recurringDatabase.js`
- DB readiness glue: `src/services/dbLifecycleManager.js`

## Backend Endpoints (Fast Map)
- Auth: `backend/routes/auth.js`
- Users/profile/token: `backend/routes/users.js`
- Messages/delivery: `backend/routes/messages.js`
- Ledger sync: `backend/routes/ledger.js`
- Internal audit: `backend/routes/internal.js`

## Hotspot Files (Edit Carefully)
- `src/screens/ExpensesAccountScreen.js`
- `src/screens/EarningAccountScreen.js`
- `src/screens/LedgerContactDetailScreen.js`
- `src/screens/AmountEntryScreen.js`
- `src/screens/DashboardScreen.js`
- `src/services/messagingService.js`
- `src/screens/LedgerScreen.js`
- `backend/routes/auth.js`

## Minimal Working Protocol
1. Task classify karo.
2. Is file se exact target files pick karo.
3. Sirf un files + immediate dependencies read karo.
4. Agar still unclear ho tab `docs/CODE_AUDIT.md` ka relevant section open karo.

## Security Fixes Log
- ✅ **[2026-04-20]** Removed PII debug logs from `src/screens/BackupScreen.js` (lines 261-277) — prevented `firebaseUid`, email, backup IDs exposure in production console
- ✅ **[2026-04-20]** Fixed permanent listener leaks in `src/services/messagingService.js` — `cleanupMessagingListeners()` exported, called on logout in `MoreScreen.js`
- ✅ **[2026-04-20]** Removed PII/sensitive logs from `src/services/backupService.js` — `firebaseUid`, `accountEmail`, `fileId`, Drive metadata deleted; path/process logs wrapped in `__DEV__`. `handleDebugInfo()` removed from `BackupScreen.js`.
- ✅ **[2026-04-20]** Deleted wrong-project web files — `src/context/NotificationContext.js`, `src/common/index.js`, `src/components/MarkUpdateForm.js`
- ✅ **[2026-04-21]** Production console.log cleanup — `messagingService.js`, `chatInitializer.js`, `accountsDatabase.js`, `chatDatabase.js`, `tokenManager.js` — PII logs deleted, process logs wrapped in `__DEV__`, `console.error/warn` untouched
- ✅ **[2026-04-21]** Fixed untracked setTimeout calls — `AllAccountsScreen.js` (`deletePressTimerRef`, `renameTimerRef`, `focusRenameTimerRef`), `ExpensesAccountScreen.js` (`renameTimerRef`, `focusTimersRef` array, duplicate rename focus effect removed), `EarningAccountScreen.js` (`renameTimerRef`), `ToastContext.js` (`toastTimersRef` Map) — clearTimeout before set + useEffect cleanup added across all
- ✅ **[2026-04-21]** Production console.log cleanup (batch 2) — `LoginScreen.js` (raw Google ID token, Firebase UID, backend responses deleted), `ledgerDatabase.js` (contact displayName deleted), `ledgerSyncService.js` (peerUserId logs deleted), `HelpBotScreen.js` (user query text deleted), `driveService.js`, `database.js`, `transactionsDatabase.js`, `NotificationService.js`, `AmountEntryScreen.js` — all wrapped in `__DEV__`. Production PII/token exposure eliminated across all service and screen files.
- ✅ **[2026-04-21]** Production console.log cleanup (batch 3) — `LedgerContactDetailScreen.js` (bubble trace logs wrapped), `notificationNavigationService.js` (`NOTIF_ROUTER` logger kept behind explicit dev/router guard), `transactionTimeline.js` (`CHECK-*` debug traces kept behind explicit dev guard), `chatDebugLogger.js` and `perfLogger.js` made explicit dev-only helpers
- ✅ **[2026-04-21]** Startup route correctness fix — `App.tsx` now treats `Home` as the only dashboard-ready route; dead `DashboardHome` check removed so deferred startup work binds to the registered navigator route
- ✅ **[2026-04-21]** Deleted dead screens — `src/screens/HomeScreen.js`, `src/screens/ChatScreen.js`, `src/screens/UserSearchScreen.js`
- ✅ **[2026-04-21]** Deleted dead utility modules — `src/utils/dashboardLogger.js`, `src/utils/mainChatIdentityState.js`
- ✅ **[2026-04-22]** Dashboard startup blink correction — removed the Android startup shield overlay from `App.tsx`; `Home` stack transition now uses `animation: 'none'` so startup relies on the existing route resolver instead of a blank masking layer
