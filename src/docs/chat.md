# Ledger Talk chat send: hand-over (11 Oct 2026)

Read fully before any code. Start at section 6.

## 1. Goal (owner's words, binding)
> "maine `s` likha aur send kar diya, next `s` likhunga to single `s` hi send hona chahiye lekin 2nd time woh `ss` hoga, 3rd time `sss`."
> "yeh problem server ki taraf se nahi hai, app mein hi delay hai."

After send, the composer box does not clear. When typing fast, every message is
the old text plus the new letter. The chat bubble itself appears at once
(1–65 ms in logs), so the "delay" the owner feels is this box. Fix **only
this**.

## 2. Owner's rules
1. **Understand → approval → code → docs.**
   - Write a short "kya samjha / kya karunga" first.
   - "analyse/batao/explain" means no code.
   - Code only on "yes / ok do it / code likho / haan".
2. **Prove the root cause on the device before any fix.** Use evidence only: a
   log, a measurement or a code line.
3. **Scope.** Only this bug. Anything else is reported as side-work, and you
   ask first.
4. **Nothing else may break.**
   - Map the callers (section 5) and state what stays unchanged.
   - When the owner says "verify karlo", re-audit with tool calls until a pass
     finds nothing new.
5. **Backup** before any change: `E:\savingo\backup\fix8-…` (next free number).
6. **Backend `git push` deploys to production (Vercel).** Get approval and
   verify the result.
7. **Simple Hinglish** with numbered steps, no jargon. Android only.
8. **Docs** only after "perfect", with before/after behaviour and file/function
   locations.

## 3. Current code state
- **App: original.**
  - `ChatComposer.js`, `useLedgerChatController.js`, `messagingService.js` are
    restored from `backup/fix6-phase0-measure/`.
  - `LedgerContactDetailScreen.js` is restored from `backup/fix7-chat-send/`.
  - All four are byte-identical to the originals.
  - No temp logs remain. The pre-existing `[BUBBLE_TRACE]` logs stay.
- **Backend: commit `ce93644` live, kept with owner approval.** It does **not**
  fix the bug; it only makes the sent tick faster.
  - `/messages/send`: 7 → 4 DB round-trips.
    - Receiver and sender are read with `Promise.all`. The receiver's
      `fcmToken` is passed to `dispatchOne(messageId, {receiverToken, result})`.
    - The final `Delivery.findOne` is removed. The status is
      `pushed ? 'pushed' : row.status`.
    - The response shape is unchanged.
    - `dispatchOne` without options behaves as before.
  - `vercel.json` `"regions": ["bom1"]`.
    - Before: `X-Vercel-Id: bom1::iad1` (US). After: `bom1::bom1`.
    - Atlas is in Mumbai.
    - This applies to **all** APIs.
  - Effect: send round-trip went from ~1.9 s to ~0.5–0.95 s.
  - Undo: `git revert ce93644` in `E:\savingo\backend`, then push. Get
    approval first.
  - Not yet written into `QUICK_INDEX.md`/`CODE_AUDIT.md`. The owner has not
    said "perfect", so do not add it on your own.
- **Backups:**
  - `fix6-phase0-measure` holds the session originals.
  - `fix7-chat-send` holds the post-instrumentation state. Its screen file and
    `vercel.json` are originals.

## 4. Evidence and lessons
**Original composer**
- `TextInput value={messageText}`. The state lives in the ~2700-line screen
  (~line 337), so every keystroke re-renders it.
- Send calls `setMessageText('')`, then `await sendMessageToUser`, then
  `loadUnifiedTimeline`.

**Device test 1** (Samsung SM-S711B, Gboard, original code + temp logs)
- The clear was requested at +2 ms. React committed `value=''` at ~+230 ms.
- The next key reported old + new text every time: `S, Sa, Sas, …`.
- Once, a stale closure sent `Sasss` while the box held `Sassss`.
- Server timings:
  - ~190 ms per MongoDB query (iad1 → Mumbai)
  - FCM ~110 ms
  - total round trip ~1.9 s
- Bubble ~50 ms. Timeline reload 1–4 ms.

**Device test 2** (failed fix: uncontrolled input + native `ref.clear()`)
- The clear fired 3 ms after send. The next key, 250 ms later, still gave `Ss`.
- This **disproves "the clear arrives late"**. Reverted.

**RN 0.83.1 (Fabric) source**
- `ReactEditText.canUpdateWithEventCount` drops JS text that carries an older
  event count.
- `TextInput.clear()` sends the JS-side `mostRecentEventCount` state.

**How the diagnosis was logged** (re-add only with approval + backup, then
remove; prefix `[SEND_DIAG]` with `t: Date.now()`):
- `ChatComposer` `onChangeText` wrapper → `native-change {len, text}`
- a `useEffect` on `messageText` → `composer-prop-commit {len}`
- start of `handleSendMessage` → `send-press {len, text}`
- right after the clear → `clear-requested`
- `transmitQueuedMessage` → `server-roundtrip {roundTripMs}`

Reading: if `clear-requested` is followed by a `native-change` whose `len` is
greater than 1, the old text survived.

**Unproven candidates (prove one first)**
- **A. Gboard composing word.** With no spaces, the whole draft is one
  composing word. After a clear, the next key re-commits it plus the new
  letter. Matches the pattern.
- **B. Android rejects the clear** because of the event-count mismatch.
- If neither is proven, collect more evidence. Do not invent a third theory
  and fix it.

**Mistakes not to repeat**
- A fix was built on an unproven theory.
- Scope was widened to the server.
- "Sync SQLite blocks JS" was claimed, and logs disproved it (1–4 ms).
- Pre-fix logs were analysed. Check log timestamps against file mtimes.
- A test ran on stale JS. Force-restart the app and confirm the new log tag
  appears.
- Too much jargon.

**Discussed, NOT approved, do not build:** a serial "outbox" send queue, and
replying from the server before the FCM push (`waitUntil`). Neither is needed
for this bug.

## 5. Must not break
| Thing | Used by | Keep |
|---|---|---|
| `sendMessageToUser` | ledger chat hook, `ChatConversationScreen.js:124`, notification reply `chatNotificationActionService.js:317` | signature, await (the background reply needs it), `RECEIVER_UNAVAILABLE` |
| `processPendingMessages` | retry, network, startup | already serial |
| `ChatComposer` | only `LedgerContactDetailScreen` | it unmounts in selection mode; the draft must survive |
| `messageText` | back handler (~line 974, `hasDraftMessage`); `useMainChatSystemState.js` is dead code | back press with a draft: blur, keep the draft |
| receiver-uninstalled path | `handleSendMessage` early return + toast | text stays in the box |
| offline send | marked `queued`, no status event | keep the post-send `loadUnifiedTimeline` |
| status ranks | `chatDatabase.updateMessageStatus` | never downgrade (read 3 > delivered 2 > sent/pushed/accepted 1) |

## 6. Next step: prove the cause, no code change
Ask the owner which test to run.

- **Test 0 (owner, cheapest, ask first):** type `s` → send, and then do
  **not** type anything.
  - Box looks empty, and the old text comes back only when the next key is
    pressed → points to A.
  - Old text stays visible in the box → points to B.
- **Test A (owner):** type `s` + space → send, 6–8 times fast.
  - Each message is just `s` → A.
  - Messages like `s s` → B.
  - Cross-check: turn off Gboard suggestions and run the no-space test.
  - Send trims the text, so the trailing space is harmless.
- **Test B (agent):** this sends real messages, so get permission first.
  1. With the chat open, run `adb shell input text s`.
  2. Run `adb shell input tap <send x y>`. Find the coordinates with
     `uiautomator dump`.
  3. Dump the UI again and read the EditText text.
  - Empty → the keyboard is the cause.
  - Not empty → candidate B.
  - Caveat, still unverified: this assumes adb key events do not create a
    Gboard composing region. Confirm it with Test 0/A; do not rely on Test B
    alone.

Then follow this order:
1. Small fix plan, and approval.
2. Back up to `fix8`.
3. Implement.
4. Repeat the fast test until `ss` never appears.
5. Ask "any other changes?".
6. Docs only after "perfect".

If candidate A is proven, measure each option on the device; do not choose by
reasoning:
- `autoCorrect={false}` / `spellCheck={false}`
- clear via blur → clear → focus

**Device and logs**
- Wireless adb. Re-check `adb devices` before each test.
- Restart the app:
  ```
  adb shell am force-stop com.merasoftware.savingo.app
  adb shell monkey -p com.merasoftware.savingo.app -c android.intent.category.LAUNCHER 1
  ```
- Capture logs: `adb logcat -c`, then
  `adb logcat -v time ReactNativeJS:V '*:S' > file` in the background.
- Metro runs from `E:\savingo\Frontend`. Check the bundle contains the tag:
  `curl "http://localhost:8081/index.bundle?platform=android&dev=true&lazy=false" | grep -c TAG`.
- Tests:
  - `Frontend: node --test __tests__/delivery-foundation.node.cjs` (23)
  - `backend: node --test tests/delivery.node.cjs` (8)
- `LedgerContactDetailScreen.js` already has 18 lint errors. Compare the count
  before and after a change.

## 7. Separate pending request: auto-backup schedule (analysed only, do after chat)
**Now:**
- `utils/backupQueue.js` `queueBackupFromStorage()` runs a full Google Drive
  backup with a 30 s debounce.
- 33 call sites trigger it: transactions, accounts, recurring, settings,
  profile.
- Chat triggers it too: `ledger:chatActivity` → `LedgerScreen` `setContacts` →
  persist effect (~line 367). Logs confirmed a backup ~31 s after a message.

**Wanted:**
- Off / Daily (1–4 times a day) / Weekly / Monthly
- The setting remembered
- A startup config page

**Open questions:**
- Must backup run while the app is closed (WorkManager)?
- Default for new users (suggested Daily ×1)?
- Skip the backup when nothing changed (suggested yes)?

**Note:** `SetupScreen.js` has a backup toggle but is not in the navigator
(dead). Onboarding is `CurrencySetup` → `ProfileSetup`.

## Verified follow-up — 2026-10-12
The Android fast-send issue was traced to stale JS text clears rejected by native event counts, plus JS-driven send-button enablement. The final `ChatSendButtonManager` owns native button state and atomic touch-time text snapshot/clear; it emits a non-coalescing event into the existing optimistic/durable send flow. The asynchronous `ChatDraftModule` intermediate implementation was removed.

Bubble rendering was corrected separately with `LedgerMessageBubble` memoization and timestamp-dependent date/time formatting inside that component. Debug timing improved but visible delay remained. A same-code release APK was built and installed; the owner then confirmed “haan ab fast hai”. This is qualitative release validation, not a measured frame latency. Draft-back and selection were requested but not explicitly confirmed by that reply. Temporary timing diagnostics were removed; evidence and originals remain under `E:\savingo\backup\fix11-bubble-timing` and native originals under fix10.


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
UI only. Send, receipts, DB writes and backend are unchanged. Full file/function list with before/after: `QUICK_INDEX.md`, same date.

**Before**
- Every sent bubble had one colour.
- Status was shown only as a small tick: clock, `checkmark`, `checkmark-done`, green `checkmark-done`.
- New bubbles appeared with no animation.
- The contact list showed only the last message text and time.

**Now**
- The sent bubble colour follows the status: gray while sending or sent, blue when delivered, green when read. The colour fades over 300 ms.
- Icons come from `chatMessageStatus.getChatStatusIndicator`, the one place that maps status to icon and colour:
  - sending: clock
  - sent: `ellipse-outline` (gray)
  - delivered: `radio-button-on` (blue)
  - read: `eye-outline` (green)
  - failed: red, as before
- The icon pops when the status changes.
- A just-sent bubble slides up and fades in. History rows do not animate.
- The contact list shows the same icon before an outgoing last message. Receipts refresh it through `chatStore.version`.

**Owner choices**
- The owner rejected `eye-off` for delivered because it has a strike-through. No unstruck closed-eye icon exists in the bundled icon sets.
- Envelope, phone and cloud sets were tried and dropped. The final set is the circle/eye one above.

**Open note**
- Once, right after the release install, delivered messages stayed gray. Logs showed the `delivered` receipts were written to the DB.
- The owner later reported it fine with no code change, so the cause was not investigated.
- Separately, some receiver-side deliveries were slow (2:46 am messages still sent-only after 11 min). Not investigated, not a UI issue.

**Dev workflow**
- Debug build with the same app id and keystore installs over release without data loss.
- Run Metro with `npm start`, then `adb reverse tcp:8081 tcp:8081`.
- Build with `android\gradlew.bat app:installDebug`. `npm run android` failed to find `gradlew.bat` from PowerShell.
- Run adb from PowerShell; the Bash sandbox cannot see the device.
