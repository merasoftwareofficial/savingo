// Storage keys for one-time "new feature" notices. A fresh install marks them as
// dismissed (see startupOrchestrator), so only users who had the app before the
// feature existed see them.
export const CREDIT_CARD_NOTICE_DISMISSED_KEY = 'creditCardAccounts.noticeDismissed.v1';

export const FRESH_INSTALL_DISMISSED_NOTICE_KEYS = [CREDIT_CARD_NOTICE_DISMISSED_KEY];
