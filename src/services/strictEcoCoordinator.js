import {
  ensureOffModeFirstTransactionConsent,
  getStrictEcoSnapshot,
  getUnsettledStrictEcoAccounts,
  setStrictEcoEnabled as persistStrictEcoEnabled,
} from './strictEcoService';
import {
  deleteTransactionsByOffSessionId,
  getOffSessionEnableAnalysis,
} from './transactionsDatabase';

const FREE_FLOW_TITLE = 'Proceed in Free Flow mode?';
const FREE_FLOW_MESSAGE =
  'If you create a transaction while Strict Eco is OFF, you must later settle earning/expenses accounts to zero or delete entries from the current Eco OFF session before enabling Strict Eco again.';

const ENABLE_TITLE = 'Enable Strict Eco system';
const ENABLE_MESSAGE =
  'Turning on Strict Eco will restore balance-based controls. Do you want to continue?';
const DISABLE_TITLE = 'Disable Strict Eco system?';
const DISABLE_MESSAGE =
  'Turning off Strict Eco enables free-flow mode. New transactions will belong to the current Eco OFF session until Strict Eco is enabled again.';

const buildUnsettledAccountsMessage = (
  unsettled,
  intro = 'Before enabling Strict Eco, all earning/expenses accounts must be settled to a zero balance.'
) => {
  const lines = unsettled
    .slice(0, 6)
    .map(
      item =>
        `- ${item.accountName}: ${item.balance > 0 ? '+' : ''}${item.balance.toFixed(2)}`
    );
  const extra =
    unsettled.length > 6
      ? `\n...and ${unsettled.length - 6} more account(s).`
      : '';
  return `${intro}\n\n${lines.join(
    '\n'
  )}${extra}`;
};

const buildCurrentSessionDeleteMessage = analysis =>
  `To enable Strict Eco, either settle all earning/expenses accounts to zero, or delete ${analysis.entryCount} entr${
    analysis.entryCount === 1 ? 'y' : 'ies'
  } created in the current Eco OFF session.`;

const safeRun = async callback => {
  if (typeof callback !== 'function') {
    return;
  }
  await callback();
};

export const ensureEcoTransactionEntryAllowed = async () =>
  ensureOffModeFirstTransactionConsent({
    title: FREE_FLOW_TITLE,
    message: FREE_FLOW_MESSAGE,
  });

export const runStrictEcoToggleFlow = ({
  nextValue,
  themedAlert,
  onStateChange,
  onPersistSuccess,
  requestDestructiveCaptcha,
}) => {
  if (typeof themedAlert !== 'function') {
    return;
  }

  if (nextValue) {
    themedAlert(ENABLE_TITLE, ENABLE_MESSAGE, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'OK',
        onPress: async () => {
          try {
            const snapshot = await getStrictEcoSnapshot();
            const unsettled = getUnsettledStrictEcoAccounts();
            if (__DEV__) {
              console.log('[STRICT_ECO][ENABLE_ATTEMPT]', {
                snapshot,
                unsettled,
              });
            }
            if (unsettled.length > 0) {
              const activeOffSessionId = String(
                snapshot.currentOffSessionId || ''
              ).trim();
              if (__DEV__) {
                console.log('[STRICT_ECO][ENABLE_UNSETTLED_BRANCH]', {
                  activeOffSessionId,
                  unsettledCount: unsettled.length,
                });
              }
              if (activeOffSessionId) {
                const analysis = getOffSessionEnableAnalysis(activeOffSessionId);
                if (__DEV__) {
                  console.log('[STRICT_ECO][ENABLE_ACTIVE_SESSION_ANALYSIS]', {
                    activeOffSessionId,
                    analysis,
                  });
                }
                if (analysis.entryCount > 0) {
                  if (__DEV__) {
                    console.log('[STRICT_ECO][ENABLE_SHOW_DELETE_OPTION]', {
                      activeOffSessionId,
                      entryCount: analysis.entryCount,
                    });
                  }
                  themedAlert(
                    'Action Required',
                    buildCurrentSessionDeleteMessage(analysis),
                    [
                      {text: 'Cancel', style: 'cancel'},
                      {
                        text: 'Delete Entries',
                        style: 'destructive',
                        onPress: () => {
                          themedAlert(
                            'Confirm Delete',
                            `This will delete ${analysis.entryCount} entr${
                              analysis.entryCount === 1 ? 'y' : 'ies'
                            } created in the current Eco OFF session and then enable Strict Eco.`,
                            [
                              {text: 'Cancel', style: 'cancel'},
                              {
                                text: 'Delete & Enable',
                                style: 'destructive',
                                onPress: async () => {
                                  try {
                                    if (typeof requestDestructiveCaptcha === 'function') {
                                      const captchaApproved =
                                        await requestDestructiveCaptcha({
                                          title: 'Final Security Check',
                                          message:
                                            'This will delete all entries from the current Eco OFF session and then enable Strict Eco.',
                                          helperText:
                                            'Use this only when you are sure these OFF-session entries should be removed.',
                                          confirmLabel: 'Delete & Enable',
                                          loadingLabel: 'Deleting...',
                                        });
                                      if (!captchaApproved) {
                                        return;
                                      }
                                    }
                                    if (__DEV__) {
                                      console.log('[STRICT_ECO][ENABLE_DELETE_AND_ENABLE_START]', {
                                        activeOffSessionId,
                                      });
                                    }
                                    await deleteTransactionsByOffSessionId(
                                      activeOffSessionId
                                    );
                                    const nextState =
                                      await persistStrictEcoEnabled(true);
                                    if (__DEV__) {
                                      console.log('[STRICT_ECO][ENABLE_DELETE_AND_ENABLE_DONE]', {
                                        nextState,
                                      });
                                    }
                                    await safeRun(() =>
                                      onStateChange?.(nextState)
                                    );
                                    await safeRun(() =>
                                      onPersistSuccess?.(nextState)
                                    );
                                  } catch (error) {
                                    console.error(
                                      'Failed to delete OFF session entries:',
                                      error
                                    );
                                    themedAlert(
                                      'Error',
                                      'Unable to delete current Eco OFF session entries right now.'
                                    );
                                  }
                                },
                              },
                            ]
                          );
                        },
                      },
                    ]
                  );
                  return;
                }

                if (__DEV__) {
                  console.log('[STRICT_ECO][ENABLE_CURRENT_SESSION_ALREADY_CLEAR]', {
                    activeOffSessionId,
                    analysis,
                  });
                }
                const nextState = await persistStrictEcoEnabled(true);
                await safeRun(() => onStateChange?.(nextState));
                await safeRun(() => onPersistSuccess?.(nextState));
                return;
              }

              if (__DEV__) {
                console.log('[STRICT_ECO][ENABLE_NO_ACTIVE_SESSION_UNSETTLED]', {
                  snapshot,
                  unsettled,
                });
              }
              themedAlert(
                'Settle accounts first',
                buildUnsettledAccountsMessage(
                  unsettled,
                  'Before enabling Strict Eco, all earning/expenses accounts must be settled to a zero balance.'
                )
              );
              return;
            }

            const nextState = await persistStrictEcoEnabled(true);
            if (__DEV__) {
              console.log('[STRICT_ECO][ENABLE_DIRECT_SUCCESS]', {
                nextState,
              });
            }
            await safeRun(() => onStateChange?.(nextState));
            await safeRun(() => onPersistSuccess?.(nextState));
          } catch (error) {
            console.error('Failed to enable strict eco:', error);
            themedAlert('Error', 'Unable to enable Strict Eco right now.');
          }
        },
      },
    ]);
    return;
  }

  themedAlert(DISABLE_TITLE, DISABLE_MESSAGE, [
    {text: 'Cancel', style: 'cancel'},
    {
      text: 'OK',
      onPress: async () => {
        try {
          const nextState = await persistStrictEcoEnabled(false);
          await safeRun(() => onStateChange?.(nextState));
          await safeRun(() => onPersistSuccess?.(nextState));
        } catch (error) {
          console.error('Failed to disable strict eco:', error);
          themedAlert('Error', 'Unable to disable Strict Eco right now.');
        }
      },
    },
  ]);
};
