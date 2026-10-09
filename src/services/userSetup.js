import { getEarningAccountsCount } from './accountsDatabase';

/**
 * Checks if the initial user setup is complete.
 * The setup is considered complete if there is at least one earning account.
 * @returns {boolean} True if setup is complete, false otherwise.
 */
export const isSetupComplete = () => {
  try {
    const earningAccountsCount = getEarningAccountsCount();
    return earningAccountsCount > 0;
  } catch (error) {
    console.error('Failed to check setup status:', error);
    // In case of an error, assume setup is not complete to be safe.
    return false;
  }
};
