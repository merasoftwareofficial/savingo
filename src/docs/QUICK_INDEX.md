# QUICK_INDEX

## Add contact opens chat; contact saved only on first data — 2026-10-13 (owner: "perfect")
Goal: Add Contact opens the chat page at once; the contact enters the Ledger list only when the first chat message or ledger entry exists (like normal chat apps).
- **Add Contact:** `src/screens/LedgerAddContactScreen.js` → `handleAddContact` (now async).
  - Before: emitted `ledger:addContact` (LedgerScreen saved it to `ledgerContacts` + toast "Contact added successfully") and `navigation.goBack()` to the list; the user had to tap the contact again.
  - Now: `navigation.replace('LedgerContactDetail', {contact, isDraftContact})`. `isDraftContact` = not already in the list (checked with `isLedgerContactSaved`). Back returns to the Ledger list. Unused `DeviceEventEmitter` import removed.
- **Saved-check SSOT:** `src/services/ledgerContactBootstrapService.js` → new `isLedgerContactSaved({recordID, userId})`, reusing `readLedgerContacts` + `findMatchingLedgerContact`.
- **Draft owner:** new `src/hooks/useDraftLedgerContact.js` → `{emitContactUpdate, persistDraftContactOnce}`.
  - `emitContactUpdate`: saved contact → emits `ledger:addContact` as before; draft → only keeps the latest identity update in a ref.
  - `persistDraftContactOnce`: emits `ledger:addContact` once (`silent: true`, no toast) with the draft + latest identity. The only list writer is still `LedgerScreen.handleAddContact`.
- **Triggers (the only two data points):**
  - Chat: `src/hooks/useLedgerChatController.js` → `handleSendMessage` → `onPersisted` (message committed to the local DB).
  - Entry: `src/hooks/useLedgerTransactionsController.js` → `submitTransaction` after `commitLedgerEntryCommand` returns `committed` (all Paid/Get/AmountEntry paths go through it).
- **Silent identity emits:** `useLedgerChatController.js` → `emitInstalledContactRecovery`, the unresolved/uninstalled branch, and the `RECEIVER_UNAVAILABLE` branch.
  - Before: `DeviceEventEmitter.emit('ledger:addContact', …)`, so just opening the chat page could save the contact.
  - Now: `emitContactUpdate(…)`. Unused `DeviceEventEmitter` import removed.
- **Wiring:** `src/screens/LedgerContactDetailScreen.js` reads `route.params.isDraftContact`, calls `useDraftLedgerContact`, and passes both functions to the two controllers.
- **Not changed:** `LedgerScreen.handleAddContact`, the incoming upsert `messagingService.upsertLedgerContactByUser` (same `app_<uid>` recordID, so no duplicate), `LedgerContactStateContext`, `postRestoreRepairService`, `notificationNavigationService`. `UserSearchScreen.js` is unreachable (`ChatScreen` is not registered in any navigator) and was left alone.
- **Known limit (pre-existing):** saving relies on the `LedgerScreen` listener; a draft is always opened from Ledger list → Add, so that screen is mounted.
- **Validation:** eslint counts unchanged (9 / 24 / 1 / 0 / 0, new hook clean). `__tests__/delivery-foundation.node.cjs` 43/43. Owner accepted ("perfect"); device steps listed in the hand-over were not individually reported.
- **Backup:** `../backup/fix19-draft-contact`.

## Chat status UI + contact-list status icon — 2026-10-13 (owner: "perfect")
UI only. Send flow, `ChatSendButtonManager`, receipts, DB writes and backend were not changed.
- **Status → icon/colour SSOT:** `src/services/chatMessageStatus.js` → new `getChatStatusIndicator(value, mutedColor)` returns `{status, tone, icon, color}`. `getChatMessageStatus` is unchanged.
  - sending/queued: `time-outline`, gray · sent: `ellipse-outline`, gray · delivered: `radio-button-on`, blue `#3B82F6` · read: `eye-outline`, green `#16A34A` · failed: `alert-circle-outline`, red (unchanged).
  - Before: the bubble used `checkmark` / `checkmark-done` straight from `getChatMessageStatus`, and only the read tick was coloured green.
- **Sent bubble colour + animation:** `src/components/ledger/LedgerMessageBubble.js`.
  - Before: every sent bubble had one colour (`chatBubbleSent`) and no animation.
  - Now: the colour follows `tone`: 0 gray, 1 blue, 2 green. Changes fade over 300 ms with Reanimated `interpolateColor`. The icon pops (scale 1.3 → 1) when the status changes.
  - A just-sent bubble (`isSent`, timestamp < 1.5 s old at mount) slides up 28 px with a fade and scale 0.94 → 1 (spring). Older or history rows do not animate.
  - Selection colour still wins. `React.memo` and the primitive props are unchanged.
- **Tone colours:** `src/screens/LedgerContactDetailScreen.js` → `createStyles`: `chatBubbleSentPending` / `chatBubbleSentDelivered` / `chatBubbleSentRead` (background + border, light and dark).
- **Contact-list status icon:**
  - `src/services/chatDatabase.js` → `getLatestMessagePerUser` now also selects `m.sender_id` and `m.delivery_status`, and returns `isOutgoing` (sender ≠ `other_user_id`) and `deliveryStatus`. Read only. Before: it returned `{text, timestamp}` only.
  - `src/screens/LedgerScreen.js`: the last-activity effect spreads the chat entry. Its deps changed from `[contacts]` to `[contacts, chatStoreState.version]`, so receipts (which bump `chatStore.version` via `emitIncomingChatUpdate`) refresh the row.
  - `src/ui/LedgerContactRow.js`: an outgoing last message shows the same icon before the text. Incoming messages show no icon.
- **Not changed:** `LedgerConversationTimeline.js`, `useLedgerChatController.js`, `messagingService.js`, backend.
- **Validation:**
  - eslint problem counts are unchanged versus the backups. `__tests__/delivery-foundation.node.cjs` 43/43.
  - The colour/animation was seen on device in a release APK. The contact-list icon and final icon set were seen through a debug build + Metro, dark theme.
  - Not separately confirmed: light theme, the seen/green state on device, and a release build with the final icons.
- **Backups:** `../backup/fix16-chat-ui` (bubble/screen originals), `fix17-contact-status` (DB/list/row originals), `fix18-status-icons` (eye-icon helper plus the `idea1/2/4` icon trials).

## Chat composer and bubble responsiveness — 2026-10-12
- Android native send boundary: `android/app/src/main/java/com/merasoftware/savingo/app/ChatSendButtonManager.kt`, registered through `ChatDraftPackage.kt` / `MainApplication.kt`.
- Draft ownership: `src/components/ledger/ChatComposer.js` uses an uncontrolled native TextInput and a ref for draft preservation; Android observes text, enables the button, snapshots and clears on touch, then emits a non-coalescing send event.
- Local optimistic bubble: `src/hooks/useLedgerChatController.js`; durable message/retry queue remains in `messagingService.js` / `chatDatabase.js`.
- Message row rendering: `src/components/ledger/LedgerMessageBubble.js` (memoized primitive props and timestamp-dependent date/time formatting), wired by `LedgerContactDetailScreen.js`.
- Device validation: owner confirmed fast input/send without letter duplication after native fix; release APK later confirmed fast chat/bubbles. Draft-back and selection were requested but not independently confirmed in the reply.
- Evidence/rollback: `../backup/fix8-chat-diagnosis`, `../backup/fix9-chat-draft`, `../backup/fix10-native-chat-send`, `../backup/fix11-bubble-timing` (paths relative to Frontend). Temporary timing probes removed.


## Ledger Talk delivery — Phase 1 + 2 (2026-10-10, two-device tested by owner)
- **Messaging init (Phase 1):** `App.tsx` → `scheduleMessagingInitForUser(uid)`, called from `onAuthStateChanged`. Before: init lived inside `scheduleDashboardDeferredStartupWork`, gated on `getCurrentRoute().name === 'Home'`; nested route reports `Dashboard`, so init (FCM foreground listener, token sync, inbox/status recovery) never ran. Now: tied to the signed-in UID, 2.2s deferred, guarded per UID, cancelled on logout/account change.
- **Sender status recovery (2A):** `src/services/chatDatabase.js` → `getMessagesAwaitingRead`. Before: queried non-existent `messages.id` → `no such column: id`, so `recoverDeliveryInbox` aborted before `/messages/statuses`. Now: `rowid AS id`, paged by `rowid`. No schema change.
- **Backend retry (2B):** `backend/services/deliveryService.js` → `MAX_PUSH_ATTEMPTS = 10` (~25 min backoff; row stays in `/inbox`), `DISPATCH_BUDGET_MS = 8000` for `dispatchBatch`. Before: unbounded re-push, 20s budget. Live on Vercel (commit `f8e0a65`).
- **Retry trigger (2C):** cron-job.org job "Savingo delivery retry", every 1 min, `POST /api/internal/delivery-dispatch` with `Authorization: Bearer <CRON_SECRET>`. Vercel Hobby cron cannot run per minute. Secret stored only in Vercel env + cron-job.org header.
- Tests: Frontend `node --test __tests__/delivery-foundation.node.cjs` (23 pass); Backend `node --test tests/delivery.node.cjs` (8 pass, uses `mongodb-memory-server`, never a real DB).
- Backups: `../backup/fix4-messaging-init/`, `../backup/fix5-phase2/` (relative to Frontend root).
- Still pending: identity/uninstall redesign (see CODE_AUDIT "Identity & uninstall — verified findings"), typing/"Updating ledger…" (needs always-on host), Android background receipt retry, ledger durability.

## Ledger Talk delivery foundation (2026-10-09)
- Local durable chat send/receive + receipt queue: `src/services/chatDatabase.js`.
- Chat retry/session ownership/foreground recovery: `src/services/messagingService.js`.
- Ledger queue serialization, persist-before-request, queued-response retention: `src/services/ledgerSyncService.js`.
- Shared request/body deadline and retry delay: `src/services/deliveryTransport.js`.
- Seen persists receipts for every unread incoming row: `src/services/chatSystem.js`.
- Verification: `node --test __tests__/delivery-foundation.node.cjs` (18 tests passed); Android production JS bundle passed.
- This is the local foundation only. Backend durable inbox/worker, realtime typing, native background delivery, identity separation and live device checks remain pending.
- Paid/Get button handlers, ledger calculations, ledger DB and transaction command were not modified in this stage. Original files: `../backup/fix1/Frontend/` relative to Frontend project root.

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
- Wallet period-state cache recovery: `src/services/accountsPeriodStateStorage.js` now clears a corrupt stored period-state entry instead of re-throwing a JSON parse error on account-open
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

## Send ownership and native draft storage — code verified 2026-10-12
- `ChatComposerStorage.kt`: owner/conversation-scoped native draft storage; consumed send snapshots persist before input clear. Snapshot removal happens only after the existing JS outbox commit. This is a composer-to-outbox handoff, not a second transport/retry sender.
- `ChatSendButtonManager.kt` carries stable native message ID and owner/receiver/conversation metadata. Disk-write rejection retains the input; recovered sends reuse the original ID.
- `chatComposerHandoff.js` and `useLedgerChatController.js` recover unacknowledged snapshots on opening the matching chat. `messagingService.js` validates existing row identity and suppresses active/already-sent replay. Unsaved failed bubbles survive timeline replacement.
- Native draft writes use SharedPreferences.apply; consumed snapshots use commit. Draft restoration is implemented but not yet device-validated. Immediate power-loss durability of every draft keystroke is not claimed.
- Verification: 27 delivery tests passed, including outbox-before-ack, DB rejection, replay and identity mismatch; compileDebugKotlin passed. Device speed/restart/draft acceptance pending because ADB has no connected device.
- Originals: `../backup/fix12-send-safety/`; this stage has not been installed on the phone.

## Message states and retry — code verified 2026-10-12
- `chatMessageStatus.js` maps pending/sending/queued to a clock, sent to a single tick, delivered/read to double ticks, and failed to an explicit retry action. `LedgerMessageBubble.js` preserves long-press selection while allowing failed outgoing bubbles to retry outside selection mode.
- Retry keeps the original ID. `requeueOutgoingMessage` commits retry obligation and sending status atomically; existing sent/read rows are acknowledged without retransmission. Native handoff recovery cannot overwrite a different recipient/text under the same ID.
- Verification: 31 delivery/status/retry tests passed; changed composer/bubble/hook helpers have zero eslint errors (existing shadow warning and bubble inline-style warning). Native speed, selection and reconnect tests still need the phone. Originals: `../backup/fix13-message-states/`.

## Targeted chat updates — code verified 2026-10-12
- `chatTimelineUpdates.js` upserts/deletes one message, shares unchanged row references and skips duplicate updates. Snapshot reconciliation retains unsaved failed bubbles and prevents delivery-status regression.
- `useLedgerChatController.js` reads the single committed row after send/failure instead of full-history reload. The detail screen subscribes to message updates and updates one DB-backed row; chat versions no longer trigger history reload/pending-sync on every receipt.
- Local timeline publication updates the existing cache/domain store. Domain subscriptions compare snapshots so unrelated base changes and normalized self-publications do not overwrite/re-render the current history.
- Verification: 33 delivery/status/timeline tests passed. Real-device acceptance pending. Originals: `../backup/fix14-chat-updates/`.

## Paged history, drafts and send gesture — code verified 2026-10-12
- `chatHistoryPage.js` merges bounded SQLite message/ledger queries. Initial page is 50; older pages share a `(timestamp, prefixed ID)` cursor and stable descending ordering, so new arrivals/deletions do not introduce offset skips. Deleted ledger rows remain visible as before; deleted chat rows are excluded.
- `LedgerConversationTimeline.js` requests older history at the list end and exposes a fallback load button. The detail screen retains already displayed history on a read failure and prevents overlapping older-page requests. Explicit message deletion forces a DB refresh. Ledger balance calculation continues to use the existing full ledger base data; this stage pages displayed history, not the balance model.
- Drafts are stored natively by signed-in owner and conversation, restored without overwriting fresh typing, and separated on conversation changes. Queue insertion checks captured sender against actual auth owner. Draft app-restart/back acceptance still needs device confirmation.
- Native send now uses the standard Android click boundary instead of ACTION_DOWN, allowing cancellation and reporting accessibility clicks correctly. Atomic snapshot/clear still runs on the UI thread after durable handoff succeeds.
- Verification: 36 tests passed, including 240 mixed equal-timestamp rows, insertion/deletion between pages and account mismatch rejection. No new eslint errors versus the pre-work screen (18 existing) and selection hook (1 existing). Release/device acceptance pending. Originals: `../backup/fix15-history-drafts/`.

### Final ownership/cancellation review — 2026-10-12
- Current composer owner comes from Firebase auth state, not the persisted `firebaseUid` cache. Native storage checks actual FirebaseAuth ownership; send validates the canonical owner/recipient conversation. The app directly declares the same Firebase BOM/auth dependency already used by RNFirebase (34.7.0).
- Native recovery snapshots are checked against current cached native ownership before outbox transfer, so a stale pending list cannot revive a deleted entry. Explicit user deletion cancels producer snapshots; unsaved cancelled rows are removed even when history deletion fails. Transmission rechecks the persisted row after token acquisition and skips deleted/already-acknowledged rows.
- Token claims are bound to the expected UID and actual native session, preventing another account token from being used under a stale JS login. Composer callbacks/internal sender checks are excluded from saved/wire payloads.
- Native storage is the sole draft restoration source; JS `draftRef` is a back-behavior mirror and no longer supplies TextInput.defaultValue. This avoids overwriting the stored draft with an old mirror.
- Final automated suite: 43 tests passed. Composer/selection/handoff helpers have zero eslint errors; existing screen lint findings remain outside this work. Android final release/device acceptance is pending. Normal draft restart behavior needs a device test; instantaneous hard power-loss durability of every draft keystroke is not claimed.
- Rollback scripts are available inside fix12–fix15 folders; the previous owner-tested APK is preserved at `../backup/fix12-send-safety/installed-before-safety.apk`. No rollback scripts have been executed.

### Release handoff — 2026-10-12
- Final release assemble passed and `app-arm64-v8a-release.apk` was installed with `adb install -r` and opened. Package version remains 3.0.0.14 / 114001; package flags do not include DEBUGGABLE. SHA256: `1F8D09C04016CB3E4DBD2C495BEC9EBCD66F16784F7707821DA8A28D81A6EFE5`.
- Automated suite: 43/43 passed. Startup logs showed no new fatal/runtime error in the inspected window. Device fast-send, draft back/restart, selection and older-page scrolling were requested and remain pending; offline/reconnect device acceptance follows those checks. Do not mark the full working accepted from build success alone.
- Runtime log: `../backup/fix15-history-drafts/device-release-log.txt`. Source rollback is per numbered phase; no runtime messages/drafts were wiped.

### Device acceptance update — 2026-10-12
- User confirmed all requested release-device checks passed: fast sends/letters/bubble speed/ticks, draft back/reopen and app restart, bubble selection and older history scrolling (quote: 'sab sahi hai maine test kar liya hai').
- Inspected latest 250 runtime log lines: no FATAL EXCEPTION, TypeError, ReferenceError, COMPOSER_WRITE_FAILED or Session changed match. Offline/reconnect device acceptance remains pending.


### Offline/reconnect acceptance — 2026-10-12
- User performed the requested offline/restart/reconnect test and confirmed messages sent after reconnect (quote: 'haan kiya woh bhi ho gye send msgfs'). No failure was reported. Duplicate count was not separately stated; automated same-ID replay/overlap tests remain the explicit duplicate-prevention evidence.
- All requested manual test rounds are complete: fast sending, drafts, selection/history and offline recovery. Final release build and 43/43 automated tests passed. No additional code change was made during acceptance.

