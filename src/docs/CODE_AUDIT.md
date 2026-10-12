# CODE_AUDIT

## Chat responsiveness — verified findings, 2026-10-12
- Original controlled input had competing native typing and delayed JS clears. Example: native event count 16 preceded a clear command carrying count 12; ReactEditText rejects stale event-count updates. This explains retained text / letters joining during rapid sends. Native composing-span logs were -1 in the captured examples.
- Moving draft consumption to an asynchronous native module improved performance but did not fix the physical send boundary or JS-driven button enablement; owner reproduced repeated letters and delayed button.
- Final Android boundary is `ChatSendButtonManager.kt`: a TextWatcher enables/disables from actual input contents, touch reads and clears the same native input synchronously, and a non-coalescing direct event carries text and press time to JS. `ChatComposer.js` avoids per-keystroke screen state. `ChatDraftModule.kt` was removed.
- The existing optimistic insertion, message IDs and durable DB/retry pipeline remain intact. Native clear does not mean network delivery completed; the queue is persisted in `sendMessageToUser` before transmission. DB-failure draft recovery is not newly implemented by this work.
- Bubble cost was separately measured in development: initial layout callbacks were 427–934 ms after touch; list profiler peak was 251 ms. Row extraction alone was insufficient because date/time formatting still ran outside memoization (51 rows / 65 ms in one sample).
- `LedgerMessageBubble.js` now receives primitive display/selection props; React.memo skips unchanged message bubbles, and useMemo avoids repeating date/time formatting for an unchanged timestamp. Existing selection callbacks are stable. Native composer and delivery services were not redesigned for the bubble work.
- After this change, sampled new-bubble renders were approximately 16–34 ms, while development layout callbacks still lagged 205–446 ms. These are JS onLayout callbacks, not exact pixel presentation timestamps. Development/runtime overhead remained a hypothesis until a same-code release comparison.
- Release build `3.0.0.14` / `114001` passed; installed package lacked DEBUGGABLE; owner replied “haan ab fast hai”. This supports release responsiveness improvement, but does not establish a numerical release latency or attribute all remaining development delay to a single cause.
- New bubble/timeline components passed eslint. Screen has existing lint findings outside this change. Fast typing/send was owner-tested; draft back-press, selection and offline/reconnect acceptance were not separately confirmed by the latest brief reply. Delivery queue regression suite previously passed 23 tests during native send work.
- Originals and measurements are in `../backup/fix11-bubble-timing`; native-boundary originals are in fix10. Temporary BUBBLE_TRACE / V11 profiler/layout probes were removed after the release test.


## Ledger Talk delivery Phase 1 + 2 — verified 2026-10-10
Supersedes the "backend not changed/deployed" notes in the 2026-10-09 section below.

### Phase 1 — messaging lifecycle owned by the account (`App.tsx`)
- **Root cause (proven):** `scheduleDashboardDeferredStartupWork` started `initMessagingService()` only when `navigationRef.getCurrentRoute().name === 'Home'`. `getCurrentRoute()` uses `findFocusedRoute()` and returns the nested tab (`Dashboard`); `Home` was visible ~270ms while the gate polled every 350ms. Device logs had no `✅ Messaging service initialized`.
- **Effect before fix:** no foreground FCM listener (receipts/messages ignored while app open), no FCM token sync, no `recoverDeliveryInbox`, no AppState/network recovery listeners. Incoming chat arrived only via chat-open `/pending-sync`.
- **Fix:** new `scheduleMessagingInitForUser(uid)`; `onAuthStateChanged` calls it next to `scheduleDashboardDeferredStartupWork()` (whose `uidOverride` param was removed). Keeps the 2.2s defer and `messagingInitForUidRef` guard; skips init if the UID changed before the timer fired; logout clears the pending timer; effect cleanup resets the guard so a re-subscribed auth listener can re-schedule. Update check / deferred ledger sync remain Dashboard-gated (unchanged).
- **Verified:** device logs show init + token sync + inbox recovery; owner two-device test OK.

### Phase 2A — sender status reconciliation (`chatDatabase.js`)
- `getMessagesAwaitingRead`: was `SELECT id … AND id > ? ORDER BY id`; `messages` has no `id` column (PK `message_id`), so `recoverDeliveryInbox` threw `no such column: id` before calling `/messages/statuses` — missed receipt pushes could never be repaired. Now `SELECT rowid AS id … AND rowid > ? ORDER BY rowid`. Caller (`messagingService.recoverDeliveryInbox`, reads `row.id`) unchanged.
- Test: `sender status recovery pages only own unread rows on the real messages schema` (failed with `no such column: id` before fix).

### Phase 2B — bounded backend re-push (`backend/services/deliveryService.js`)
- `dispatchOne` query adds `retryCount: {$not: {$gte: MAX_PUSH_ATTEMPTS}}` (`$not` also matches legacy rows without the field). `MAX_PUSH_ATTEMPTS = 10` (exported). Rows past the cap stay `accepted/pushed`, so `/messages/inbox` still returns them on next app start/reconnect.
- `dispatchBatch` default budget 20000 → `DISPATCH_BUDGET_MS = 8000` (serverless invocation limit).
- Test env: `tests/delivery.node.cjs` now uses `mongodb-memory-server` (devDependency) instead of a local `mongod.exe` that failed to start; the 7 existing backend tests executed for the first time and pass, plus new cap test (8/8).
- Deployed: commit `f8e0a65`, Vercel.

### Phase 2C — retry trigger
- `POST /api/internal/delivery-dispatch` (guarded by `verifyCronSecret`, `routes/internal.js`) is called every minute by cron-job.org. `vercel.json` cron still runs only the daily `fcm-token-audit`. The same `CRON_SECRET` also guards `GET /fcm-token-audit` — rotate it if ever exposed.

### Known gaps (not in this phase)
- Receiver receipt retry runs only while app is foreground (`scheduleDeliveryRetry`); no Android WorkManager.
- `backend/scripts/delivery-worker.js` (continuous worker) is unused on Vercel; cron replaces it.
- Typing / "Updating ledger…" need an always-on host (Vercel has no persistent connections).

## Identity & uninstall — verified findings 2026-10-10 (NOT fixed; redesign on hold pending owner approval)
- **Phone wiped on one FCM error:** `fcmTokenState.markUserAsUninstalled` sets `appInstallState='uninstalled'` and phone `reclaimable` with `PHONE_RECLAIM_GRACE_MINUTES = 5`; `releaseExpiredPhoneOwnerships` (run lazily by `/auth/users-by-phones`, phone checks, daily audit) then sets `mobile=null`, `PhoneLink.isCurrent=false`, `setupComplete=false`. FCM "not registered" also occurs on data clear/reinstall/token rotation.
- **Inconsistent meaning of `uninstalled`:** ledger push (`routes/ledger.js`), phone-claim push (`routes/auth.js` sendPush), and audit → uninstalled + phone release; chat dispatch → only nulls token; logout (`detachTokenForUser`) and same-device account switch (`detachTokenFromOtherUsers`) → `uninstalled` without uninstall.
- **Inconsistent effect:** phone-claim/ledger pushes skip `uninstalled` users; chat `/send` does not check it; app `useMainChatSystemState` shows Invite for `uninstalled`.
- **App resolver flips state:** `useLedgerChatController` persists `uninstalled` when phone lookup misses, but forces `INSTALLED` on cached-UID fallback.
- **Discovery duplicates possible:** `/auth/users-by-phones` can emit `number_changed` and fallback `app_user` for the same phone (code path; not data-verified).
- **Unique indexes likely missing:** `models/User.js` partial indexes use `$ne` (username, mobileNormalized, fcmToken); mongod 7.0 and 8.0 reject them ("Expression not supported in partial index"). Production index state not yet verified.
- Proposed direction (owner decision pending): separate Account (UID) / Device reachability / Phone ownership; never release phone on token error; derive installed/uninstalled from device activity window. Step I-1 = stop phone release on token error and stop logout/switch marking uninstalled.

## Ledger Talk local delivery foundation — verified 2026-10-09
- `chatDatabase.js`: outgoing message + retry queue + conversation metadata commit in one SQLite transaction. Incoming message + receipt commit together. Receipt queue is account-scoped; read obligations cover all unread incoming rows and survive request failure. Status writes cannot downgrade delivered/read. Retry lookup no longer abandons rows after three failures; legacy sending/queued rows can reconstruct their missing queue entry.
- `messagingService.js`: persists before network, validates delivery response, retains accepted-only local obligations against the current backend, prevents concurrent sends of one message, and drains due work on foreground reconnect/activation. A receiver acknowledgement avoids resending. Foreground retry timer runs only while account-owned chat work exists. Background WorkManager integration is not implemented yet.
- `ledgerSyncService.js`: AsyncStorage queue mutations serialize; acknowledgement removes only the completed event from the latest queue. Events are persisted before POST, deduplicated by source/peer/idempotency identity, retained on backend queued responses, and sent only under matching account credentials. Ledger entry creation and outbox enqueue are still separate; atomic ledger commit/outbox remains pending.
- `deliveryTransport.js`: shared 15-second deadline covers HTTP response headers and body; bounded retry backoff.
- `chatSystem.js`: local read state and all required read receipts commit together; one callback starts the receipt drain.
- Validation: 18 real-SQLite/mocked-network tests passed; Android production JS bundle passed; no new lint errors, 10 new no-void style warnings. No APK/device delivery claim is made.
- Current backend was not changed or deployed in this stage. Durable backend delivery/inbox, status retention/reconciliation, typing, native background recovery, token/identity separation, backup-restore replay protection and two-device validation remain pending.
- Paid/Get buttons, ledger database/calculations and ledger transaction command remain unchanged. Original versions of changed existing files are under `E:/savingo/backup/fix1`.

Last updated: 2026-06-23 00:00:00 +05:30
Scope: Android-focused full-repo audit for `E:\account-android-app`.
Primary app: `AccountApp` (React Native Android). Secondary runtime: `backend` (Node/Express API used by app).

### Recent Changes (2026-05-13)
- **Dark theme:** Nearly-black color scheme applied to darkColors in theme.js
- **Theme compatibility:** Core UI components (DashboardPeriodFilter, MetricsBar, CombinedAccountsCard) use dynamic colors for automatic light/dark adaptation
- **Account cards redesign:** Removed rounded corners, borders; cleaner minimal look with theme-compatible dividers
- **Expenses Accounts:** Fixed to show expenses (not balance) in secondary value
- **AllAccountsScreen container:** ScrollView now styled with Ledger-style rounded corners, borders, margins, and shadow

### Recent Changes (2026-05-15)
- **Expenses withdraw independent:** Expenses withdraw was separated from Primary/Auto Get. Current balance-first row shape is documented in the 2026-06-22 account-flow notes below.
- **Earning withdraw independent:** Earning withdraw was separated from Primary/Auto Get. Current balance-first row shape is documented in the 2026-06-22 account-flow notes below.
- **Stable same-time ordering:** `getTransactionsByAccount()` now orders by `transaction_date DESC, id DESC` so same-timestamp latest rows stay visually consistent.
- **Auto Get UI removed:** Personalize screen no longer shows `Auto-fund from Primary`; personalization saves icon/color only. The DB column remains for compatibility until full primary cleanup.
- **Ledger account isolation:** Ledger Paid/Get is record-only for ledger balances. Old primary prompts/defaults/account-transaction bridge were removed from `LedgerContactDetailScreen.js`, `useLedgerTransactionsController.js`, and `ledgerCommandService.js`.

### Recent Changes (2026-06-22)
- **Balance-first withdraw correction:** `AmountEntryScreen.js` now uses the current expenses balance first for immediate expenses and earning withdraw flows. Expenses withdraw skips source selection when the current budget covers the amount; otherwise only the shortfall is sourced from the selected earning/credit account. Earning withdraw consumes the selected expenses balance first and only uses the opened earning account for the shortfall. Both immediate shortfall paths write source debit, expenses transfer credit, then full expenses withdrawal debit. Credit withdraw stays on its isolated expenses-selection path.
- **Account action contract:** `src/docs/ACCOUNT_ACTION_CONTRACT.md` freezes expected transaction row shapes for expenses withdraw, earning withdraw, credit withdraw, pay bill, add budget, add amount, and transfer. Read it before changing account action behavior.
- **Credit withdraw immediate alignment:** `AmountEntryScreen.js` now mirrors scheduled credit withdraw row shape for immediate credit withdraw: credit debit, expenses transfer credit, expenses withdrawal debit, and credit log. Credit limit validation remains before writes.
- **Credit limit save feedback:** `PersonalizeAccountScreen.js` now shows an updating state while a credit card limit change is being persisted.
- **Expenses/earning shortfall row-shape alignment:** `AmountEntryScreen.js` now writes externally funded expenses/earning withdraw shortfalls as source debit, expenses transfer credit, then full expenses withdrawal debit. This keeps expenses detail metrics source-driven by transaction rows instead of adding metric-side special cases.
- **Scheduled withdraw caveat:** `scheduledActionExecutor.js` currently mirrors credit withdraw row-shape, but does not implement the immediate balance-first shortfall row-shape for earning/expenses withdraw. Review this before enabling or changing scheduled earning/expenses withdraw behavior.

## 1) Audit Objective
Is file ka purpose future AI/agent ko fast orientation dena hai:
- codebase ka structure turant samjhe
- task ke liye exact files target kare
- unnecessary full-repo search avoid ho
- token/time consumption kam ho

## 2) Repo Boundaries (Active vs Archive)
### Active runtime code
- `AccountApp/` -> Android app code (JS/TS + Android native Kotlin)
- `backend/` -> API server used by app

### Mostly documentation/reference
- `AccountApp/docs/`
- root docs/planning files: `PROJECT_STATUS.md`, `PLAN_B_MODERNIZATION.md`, etc.

### Legacy/backup/noise (normally ignore for feature work)
- `backup/`
- `AccountApp/src/backup/`
- `AccountApp/src/screens/backup/`
- generated binaries/logs under `AccountApp/android/app/release/`, `*.log`, `*.asdb`, `*.heapprofd`

Rule: pehle active files analyze karo; backup folders sirf historical comparison ke liye.

## 3) High-Level Architecture
### App entry and shell
- `AccountApp/index.js`
  - registers app, Notifee background handler, FCM background message handler, headless schedule task
- `AccountApp/App.tsx`
  - startup orchestration, startup route resolution, notification open-intent routing, in-app update check, phone-claim modal flow, global providers

### Navigation
- `AccountApp/src/navigation/AppNavigator.js`
  - root stack (`Boot`, `Login`, `PreparingApp`, `Home`, detail/native routes, `GlobalTransactionHistory`)
- `AccountApp/src/navigation/MainTabNavigator.js`
  - main tabs: `Dashboard`, `Ledger`, `More`
- `AccountApp/src/navigation/DashboardStackNavigator.js`
- `AccountApp/src/navigation/LedgerStackNavigator.js`

### Android native bridge layer
- `AccountApp/android/app/src/main/java/com/jasmeet/accountapp/MainApplication.kt`
  - registers manual RN packages: `VersionInfoPackage`, `AccountShortcutPackage`, `ScheduledAlarmPackage`
- `MainActivity.kt`
  - launch intent persistence for account shortcuts
- `ScheduledAlarmModule.kt`, `ScheduledAlarmReceiver.kt`, `ScheduleHeadlessService.kt`, `ScheduleWorker.kt`, `ScheduledBootReceiver.kt`
  - exact alarm + headless processing pipeline
- `AccountShortcutModule.kt`
  - add-to-home-screen and consume pending shortcut payload

### C) Theme System
- `AccountApp/src/utils/theme.js` (lightColors, darkColors, spacing, fontSize, fontWeight)
  - darkColors (2026-05-13): Nearly-black scheme with Telegram-style neutral grays
    - background: #070A0F (screen bg)
    - card: #131820 (cards/panels/modals)
    - border: #262D38 (dividers/borders)
    - input: #1C2433 (input fields)
    - All components auto-adapt via useTheme() hook
  - lightColors (unchanged): Standard light grays/whites
- `AccountApp/src/context/ThemeContext.js` (theme provider with isDark flag)
- All styling uses `colors` object from theme for automatic light/dark support

### Backend API
- `backend/index.js` mounts routes:
  - `/api/auth`
  - `/api/messages`
  - `/api/users`
  - `/api/ledger`
  - `/api/internal`

## 4) Domain Map (What lives where)
### A) Startup/Auth/Session
- `AccountApp/src/screens/LoginScreen.js` (Google sign-in + backend signin + startup flags)
- `AccountApp/src/services/startupOrchestrator.js` (first run phase A + deferred phase)
- `AccountApp/src/services/startupCoordinator.js` (route decision + readiness invariants)
- `AccountApp/src/services/sessionService.js` (canonical cached session user)
- `AccountApp/src/services/api.js` (`/auth/*` calls, axios interceptors)

### B) Dashboard + Accounts + Transactions + AllAccounts Screen
- `AccountApp/src/screens/DashboardScreen.js`
- `AccountApp/src/screens/AllAccountsScreen.js` (account sections container with Ledger-style ScrollView: rounded corners, border, margins, shadow; sections/order: Earning, optional Savings, optional Credit Card, Expenses)
- `AccountApp/src/ui/CombinedAccountsCard.js` (account card sections renderer; straight edges with no outer border; section headers theme-compatible; row dividers use colors.border)
- `AccountApp/src/components/DashboardPeriodFilter.js` (period/metrics bar tabs; uses colors.card for automatic theme adaptation)
- `AccountApp/src/components/ui/MetricsBar.js` (reusable metrics display; amount 18px fontSize.large, label 13px; background colors.card for theme support)
- `AccountApp/src/services/accountsPeriodCore.js` (shared period/date-range aggregation core for dashboard and all-accounts flow)
- `AccountApp/src/services/accountsPeriodStateStorage.js` (shared period selection persistence for all-accounts and account-detail flows, keyed by `scope` + `accountId`; clears a corrupt stored entry on parse failure so wallet open does not keep replaying the same JSON error)
- `AccountApp/src/components/DashboardCalendarSheet.js` (dashboard period clear/apply wiring)
- `AccountApp/src/components/RecentTransactionsPreview.js`
- `AccountApp/src/screens/GlobalTransactionHistoryScreen.js`
- `AccountApp/src/screens/EarningAccountScreen.js`
- `AccountApp/src/screens/ExpensesAccountScreen.js`
- `AccountApp/src/screens/AmountEntryScreen.js`
- `AccountApp/src/services/accountsDatabase.js` (accounts table + account CRUD)
- `AccountApp/src/services/transactionsDatabase.js` (transactions table + CRUD + balances + global add/withdraw reads for dashboard/full-history; `getTransactionsByAccount()` uses `transaction_date DESC, id DESC` for stable same-time ordering)
- `AccountApp/src/services/transactionTimeline.js` (balance-at-time logic)
- `AccountApp/src/services/accountTransactionPolicy.js` (delete policy)
- `AccountApp/src/services/accountsChangeBus.js` (`accounts` domain notification core: publish + subscribe + normalized payload)
- `AccountApp/src/screens/PersonalizeAccountScreen.js` publishes `accounts` domain change after successful personalization writes; Auto Get UI is removed and personalization no longer writes `auto_fund_primary`
- `AccountApp/src/screens/AddAccountScreen.js` publishes `accounts` domain change after successful account creation so All Accounts/Dashboard use their existing subscribers instead of relying on focus refresh
- `AccountApp/src/ui/accountVisuals.js` owns account visual data and auto-selection rules: shared account color options, tag/icon pools, reserved semantic colors, credit-only dark matte colors, `getNextAccountVisual`, and `getBestAccountVisualForName` for name-based fresh/default/CSV account creation. Name matching uses category icon/color pools so repeated salary/income-style accounts rotate through relevant icons/colors before repeating, and installment/EMI names use payment-style visuals instead of shopping/cart visuals. `AccountIcon` remains the render owner; Add Account and Personalize consume shared visual options without layout ownership. Credit accounts use credit-only colors in Add Account/Personalize, while non-credit palettes stay unchanged.
- `AccountApp/src/screens/AllAccountsScreen.js` subscribes to `accounts` domain changes and soft-refreshes
- `AccountApp/src/screens/DashboardScreen.js` subscribes to `accounts` domain changes and reloads account/dashboard data
- `AccountApp/src/screens/SettingsScreen.js` publishes an `accounts` domain change after dashboard reset succeeds, so mounted Dashboard and All Accounts refresh through their existing `accountsChangeBus` subscribers without app restart. `dashboardResetService` remains the data-reset owner.
- `AccountApp/src/screens/AllAccountsScreen.js` no longer renders its own recent transaction preview; Dashboard/Global History remain the recent transaction owners. Settings labels call the destructive reset "Reset All Accounts Data" while `dashboardResetService` remains the reset implementation owner.
- `AccountApp/src/screens/DashboardScreen.js` promo donut uses the shared `dashboardNetBalance` helper for the green balance slice, then `accountsPeriodCore.periodAccountExpenses` cuts by account icon color across dashboard-visible non-earning accounts, with earning-account negatives grouped into an Other Expenses slice instead of the income account color, plus savings cut only when saving accounts are not hidden; donut inner percent derives from the donut total composed of green + visible expenses + visible savings, and `DashboardBalanceDonutCard` stays render-only
- `transactionSemantics.js` owns shared transaction meaning helpers such as `pay_bill`. Dashboard period calculation uses that semantic rule to exclude credit bill settlement from red expense slices while preserving the underlying earning debit and credit inflow entries.
- Donut center text lives in `AccountApp/src/components/ui/DashboardBalanceDonutCard.js` and currently shows earning remaining percentage derived in `DashboardScreen.js`
- Donut center percentage typography is also owned by `AccountApp/src/components/ui/DashboardBalanceDonutCard.js`
- Donut footer spacing for `Earning`/`Expenses` labels is also controlled in `AccountApp/src/components/ui/DashboardBalanceDonutCard.js`
- Donut footer horizontal inset for `Earning`/`Expenses` labels is also controlled in `AccountApp/src/components/ui/DashboardBalanceDonutCard.js`
- Donut footer vertical proximity to the ring is also controlled in `AccountApp/src/components/ui/DashboardBalanceDonutCard.js`
- `AccountApp/src/screens/DashboardScreen.js` now uses a local period recompute helper so quick-period/calendar changes update the screen immediately without waiting for focus or accounts-change events
- `AccountApp/src/screens/DashboardScreen.js` owns the stacked expenses bar below the donut; it divides 100% of the bar across period expense-account amounts only and does not include a balance slice
- `AccountApp/src/services/accountsDatabase.js` owns the current per-account balance truth via `accounts.balance`, while `AccountApp/src/services/transactionsDatabase.js` only fetches row lists and wires them to that SSOT output
- Top-right savings text in the donut card is prop-driven from `DashboardScreen.js` and uses the same hide-savings gate as the orange savings segment
- Net balance, savings, earning, and expenses alignment inside the donut card is owned by `AccountApp/src/components/ui/DashboardBalanceDonutCard.js`
- Top-row vertical offset toward the donut is also controlled in `AccountApp/src/components/ui/DashboardBalanceDonutCard.js`
- Small vertical fine-tuning for top-row proximity to the donut is also controlled in `AccountApp/src/components/ui/DashboardBalanceDonutCard.js`
- Savings label casing/size consistency is also controlled in `AccountApp/src/components/ui/DashboardBalanceDonutCard.js`
- `AccountApp/src/components/ui/PageHeader.js` is the reusable clean textured header scaffold for non-account detail pages such as Transaction History / More-style screens
- `AccountApp/src/screens/TransactionHistoryScreen.js` uses `PageHeader` instead of its old local manual header block
- `PageHeader` should stay aligned with `MoreScreen` header spacing/back-button/spacer rules; subtitle support is layered on top of that exact layout

#### Account Detail Working Snapshot (verified 2026-04-30 01:10:37 +05:30)
- `accountsDatabase.js` is the account-row SSOT owner. It creates the `accounts` table, now allows `earning`/`expenses`/`saving`/`credit`, inserts default earning/expenses/saving accounts plus fresh-only credit default, protects saving deletion plus primary-earning deletion, and stores current balance in `accounts.balance`.
- Fresh empty account databases now receive a fourth default account, `Bank Credit Card`, through the existing default bootstrap. Existing users are not auto-seeded with credit because credit default creation is gated to the pre-default empty-table case.
- `transactionsDatabase.js` is the transaction-writer owner. Every create/delete/edit operation updates `accounts.balance` by recomputing active transaction sum; no screen owns long-term balance state.
- `creditLimitPolicy.js` is the shared credit-limit rule owner. It decides whether a credit debit would move the account beyond `accounts.credit_limit`, and the write paths reuse it instead of splitting the rule across screens and schedule code.
- `transactionTimeline.js` is the shared running-balance guard. It owns chronological ordering, pending-entry simulation, edit validation, delete validation helper inputs, and the core backdated-debit rule. Credit create/transfer flows now reuse this owner through an explicit negative-allowed option rather than a separate timeline engine.
- `accountTransactionPolicy.js` is the delete-policy orchestrator. It applies linked-entry lookup and blocks deletions that would violate the running-balance model in either the current account or the linked account.
- `AmountEntryScreen.js` is the shared action-entry router. It owns direct add, withdraw, request, transfer, schedule creation, receipt attach, selected-source earning/expenses request-withdraw paths, dashboard refresh event emission, plus credit-account `credit`/`payBill`/credit-withdraw modes. Credit remains inside this shared router; no duplicate entry engine was created.
- Manual and scheduled credit `Pay Bill` create the same earning debit plus credit inflow pair as before, but now mark both rows with `entry_kind = 'pay_bill'` so dashboard classification can treat bill settlement separately from real expenses.
- `transactionsDatabase.js` now enforces the selected credit limit at write time for credit-account debits and debit-increasing edits, so limit protection survives UI and scheduled-entry bypass paths.
- `EarningAccountScreen.js` is the route owner for `AccountDetail` and is also rendered by `CreditCardAccountScreen.js`. It uses `AccountDetailHeader.js` for the sticky header and shared `DashboardPeriodFilter` metrics. Earning detail CTAs are `Withdraw` and `Add Amount`; credit detail CTAs are `Withdraw` and `Paid Bill`.
- Earning withdraw routes through `AmountEntryScreen` with `withdrawFromExpensesOnly: true`. Immediate flow selects an expenses account, consumes that expenses balance first, and only funds the shortfall from the opened earning account as earning debit -> expenses transfer credit -> full expenses withdraw debit. Immediate earning withdraw currently does not write an `[ewlog]` marker. It does not use primary earning or Auto Get.
- Credit withdraw routes through the same `withdrawFromExpensesOnly` selection UI but always fully funds the selected expenses account from credit before the expense debit: credit `-amount` transfer, expenses `+amount` transfer, expenses `-amount` withdrawal, and credit-side zero `[cwlog]` timeline marker. This keeps the selected expenses account balance unchanged net and lets the credit account go negative by the full withdrawn amount.
- `ExpensesAccountScreen.js` remains the route owner for `ExpensesAccountDetail` and multiplexes expenses + saving. Expenses and saving detail metrics use `accountDetailMetrics.js` shared display-only wrappers over one common calculation core.
- Expenses withdraw routes through `AmountEntryScreen`, uses the opened expenses balance first, and selects an earning or credit source only for the shortfall. Immediate shortfall flow writes source debit -> expenses transfer credit -> full expenses withdraw debit. It does not use primary earning or Auto Get.
- Account detail transaction-list direction should stay consistent: `getTransactionsByAccount()` returns `transaction_date DESC, id DESC`, and both earning plus expenses/credit render the main list through `FlatList inverted`. Do not add a local ASC sort before the main expenses/credit list because that reverses the visual direction.
- `DashboardPeriodFilter.js` + `components/ui/MetricsBar.js` are the current header-metric render owners for account detail and All Accounts. They support per-account-type metric labels; detail metric values for expenses/saving/credit come from `accountDetailMetrics.js`, while dashboard/all-accounts period values still come from `accountsPeriodCore.js`.
- Credit detail metrics now stay separate inside `accountDetailMetrics.js`: `Paid Bill` counts positive `Paid bill from ...` entries, `Credit Consumption` counts negative `Transferred to ...` entries, and `[cwlog]` audit rows stay out of the totals.
- `accountsPeriodCore.js` is the period-summary owner shared by dashboard and All Accounts. It computes filtered earning, filtered withdrawals, per-account period totals, and closing balances from active transactions while excluding transfer/request-style remarks from the earning/expense summary counts. Detail-only metrics for expenses/saving/credit intentionally stay in `accountDetailMetrics.js` so they do not affect dashboard or All Accounts calculations.
- `AllAccountsScreen.js` is the account section/order owner and dashboard-side navigation owner. Current visible section order is earning, optional savings, optional credit card accounts, then expenses. Empty credit section is hidden, and existing users without credit accounts get a one-time credit availability notice controlled by `creditCardAccounts.noticeDismissed.v1`. The floating add menu offers earning, credit-card, and expenses creation buttons. Account open routing is ternary: earning goes to `AccountDetail`, credit goes to `CreditCardAccountDetail`, other non-earning goes to `ExpensesAccountDetail`.
- `accountMenuActions.js` is the shared menu-definition owner. Earning, expenses/saving, and dashboard card menus are generated here; this is the right existing reuse point if a future credit-card detail needs menu parity without UI drift.
- `dbLifecycleManager.js` is the readiness gate. It now reports credit presence in readiness output but still uses earning/expenses/saving as the required bootstrap set for app readiness.
- `scheduledActionExecutor.js` now mirrors credit-account semantics inside the existing schedule pipeline: scheduled credit withdrawals/transfers may go negative, and scheduled pay-bill entries preserve bill-payment remarks. No separate schedule processor was introduced.

#### Credit-Type Impact Surface (verified 2026-04-30 01:30:42 +05:30)
- `accountsDatabase.js`
  - Hard owner of allowed account types through `ACCOUNT_TYPE_CHECK_SQL`.
  - `credit` is now supported in the shared accounts table without creating a second account store.
  - Default-account bootstrap today guarantees earning + expenses + saving presence.
- `dbLifecycleManager.js`
  - `REQUIRED_ACCOUNT_TYPES` still equals `['earning', 'expenses', 'saving']`.
  - Readiness output now also reports `hasCredit`.
- `AddAccountScreen.js`
  - Current create flow now supports `credit`.
  - `credit` currently reuses expenses tags/text and visual family.
- `AllAccountsScreen.js`
  - Owns visible account section order and FAB menu.
  - Current order is earning -> optional savings -> credit -> expenses.
  - Current add menu exposes earning + credit + expenses creation actions.
- `AppNavigator.js`, `DashboardScreen.js`, `AllAccountsScreen.js`
  - Navigation is now ternary: earning uses `AccountDetail`, credit uses `CreditCardAccountDetail`, and other non-earning uses `ExpensesAccountDetail`.
  - `CreditCardAccountScreen.js` exists as a dedicated route file but currently wraps the existing expenses-detail screen family.
- `AmountEntryScreen.js`
  - Shared action-entry router already owns type labels and type-conditional behavior.
  - Credit support now lives here through `credit` and `payBill` modes, plus credit-aware transfer/source validation.
  - This file remains a hotspot because credit interaction behavior still shares the withdraw/request UI family.
- `transactionTimeline.js`
  - Current running-balance rule remains the single owner.
  - Credit now uses an explicit `allowNegativeBalance` option instead of a separate negative-balance engine.
- `transactionsDatabase.js`
  - Strict Eco account eligibility currently hard-filters to earning + expenses.
  - OFF-session tagging/backfill logic uses the same earning + expenses filter.
- `strictEcoService.js`
  - Unsettled-account reporting currently includes only earning + expenses.
  - Credit inclusion here should be an explicit product decision, not an accidental side effect.
- `transactionLinkResolver.js`
  - Linked-entry discovery now also searches credit accounts.
- `DashboardPeriodFilter.js` and `components/ui/MetricsBar.js`
  - Metric shell is shared and now supports per-account-type labels.
  - Credit detail currently uses this shared shell for `Paid Bill`, `Credit`, and `Advance`/`Outstanding`.
- `ui/accountVisuals.js`
- `credit` is now a supported visual type with its own auto-icon pool.
- Tag/icon/color pools and per-type visual rotation are owned here.
- Credit has a credit-only dark color palette and credit-card tag presets.
- `AddAccountScreen.js` and `PersonalizeAccountScreen.js` use credit-only colors for credit accounts only.
- `dashboardNetBalance.js`
  - Only special-case today is saving inclusion/exclusion.
  - Any future credit-card balance treatment in dashboard net passes through this helper.
- `transactionHistorySelectors.js`
  - Current history classification is amount/linked-entry based (`added`, `withdraw`, `transfer`, `neutral`).
  - It can likely be reused for credit unless product requires custom history labels on top of the shared classifier.

#### Base-Behavior Lock For Future Credit Work
- Existing earning, expenses, and saving behavior should stay frozen.
- Existing transfer/request/selected-source withdraw/timeline/delete behavior for current account types should not be changed.
- Shared owners may be extended only where required to admit a new `credit` type; they should not be refactored beyond that without explicit user approval.
- Current known interaction gap: credit still reuses the shared withdraw/request UI family, so CTA behavior must be reviewed carefully before any further UX tightening.

### C) Ledger (contact-based ledger + chat-linked identity)
- `AccountApp/src/screens/LedgerScreen.js`
- `AccountApp/src/screens/LedgerContactDetailScreen.js`
- `AccountApp/src/screens/LedgerAddContactScreen.js`
- `AccountApp/src/hooks/useLedgerChatController.js`
- `AccountApp/src/services/ledgerCommandService.js` (local ledger write path; uses in-memory base for immediate domain update instead of rereading DB in the commit path)
- Ledger Paid/Get is account-isolated and record-only: it updates ledger/contact balances only and does not debit/credit any All Accounts account or primary earning account.
- `AccountApp/src/services/ledgerDatabase.js` (`ledger_transactions`, `contact_names`)
- `AccountApp/src/services/ledgerSyncService.js` (queue + send/process ledger events)
- `AccountApp/src/services/ledgerChatIdentityService.js` (identity normalization)
- `AccountApp/src/services/ledgerContactBootstrapService.js` (initial contact identity resolve)
- `AccountApp/src/services/ledgerDomain/*` (SSOT shadow/store/normalizers/parity)

### D) Chat + Messaging + Notifications
- `AccountApp/src/services/chatDatabase.js` (conversations/messages/user_cache/message_queue)
- `AccountApp/src/services/messagingService.js` (FCM init, receive, send, retry, receipts)
- `AccountApp/src/services/chatNotificationActionService.js` (notif action queue/consume)
- `AccountApp/src/services/notificationNavigationService.js` (pending chat open routing)
- `AccountApp/src/services/chatSystem.js` (active conversation/open behavior)
- `AccountApp/src/screens/ChatConversationScreen.js`

### E) Scheduling/Recurring
- `AccountApp/src/services/recurringDatabase.js`
- `AccountApp/src/services/scheduledActionExecutor.js`
- `AccountApp/src/services/scheduleProcessingService.js`
- `AccountApp/src/services/scheduledAlarmService.js` (NativeModules ScheduledAlarm bridge)

### F) Backup/Restore/Profile
- `AccountApp/src/services/backupService.js`
  - Owns backup archive creation, Drive retention, recent backup listing, and `backup.versionCount` setting. Default retention is 2 backups; valid user choices are 1, 2, or 3.
- `AccountApp/src/services/driveService.js`
- `AccountApp/src/services/postRestoreRepairService.js`
- `AccountApp/src/screens/BackupScreen.js`
  - Owns Backup Versions UI, read-back validation, storage warning text, and selected-count restore options. Header/login restore stay latest-only.
- `AccountApp/src/services/userProfileService.js`
- `AccountApp/src/services/backupRestoreEvents.js` is the restore-complete event contract. `backupService` stores `manifest.settings.currencySymbol`, merges it back into the protected session user on restore, publishes account refresh through `accountsChangeBus`, and emits `backup:restored`. `ThemeContext`, `HeaderTextureContext`, `SessionUserContext`, and `useCurrencySymbol` reload their own SSOT storage on that event so restored settings can apply without app restart.

### Backend Snapshot (verified 2026-04-29 15:43:40 +05:30)
- `backend/index.js` is the only route mount root and owns namespace registration for auth, messages, users, ledger, and internal routes.
- `backend/routes/auth.js` owns Google sign-in, username check, setup completion, login/profile endpoints, phone claim flows, and phone ownership reconciliation. It is the main owner of `PhoneLink`/`PhoneClaim` coordination with `services/fcmTokenState.js`.
- `backend/routes/users.js` owns authenticated profile sync/search/token update style flows and also cooperates with `PhoneLink` plus `fcmTokenState` for phone/token reassignment.
- `backend/routes/messages.js` owns chat push delivery pipeline and `MessageDelivery` persistence. It validates sender/receiver/conversation consistency before FCM send.
- `backend/routes/ledger.js` owns peer ledger-event delivery over FCM. It normalizes op, entry type, amount, and peer resolution before push.
- `backend/config/firebase.js` is the shared FCM admin entry point used by auth/messages/ledger routes for push sends.

## 5) Storage and DB Ownership
### SQLite/local DB files (through `react-native-quick-sqlite`)
- `accountsDB.db` is primary DB for accounts/transactions/ledger/chat/recurring services.

### Tables by service
- `accountsDatabase.js` -> `accounts`
- `transactionsDatabase.js` -> `transactions`
- `ledgerDatabase.js` -> `ledger_transactions`, `contact_names`
- `chatDatabase.js` -> `conversations`, `messages`, `user_cache`, `message_queue`
- `recurringDatabase.js` -> `recurring_schedules`
- `database.js` (legacy/local user + legacy tx support)

### AsyncStorage-heavy keys (critical flows)
- startup flags: `backup.restorePending`, `auth.requiredRouteAfterLogin`, first-run checkpoints
- session user cache: managed via `sessionService`
- ledger contact cache keys: `ledgerContacts`, `ledgerDeviceContacts`, `ledgerChatCache:*`
- notification pending-intent storage (chat/phone claim)

## 6) Backend Endpoint Map (used by app)
### Auth routes (`backend/routes/auth.js`)
- `/google-signin`
- `/check-username`
- `/complete-setup`
- `/login`
- `/user`
- `/users-by-phones`
- `/check-phone`
- `/update-profile`
- `/phone-claims/request`
- `/phone-claims/inbox`
- `/phone-claims/respond`
- `/logout`

### Message routes (`backend/routes/messages.js`)
- `/send`
- `/delivery-receipt`
- `/pending-sync`

### Users routes (`backend/routes/users.js`)
- `/sync-profile`
- `/search`
- `/update-fcm-token`
- `/token-health`

### Ledger route (`backend/routes/ledger.js`)
- `/sync`

### Internal route (`backend/routes/internal.js`)
- `/fcm-token-audit`

## 7) Task -> Exact Files (Primary Routing)
### Login/boot/route bugs
1. `AccountApp/App.tsx`
2. `AccountApp/src/services/startupCoordinator.js`
3. `AccountApp/src/services/startupOrchestrator.js`
4. `AccountApp/src/navigation/AppNavigator.js`
5. `AccountApp/src/screens/LoginScreen.js`

### Dashboard totals/account balance mismatch
1. `AccountApp/src/screens/DashboardScreen.js`
2. `AccountApp/src/services/accountsChangeBus.js`
3. `AccountApp/src/services/accountsPeriodCore.js`
4. `AccountApp/src/services/accountsDatabase.js`
5. `AccountApp/src/services/transactionsDatabase.js`
6. `AccountApp/src/services/transactionTimeline.js`

### Dashboard reset not reflected live
1. `AccountApp/src/screens/SettingsScreen.js`
2. `AccountApp/src/services/dashboardResetService.js`
3. `AccountApp/src/services/accountsChangeBus.js`
4. `AccountApp/src/screens/DashboardScreen.js`
5. `AccountApp/src/screens/AllAccountsScreen.js`

### All-accounts period/metrics mismatch
1. `AccountApp/src/screens/AllAccountsScreen.js`
2. `AccountApp/src/services/accountsChangeBus.js`
3. `AccountApp/src/screens/EarningAccountScreen.js`
4. `AccountApp/src/screens/ExpensesAccountScreen.js`
5. `AccountApp/src/services/accountsPeriodCore.js`
6. `AccountApp/src/services/accountsPeriodStateStorage.js`
7. `AccountApp/src/services/accountsDatabase.js`
8. `AccountApp/src/services/transactionsDatabase.js`

### Account icon/color personalization mismatch
1. `AccountApp/src/ui/accountVisuals.js`
2. `AccountApp/src/components/account/AccountIcon.js`
3. `AccountApp/src/screens/AddAccountScreen.js`
4. `AccountApp/src/screens/PersonalizeAccountScreen.js`
5. `AccountApp/src/services/accountsDatabase.js`
6. `AccountApp/src/services/accountSheetUploadService.js`

### Dashboard recent entries / global full history mismatch
1. `AccountApp/src/screens/DashboardScreen.js`
2. `AccountApp/src/components/RecentTransactionsPreview.js`
3. `AccountApp/src/screens/GlobalTransactionHistoryScreen.js`
4. `AccountApp/src/services/transactionsDatabase.js`
5. `AccountApp/src/navigation/AppNavigator.js`

### Add/Edit/Delete transaction issue
1. `AccountApp/src/screens/AmountEntryScreen.js`
2. `AccountApp/src/services/transactionsDatabase.js`
3. `AccountApp/src/services/accountTransactionPolicy.js`
4. `AccountApp/src/services/transactionEditHistory.js`

### Credit card selected-limit enforcement
1. `AccountApp/src/services/creditLimitPolicy.js`
2. `AccountApp/src/services/transactionsDatabase.js`
3. `AccountApp/src/services/scheduledActionExecutor.js`
4. `AccountApp/src/services/recurringDatabase.js`
5. `AccountApp/src/screens/AmountEntryScreen.js`
6. `AccountApp/src/screens/EarningAccountScreen.js`

### Credit card pay-bill dashboard classification
1. `AccountApp/src/services/transactionSemantics.js`
2. `AccountApp/src/services/transactionsDatabase.js`
3. `AccountApp/src/services/accountsPeriodCore.js`
4. `AccountApp/src/screens/DashboardScreen.js`
5. `AccountApp/src/screens/AmountEntryScreen.js`
6. `AccountApp/src/services/scheduledActionExecutor.js`

### Ledger list/contact identity mismatch
1. `AccountApp/src/screens/LedgerScreen.js`
2. `AccountApp/src/services/ledgerChatIdentityService.js`
3. `AccountApp/src/services/ledgerContactBootstrapService.js`
4. `AccountApp/src/services/ledgerDatabase.js`

### Ledger contact detail timeline bug
1. `AccountApp/src/screens/LedgerContactDetailScreen.js`
2. `AccountApp/src/hooks/useLedgerChatController.js`
3. `AccountApp/src/services/ledgerDatabase.js`
4. `AccountApp/src/services/ledgerDomain/ledgerDomainStore.js`
5. `AccountApp/src/services/ledgerDomain/ledgerDomainShadowService.js`
6. `AccountApp/src/services/ledgerCommandService.js`

### Chat send/receive/delivery issues
1. `AccountApp/src/services/messagingService.js`
2. `AccountApp/src/services/chatDatabase.js`
3. `AccountApp/src/services/chatNotificationActionService.js`
4. `backend/routes/messages.js`
5. `backend/models/MessageDelivery.js`

### Notification tap opens wrong screen
1. `AccountApp/src/services/notificationNavigationService.js`
2. `AccountApp/src/services/chatNotificationActionService.js`
3. `AccountApp/App.tsx`
4. `AccountApp/index.js`

### Phone claim flow bugs
1. `AccountApp/App.tsx`
2. `AccountApp/src/services/phoneClaimNavigationService.js`
3. `AccountApp/src/services/phoneClaimNotificationService.js`
4. `AccountApp/src/services/api.js`
5. `backend/routes/auth.js`
6. `backend/models/PhoneClaim.js`, `backend/models/PhoneLink.js`

### Recurring/scheduled entries not firing
1. `AccountApp/src/services/recurringDatabase.js`
2. `AccountApp/src/services/scheduledActionExecutor.js`
3. `AccountApp/src/services/scheduleProcessingService.js`
4. `AccountApp/src/services/scheduledAlarmService.js`
5. `AccountApp/android/app/src/main/java/com/jasmeet/accountapp/ScheduledAlarmModule.kt`
6. `.../ScheduledAlarmReceiver.kt`, `.../ScheduleWorker.kt`, `.../ScheduledBootReceiver.kt`

### Backup/restore corruption or missing records
1. `AccountApp/src/services/backupService.js`
2. `AccountApp/src/services/driveService.js`
3. `AccountApp/src/services/postRestoreRepairService.js`
4. `AccountApp/src/services/dbLifecycleManager.js`
5. `AccountApp/src/screens/BackupScreen.js`

### Restore settings not reflected live
1. `AccountApp/src/services/backupService.js`
2. `AccountApp/src/services/backupRestoreEvents.js`
3. `AccountApp/src/context/ThemeContext.js`
4. `AccountApp/src/context/HeaderTextureContext.js`
5. `AccountApp/src/context/SessionUserContext.js`
6. `AccountApp/src/hooks/useCurrencySymbol.js`

### Profile setup gate / setup popup logic
1. `AccountApp/src/utils/profileReadiness.js`
2. `AccountApp/src/utils/profileSetupGate.js`
3. `AccountApp/src/screens/ProfileSetupScreen.js`
4. `AccountApp/src/screens/DashboardScreen.js`
5. `AccountApp/src/screens/LedgerScreen.js`

### Android-only native issues (shortcut/version/exact alarm)
1. `AccountApp/android/app/src/main/java/com/jasmeet/accountapp/AccountShortcutModule.kt`
2. `.../VersionInfoModule.kt`
3. `.../ScheduledAlarmModule.kt`
4. `AccountApp/src/services/scheduledAlarmService.js`
5. `AccountApp/App.tsx` (NativeModules consumers)

## 8) Hotspots (Large + High Coupling)
These files need extra care before edits:
1. `AccountApp/src/screens/ExpensesAccountScreen.js` (~5k lines)
2. `AccountApp/src/screens/EarningAccountScreen.js` (~4.2k lines)
3. `AccountApp/src/screens/LedgerContactDetailScreen.js` (~4k lines)
4. `AccountApp/src/screens/AmountEntryScreen.js` (~2.6k lines)
5. `AccountApp/src/screens/DashboardScreen.js` (~2.5k lines)
6. `AccountApp/src/screens/MoreScreen.js` (~2.3k lines)
7. `AccountApp/src/services/messagingService.js` (~1.8k lines)
8. `AccountApp/src/screens/LedgerScreen.js` (~1.7k lines)
9. `AccountApp/src/hooks/useLedgerChatController.js` (~1k lines)
10. `backend/routes/auth.js` (~845 lines)

Guideline: in files mein local fixes karo; large refactor without isolation risky hai.

## 8.5) Ledger Performance Optimizations (2026-05-08 - COMPLETED)

### React.memo Optimization for Child Components
**Files Modified:**
- `AccountApp/src/components/LedgerConversationTimeline.js` (wrapped with React.memo)
- `AccountApp/src/components/LedgerContactHeader.js` (wrapped with React.memo)
- `AccountApp/src/components/LedgerMetricsBar.js` (wrapped with React.memo)
- `AccountApp/src/components/LedgerBottomActions.js` (wrapped with React.memo)

**Issue:** Parent component re-render on keystroke was causing child components to re-render unnecessarily (1700ms+ delay)
**Solution:** Wrapped child components with `React.memo` to prevent re-renders when props haven't changed
**Impact:** Reduced render latency on amount entry from 1700ms to <400ms

### Instant State Updates (Fire-and-Forget Async Pattern)
**File Modified:** `AccountApp/src/screens/LedgerContactDetailScreen.js` → `submitTransaction()`
**Issue:** UI state updates were blocked by background sync operations (queueLedgerStateRefresh), causing 1-2s delay before toast/modal close
**Solution:** Moved state updates (setLoading, showToast) BEFORE background sync call, then fire background sync without awaiting
**Before:** `await queueLedgerStateRefresh()` → then `setLoading(false)` → then `showToast()`
**After:** `setLoading(false)` → `showToast()` → (no await) `queueLedgerStateRefresh()`
**Impact:** Transaction feedback now instant, sync happens silently in background
**Pattern:** Local-first architecture with SSOT (local DB is truth, sync is async)

### Peer ID Caching System
**Files Modified:**
- `AccountApp/src/hooks/useLedgerChatController.js` (added `peerUserIdRef`, caching logic)
  - Line ~70: Added `const peerUserIdRef = useRef('');`
  - Line ~449: `mapContactToAppUser()` caches app user ID: `peerUserIdRef.current = resolvedUserId;`
  - Line ~482: `mapContactToAppUser()` caches non-app identifier: `peerUserIdRef.current = unresolvedUserId;`
  - Line ~494: `resolvePeerUserIdForSync()` now returns cached value: `return peerUserIdRef.current;`
  - **Critical Fix:** Added `useRef` to imports: `import {useCallback, useEffect, useRef} from 'react';`

- `AccountApp/src/services/useLedgerTransactionsController.js` (no functional changes)
  - Still calls `resolvePeerUserIdForSync()` but gets instant cached result instead of backend call

**Issue:** Non-app users experienced 1500ms+ delay on EVERY transaction because `resolvePeerUserIdForSync()` called `batchSearchUsers()` each time
**Solution:** Determine peer ID once when contact loads (in `mapContactToAppUser`), cache it, reuse for all transactions
**Impact:**
- Non-app user, 1st transaction: 1500ms (initial check, same as before)
- Non-app user, 2nd+ transactions: Instant (was 1500ms each)
- App user, all transactions: Instant (was 200ms each)

**Architecture Pattern:** Push model (contact determines peer ID once) vs Pull model (each transaction asks backend)

### Chat Deletion/Removal Analysis (2026-05-08 - READ-ONLY AUDIT)
**Files Scanned:**
- `AccountApp/src/services/chatDatabase.js` → `deleteConversationCascade()`, `deleteConversationsByOtherUserId()`
- `AccountApp/src/screens/LedgerScreen.js` → `deleteContactChatData()`

**Findings:**
- ✅ No hidden/soft-delete mechanism for conversations (only hard-delete via cascade)
- ✅ Messages use soft-delete (`is_deleted` flag) but not conversations
- ⚠️ Minor: Non-atomic deletion (ledger delete then chat delete sequentially)
- ⚠️ Minor: No error verification in deletion functions (return `{success: true}` without checks)
- ⚠️ Minor: Unlogged malformed cache cleanup

**Conclusion:** Chat deletion properly cascades to all related data (queue + messages + conversation). No orphaned data issues found.

## 8.5) Ledger Domain Known Issues (2026-04-28)

### Issue 1: phoneNumbers Truncation in Persist
**Files:** `LedgerScreen.js` (line 351, line 537)
**Problem:** Contact `phoneNumbers` array truncated to single-phone during persist to AsyncStorage
- `persistContacts()` at line 351: `phoneNumbers: phone ? [{number: phone}] : []`
- `handleAddContact()` at line 537: `phoneNumbers: phone ? [{number: phone}] : []`
- Both find first valid phone and store as single-element array, discarding remainder
- On reload, full phone data lost; detail screens receive incomplete contact object

**Impact:** 
- New added contacts: initially full array → after persist → degraded to single phone
- Old contacts in ledger: permanently missing secondary phone numbers
- Chat/detail verification depends on `getContactPhone()` which fails on empty `phoneNumbers`

**Not Fixed Because:** Recovery logic would require `batchSearchUsers()` per contact open (performance cost)

### Issue 2: State Verification Signal Blocked by Missing Phone
**Files:** `LedgerContactDetailScreen.js`, `useLedgerChatController.js` (line 403-412)
**Problem:** When contact has empty `phoneNumbers`, `mapContactToAppUser()` returns early without sending backend signal
- Line 403: `if (!phoneNumber || phoneNumber === 'No phone number') { setAppUser(null); return; }`
- No `batchSearchUsers()` call → no app-user state verification → user stuck as non-app

**Root Cause Chain:**
1. LedgerScreen persist truncates `phoneNumbers` → becomes empty on old contacts
2. LedgerContactDetailScreen receives truncated contact
3. `getContactPhone()` returns `'No phone number'`
4. `mapContactToAppUser()` early-returns → no verification signal

**Impact:** Old contacts with missing phone never refresh state; always show as non-app user

**Not Fixed Because:** Depends on Issue 1 fix; recovery from device cache adds overhead

### Issue 3: Duplicate Contact on Uninstall+Re-add
**Files:** `LedgerScreen.js` (dedupe logic line 460-468), `LedgerAddContactScreen.js`
**Problem:** Non-app user added after uninstall creates duplicate instead of updating existing
- Uninstalled app users: `recordID: app_<userId>`, `userId: present`
- Newly added non-app users: `recordID: device_id`, `userId: empty`
- Dedupe logic: `byRecord = String(item.recordID) === incomingId` → no match → duplicate

**Scenario:**
1. User is app user → `recordID: app_123`, `userId: 123`
2. User uninstalls app → state becomes uninstalled but `recordID` stays `app_123`
3. User re-added as non-app contact → `recordID: device_xyz`, `userId: empty`
4. Dedupe: `app_123` ≠ `device_xyz` → creates duplicate contact

**Not Fixed Because:** SSOT fix (phone-based userId lookup) caused performance regression and app lag; reverted

## 9) Known Architectural Patterns
- DB readiness mostly goes through `dbLifecycleManager` wrappers.
- Startup routing intentionally Boot -> resolved route (avoid Login flash).
- Global full history now reverse-replays the current All Accounts net balance across the transaction table, with the savings-include/exclude rule shared through `src/utils/dashboardNetBalance.js`; dashboard recent entries stay on the lightweight preview feed, and the global screen filters `[ewlog]` and hides transfer/request rows except in saving accounts.
- Chat + Ledger identity joins depend on normalized IDs (`recordID`, `userId`, install state).
- Notification open flows are deferred and idempotency-guarded.
- Recurring engine uses both exact alarm + periodic WorkManager fallback.

## 10) Fast Agent Workflow (Token-efficient)
1. `docs/QUICK_INDEX.md` read karo.
2. Task classify karo (startup/dashboard/ledger/chat/schedule/backup/profile/native/backend).
3. Section 7 ke mapped files hi open karo.
4. Agar DB issue ho to first `dbLifecycleManager + owning service` open karo.
5. Agar notification issue ho to first `index.js`, `App.tsx`, notification services open karo.
6. Backup/legacy folders skip karo unless regression trace required.

## 11) Suggested Search Commands
```powershell
# domain file list
rg --files AccountApp/src | rg "services|screens|navigation|hooks|context"

# endpoint map
rg "router\.(get|post|put|delete)\(" backend/routes -n

# sqlite schema definitions
rg "CREATE TABLE IF NOT EXISTS" AccountApp/src/services -n -A 20

# native bridge usage in JS
rg "NativeModules\.|ScheduledAlarm|AccountShortcut|VersionInfo" AccountApp/src App.tsx -n

# startup route/flags
rg "Boot|PreparingApp|resolveStartup|startup" AccountApp/App.tsx AccountApp/src/services -n
```

## 12) Audit Maintenance Rule
Every major feature change ke baad update:
- Section 4 (Domain map)
- Section 6 (Endpoint map)
- Section 7 (Task -> files routing)
- Section 8 (Hotspots if line count/complexity shifts)

## 13) Fixes Applied

### ✅ [2026-04-20] Removed PII Debug Logs from BackupScreen.js
**Issue:** Production console logs printing sensitive user data (`firebaseUid`, backup email, file IDs)
**Location:** `AccountApp/src/screens/BackupScreen.js` lines 261-277
**Fix:** Deleted unconditional `console.log` debug block that was exposing PII
**Impact:** Zero runtime impact. Eliminates data exposure risk in production builds.
**Type:** Security patch (removed symptom, not root cause refactor)

### ✅ [2026-04-20] Removed PII + Sensitive Logs from backupService.js + BackupScreen.js
**Issue:** `firebaseUid`, `accountEmail`, `fileId`, Drive file metadata, `manifestCheck` (UIDs), filesystem paths unconditionally logged in production
**Files:** `AccountApp/src/services/backupService.js`, `AccountApp/src/screens/BackupScreen.js`
**Fix:** PII/Drive metadata logs deleted. Path + process logs wrapped in `__DEV__`. `handleDebugInfo()` function removed from BackupScreen (was already commented out in UI).
**Type:** Security + privacy fix. Zero functional impact.

### ✅ [2026-04-20] Deleted Wrong-Project Web Files
**Files deleted:** `src/context/NotificationContext.js`, `src/common/index.js`, `src/components/MarkUpdateForm.js`
**Reason:** Web-only files (div tags, Tailwind CSS, HTML event handlers, REACT_APP env vars) — incompatible with React Native, zero imports, Metro bundler overhead eliminated. `NotificationContext.js` was a crash risk if accidentally imported.

### ✅ [2026-04-20] Fixed Permanent Listener Leaks in messagingService.js
**Issue:** 3 listeners (NetInfo, onTokenRefresh, AppState) had no cleanup — ran forever even after logout
**Files:** `AccountApp/src/services/messagingService.js`, `AccountApp/src/screens/MoreScreen.js`
**Fix:** Stored unsubscribe refs in module-level vars, exported `cleanupMessagingListeners()`, called on logout in `confirmLogout()`
**Impact:** Memory leak eliminated. Flags reset so relogin starts listeners fresh. No behavior change during normal app use.

### ✅ [2026-04-20] Fixed Untracked setTimeout Calls
**Issue:** setTimeout IDs not stored → clearTimeout impossible → timers potentially fire after component unmount
**Files:** `AllAccountsScreen.js`, `ExpensesAccountScreen.js` (+ deleted duplicate useEffect), `EarningAccountScreen.js`, `ToastContext.js`
**Fix:** useRef for individual timer refs; array ref for focus timers; Map ref for toast timers. clearTimeout before each set, full cleanup on unmount.
**Impact:** No timer-after-unmount crashes. No behavior change in normal flow.

### ✅ [2026-04-21] Cleaned All Production console.log Statements (Point 10)
**Issue:** Sensitive data and verbose logs unconditionally printed in production builds across multiple files
**Deleted (PII/sensitive):**
- `LoginScreen.js` — raw Google ID token, googleUser object, Firebase UID, backend responses, full error JSON
- `ledgerDatabase.js` — contact displayName (real person's name)
- `ledgerSyncService.js` — peerUserId in "Event skipped", "Event sent", "Event queued" logs; request sourceUserId+peerUserId; failed response body
- `backupService.js` — firebaseUid, accountEmail, fileId, Drive file metadata, manifestCheck with UIDs (done in earlier fix)
- `HelpBotScreen.js` — user query text (L351, L361)
- `chatInitializer.js` — Firebase UIDs (current user, conversation, newConversationId)
**Wrapped in `__DEV__`:**
- `messagingService.js` — ~20 process/status logs; FCM token partial log
- `accountsDatabase.js`, `chatDatabase.js`, `transactionsDatabase.js`, `ledgerDatabase.js`, `ledgerSyncService.js` — all process logs
- `tokenManager.js`, `database.js` — all dev logs
- `driveService.js` — listing, filter, URL, count logs
- `NotificationService.js` — notification press log
- `HelpBotScreen.js` — botEngine/Gemini response logs
- `AmountEntryScreen.js` — alarm settings logs
**Impact:** Zero functional impact. PII/token exposure in production eliminated.

### ✅ [2026-04-21] Finalized Remaining Debug Log Helpers
**Issue:** A few remaining active debug traces still emitted through direct `console.log` helpers in `src`
**Files:** `AccountApp/src/screens/LedgerContactDetailScreen.js`, `AccountApp/src/services/notificationNavigationService.js`, `AccountApp/src/services/transactionTimeline.js`, `AccountApp/src/utils/chatDebugLogger.js`, `AccountApp/src/utils/perfLogger.js`
**Fix:** Wrapped remaining bubble-trace/router/timeline helpers in explicit dev-only guards so production builds no longer emit them
**Impact:** Keeps diagnostic visibility in dev without leaving active production `console.log` paths in the app source

### ✅ [2026-04-21] Deleted Dead Utility Modules
**Issue:** Two utility modules in `src/utils/` had no active imports and were only dead code noise
**Files:** `AccountApp/src/utils/dashboardLogger.js`, `AccountApp/src/utils/mainChatIdentityState.js`
**Fix:** Deleted both unused modules after confirming no active references in `src`
**Impact:** Removes dead code from the active app source without changing runtime behavior

### ✅ [2026-04-21] Fixed Startup Route Correctness in App.tsx
**Issue:** Deferred startup work was still allowing a dead `DashboardHome` route name in the dashboard-ready check
**Files:** `AccountApp/App.tsx`
**Fix:** `isDashboardReadyRoute()` now matches only the registered `Home` route
**Impact:** Startup deferred work now binds to the actual navigator route and cannot depend on a dead route name

### ✅ [2026-04-22] Fixed Dashboard Startup Blink
**Issue:** Android launch used a blank startup shield to mask route transitions, which made startup feel like an extra splash screen
**Files:** `AccountApp/App.tsx`, `AccountApp/src/navigation/AppNavigator.js`
**Fix:** Removed the `startupUiLocked` overlay path and its safety/unlock helpers from `App.tsx`. The `Home` stack route now uses `animation: 'none'`, so startup uses the existing route resolver without an extra blank masking layer.
**Impact:** Restores faster visible startup while avoiding stacked shield/data-ready fixes. Any remaining startup flash is now exposed as a real route/theme issue instead of being hidden by an overlay.
