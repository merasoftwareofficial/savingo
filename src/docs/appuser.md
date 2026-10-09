# App-user / phone / backup investigation handoff

## User's required outcome

Find and **prove** the final root cause of this production symptom chain, without
guessing or changing behaviour prematurely:

1. Some old users have the app and can otherwise use it, but are not shown as
   app users in Ledger Talk (they see Invite).
2. The same users may have no backup / no saved backup ID.
3. They cannot send or receive chat messages, and other users cannot message
   them.
4. After reinstall, a phone number sometimes becomes missing; entering the
   same number again makes the user work again.
5. A genuinely uninstalled user must still not be shown as an app user. Audit
   all connected behaviour: Ledger paid/get, accounts credit/debit, app-user
   state, uninstall state, backup, online/offline, delivery/seen, and local
   notifications.

The user wants a final evidence-backed root cause, not a plausible theory.
No product-code correction has been authorized in this investigation.

## Business purpose and non-negotiable behaviour

This section records **why** these systems exist. A future agent must preserve
these product rules; do not remove a system merely because it participates in a
bug.

### 1. App-user / uninstall visibility

- Ledger Talk must distinguish a person who can currently use the app from a
  person who genuinely removed it. A genuinely unavailable/uninstalled person
  must not be shown as an available app user and must not receive normal chat
  or Ledger paid/get delivery attempts.
- The Invite UI is for a person who is genuinely not available on the app; it
  is **not** a fallback for a network failure, an unknown lookup result, or an
  expired device push token.
- This feature exists to prevent users from trying to chat or sync Ledger
  entries with someone who cannot receive them. It must remain after the fix.

### 2. Account identity versus device identity

- The Firebase UID/account owns the user profile, registered phone, Ledger
  identity, chat history, backup relationship, and account/transaction data.
- An FCM token identifies one app installation/device only. It exists for
  push notification delivery, message/receipt events, Ledger event delivery,
  and phone-claim notifications.
- Losing a device token must never by itself revoke the person's account phone,
  profile completion, backup eligibility, chats, Ledger balances, or account
  transaction data.

### 3. Phone ownership and reuse

- Phone ownership prevents two accounts from silently claiming the same number.
- The original reason for release logic was valid: a number should not remain
  permanently locked after a person genuinely stops using the app.
- Safe reuse requires explicit account deletion, an approved verified transfer
  / OTP flow, or another account-level proof. It must not be based solely on a
  device push-token result, because reinstall/update/data clear can replace a
  token while the same person still owns the account and number.
- Any repair migration must not auto-restore a released number if another
  current account owns it.

### 4. Ledger Talk, messages, and Ledger paid/get

- A confirmed available app user should be usable for Ledger Talk and normal
  messaging. Chat delivery/seen receipts and local/remote notifications are
  delivery features; their transient failure must not change account identity.
- Ledger paid/get must retain the source user's local transaction and reliably
  sync/queue the peer event. Missing FCM delivery may delay a peer notification,
  but must not silently lose the financial Ledger event.
- Account credit/debit data is separate from Ledger paid/get records. Do not
  merge or delete either while fixing app-user identity.

### 5. Backup and profile setup

- Backup is intended to preserve the user's data and backup ID/Drive state; it
  must not stop because a notification device token became invalid.
- `setupComplete` represents real profile setup, not device delivery health.
  A fix must preserve existing backups, backup IDs, and restore behaviour.

### 6. Online/offline and notifications

- Online/offline is presence information only. It must not decide phone
  ownership, profile setup, backup eligibility, or whether the account exists.
- Local notifications, FCM notifications, delivery receipts, and seen receipts
  may fail/retry independently; they must not convert an account into Invite or
  remove its number.

### 7. Compatibility and data safety

- Fresh installs, old versions updating to new versions, reinstall, app-data
  clear, offline/reconnect, token rotation, and multi-device use must preserve
  the same account identity and phone ownership unless the user explicitly
  changes/deletes/transfers it.
- No correction may silently delete existing phone numbers, chats, Ledger
  balances, account credit/debit data, backups, or notification history.
- Existing genuinely uninstalled users must still become unavailable according
  to a deliberate device-availability/grace policy; the correction must not
  make every historical account permanently appear installed.

## Repository map

- Android React Native app: `AccountApp/`
- Node/Express backend: `backend/`
- Existing Android audit docs: `AccountApp/src/docs/QUICK_INDEX.md` then
  `AccountApp/src/docs/CODE_AUDIT.md`
- Root `AGENTS.md`: default to Android-only changes unless explicitly asked.

## Work completed (read-only)

- Read both existing audit/index documents and traced the relevant client and
  backend paths.
- No source code was edited by this investigation. This handoff file is the
  only new file.
- Attempted an aggregate, read-only MongoDB query using the backend's existing
  `.env` connection. It failed before querying: `querySrv ECONNREFUSED
  _mongodb._tcp.androidaccountapp.berliex.mongodb.net`. No secret was printed,
  no database write was attempted, and therefore no individual production case
  has yet been proven from database history.
- The deployed API (`https://account-android-app-backend.vercel.app/api`) is
  reachable (HTTP 404 at the root is expected because that route is absent).
  The failure is specifically this machine's configured MongoDB SRV DNS lookup,
  not a demonstrated production API outage.

## Verified code facts

### A. One backend state transition spans all four reported symptoms

`backend/services/fcmTokenState.js`

1. `markUserAsUninstalled()` is called for an invalid FCM token. It sets:
   `appInstallState='uninstalled'`, clears `fcmToken`, and—if a number exists—
   sets `phoneOwnershipState='reclaimable'` plus a release deadline (lines
   79-124).
2. `releaseExpiredPhoneOwnerships()` makes current `PhoneLink` rows historical,
   then sets `mobile=null`, `mobileNormalized=null`,
   `phoneOwnershipState='released'`, and `setupComplete=false` (lines 130-184).
3. The daily FCM audit invokes both operations (`backend/services/
   fcmTokenAuditService.js`, lines 69-147). Phone lookups also invoke release:
   `backend/routes/auth.js`, line 363. Thus a lookup can execute a pending
   destructive release; it is not a passive read.
4. Invalid FCM errors from normal chat delivery, Ledger event delivery, and
   phone-claim data pushes can call `markUserAsUninstalled`:
   `routes/messages.js:358`, `routes/ledger.js:182`, `routes/auth.js:102`.
5. FCM-token reassignment additionally marks every other account with the same
   token as uninstalled (`fcmTokenState.js`, lines 228-251).

This is a **proven code-level causal chain** capable of producing: marked
uninstalled -> unavailable chat/Invite -> phone released -> setup incomplete ->
backup blocked. It is not yet proof that it ran for any named affected user.

### B. Each symptom's downstream code is verified

- Chat returns HTTP 410 `RECEIVER_UNAVAILABLE` when receiver state is
  `uninstalled` (`backend/routes/messages.js:249-278`). The Android Ledger
  controller saves the contact as `uninstalled` after that error
  (`AccountApp/src/hooks/useLedgerChatController.js:902-927`).
- Backup eligibility requires `setupComplete === true` and a username
  (`AccountApp/src/utils/profileReadiness.js:5-9`). The auto backup queue simply
  returns when this gate is not ready (`src/utils/backupQueue.js:34-47`).
- On failed `batchSearchUsers()` HTTP/network/auth request, the client returns
  `{}` rather than an explicit unknown/error state
  (`src/services/userProfileService.js:175-247`). Ledger can therefore display
  non-app/Invite for a lookup failure, even though that failure does not prove
  the contact is not an app user (`useLedgerChatController.js:343+`).
- Install-state semantics conflict: `ledgerChatIdentityService.js` defaults a
  missing state to `unknown`; `appUserRecognition.js` defaults it to
  `installed`. The Ledger controller also fabricates `installed` from a cached
  user ID when lookup fails. These competing sources can cause stale false
  positive or false negative UI state.
- Ledger contact persistence intentionally discards all but the first phone
  number (`src/screens/LedgerScreen.js`; documented in existing QUICK_INDEX).
  It can prevent recognition if the retained number is not the registered one.

### C. Separate, proven Ledger paid/get sync-loss defect

`backend/routes/ledger.js:125-131` returns HTTP 200 with `{queued:true}` if a
receiver has no FCM token, but it does not persist the event server-side.
`AccountApp/src/services/ledgerSyncService.js:249+` removes a queued client
event whenever `postLedgerEvent()` resolves. Therefore a receiver without a
token can lose the remote Ledger paid/get event. This is separate from account
transaction storage and must not be misreported as the main app-user cause.

## Historical pre-live-audit gaps (kept for audit trail)

- Which trigger changed a specific affected user: invalid FCM token, shared
  token reassignment, daily audit, explicit phone claim, or client-only lookup
  failure.
- Whether the affected user record had `lastAuditResult=invalid_token`,
  `phoneOwnershipState=reclaimable/released`, and matching timestamps.
- Whether old APK versions cause the invalid token/state pattern. Code supports
  a plausible compatibility/race concern but not proof.
- Whether `backup.fileId` was never uploaded, or its local AsyncStorage key was
  erased. Note: `src/services/api.js:81,87` calls `AsyncStorage.clear()` after
  token refresh failure; this is a second verified mechanism that can erase the
  locally stored backup ID, but it does not delete the Drive backup itself.

## Historical evidence plan (completed where stated below)

1. Restore read-only access to the configured MongoDB host (or obtain a
   sanitized export / a temporary read-only connection). Do not change any user
   document while auditing.
2. For at least one affected user and a matched working user, collect only:
   Firebase UID, state timestamps, `appInstallState`, `fcmTokenStatus`,
   `lastAuditResult`, `phoneOwnershipState`, reclaim/release timestamps,
   presence of mobile, `setupComplete`, and current/historical PhoneLink rows.
   Do not expose phone numbers, tokens, emails, or names in output.
3. Correlate those timestamps with backend deployment/runtime logs and the FCM
   audit schedule. Determine the first writer of the incorrect state.
4. Reproduce on a test account using controlled token invalidation/reinstall,
   offline lookup, and a prior-version upgrade. Record every state transition.
5. Only after the first writer is proven, propose a minimal correction that
   preserves the requirement: a genuinely uninstalled user must not appear as
   an installed app user.

## Historical pre-live-audit conclusion

The strongest code-level candidate is the architectural coupling of **FCM token
validity** to uninstall, phone ownership/release, profile completeness, message
availability, and backup eligibility. It explains the whole reported chain in
one transition, but it remains a candidate until a real affected user record
and timestamp prove that this transition occurred. Do not call it the final
root cause yet.

## Live production audit result (read-only, 2026-09-24)

The machine's default DNS refused the MongoDB SRV lookup, but the same existing
read-only MongoDB query succeeded after using a public DNS resolver for this
process only. No document was created, changed, or deleted.

- Total users: 64.
- `lastAuditResult='invalid_token'`: 23 users.
- Phone-released profiles (`released`, no phone, `setupComplete=false`): 20.
- Of those 20, **17 have `lastAuditResult='invalid_token'`**; one has
  `token_reassigned` and one has `logout_token_detached`.
- 14 of those released profiles retain a historical (non-current) PhoneLink,
  matching the release code path which demotes a current phone link before
  deleting the profile phone.
- One production user is currently `installed` with a valid FCM token but still
  has `phoneOwnershipState='released'`, no phone, and `setupComplete=false`.
  This proves the client can later recover FCM/app-installed status **without
  restoring the profile phone/setup state**.

This is production correlation for the exact state chain in section A, not
merely a static-code possibility.

## Final root cause (proven)

The system uses a **device-level FCM registration token** as the authority for
an **account-level uninstall decision**. When FCM reports a stored token
invalid, backend code treats the person as uninstalled and subsequently
releases that person's phone/profile. This is semantically wrong: FCM tokens
can become invalid or be replaced on reinstall, data clear, token expiry, or
an app update/configuration change. The correct consequence is to remove or
replace that device registration, not to revoke the user's phone ownership or
profile completeness.

Evidence sources:

1. The backend writes the whole destructive chain (section A).
2. Production data shows 17/20 phone-released/incomplete profiles last marked
   `invalid_token`, with matching historical PhoneLink transitions.
3. Firebase documents that a registration token may cease to be valid for
   reasons other than a permanent account uninstall, including expiry and an
   app update whose new version is not configured for messaging:
   <https://firebase.google.com/docs/cloud-messaging/error-codes> and that
   Android registration tokens change on uninstall/reinstall or data clear:
   <https://firebase.google.com/docs/cloud-messaging/android/get-started>.

The separate client lookup/identity inconsistencies and Ledger paid/get
queue-loss are real defects, but they are not the root cause of the shared
phone-missing + backup + Invite + no-message symptom chain.

## Re-check / alternatives ruled out (read-only, 2026-09-24)

The conclusion was challenged and re-tested rather than accepted from the
initial correlation.

- Of the 20 released profiles, 13 retain historical PhoneLinks whose `validTo`
  is on the same day (2) or the next day (11) as their `invalid_token` audit.
  That is the exact timing expected from the daily FCM audit plus the release
  job. Four older profiles have no historical link, consistent with pre-link
  data rather than contradictory evidence.
- The one recovered `installed` profile's later `valid` audit occurs 165 days
  after its historical phone release. This rules out the claim that restoring
  FCM state automatically repairs the released profile.
- Phone claims do not explain these releases: only three claims touch the 20
  released profiles; they are one pending and two rejected. There are **zero**
  approved claims where a released profile was the previous owner.
- The FCM invalid-error matcher accepts only invalid-registration /
  registration-not-registered codes; it does not classify arbitrary message
  payload errors as an invalid-token uninstall.

Therefore the final conclusion survives the main competing explanations:
intentional phone transfer, generic push payload errors, and an isolated
client-only lookup failure cannot account for the observed production release
history.

## Approved direction for a future correction (not implemented)

The user asked what a root-correct solution should do. This is the agreed
architecture direction; it has **not** been implemented yet.

1. Separate the account identity (`firebaseUid`, profile, phone ownership,
   backup eligibility) from device/install delivery identity (FCM token,
   Firebase Installation ID/device ID, token freshness, notification state).
2. On an invalid FCM token, invalidate only that device registration. Do not
   mark the account uninstalled, release its phone, or change `setupComplete`.
3. Track each device installation separately with `firebaseUid`, FID/device ID,
   token, state, and `lastSeenAt`. A user remains available while any current
   device installation is available.
4. For a genuine unavailable/uninstalled presentation, use absence of active
   device installations after a deliberate grace policy. Never use it as a
   trigger to delete the account profile or phone.
5. Release a phone only through explicit number change, verified phone transfer
   / OTP, or explicit account deletion—not a push-token result.
6. Make a failed app-user lookup `unknown/retry`, not non-app/Invite. Retain
   explicit `uninstalled` only when the server confirms that availability state.
7. Repair existing released profiles carefully: recover a historical PhoneLink
   only when there is no current conflicting owner; otherwise use OTP/claim
   verification. Do not blindly restore numbers.

## Expected existing-system behaviour after that correction

- Notifications: an invalid token means delivery to that **device** fails until
  it registers a current token; it does not affect the account's phone, backup,
  or Ledger identity.
- Reinstall/update/data-clear: the new device token activates that device again;
  the existing account, phone, profile setup, backup and chats remain intact.
- Ledger Talk/chat: an account is not converted to Invite merely because its
  prior device token expired. A real unavailable account is shown unavailable
  only after the device-availability policy decides so.
- Multiple devices: uninstalling one device does not make the user unavailable
  if another active installation remains.
- Backup: it continues because account profile setup does not flip false from a
  token event. `backup.fileId` remains a separate local/Drive concern.
- Phone reuse: it is no longer immediate after an uninstall event. This is an
  intentional trade-off: safe reuse requires verified transfer/OTP or explicit
  deletion, rather than risking deletion of an active user's number.

## Separate defects to preserve in implementation scope

- `LedgerScreen` persists only the first contact phone; this can break phone
  matching for contacts with multiple numbers.
- `batchSearchUsers()` collapses network/auth/server failures into `{}`, which
  can incorrectly render Invite. Add an error/unknown result rather than
  treating it as absence.
- Ledger paid/get sync returns successful `{queued:true}` without server-side
  persistence when the receiver lacks an FCM token; the client then drops the
  event. This must be fixed as a separate Ledger sync change, not mixed into the
  account/device identity correction.
