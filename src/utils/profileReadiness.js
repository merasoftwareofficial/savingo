const normalizeText = value => String(value || '').trim();

export const isProfileSetupComplete = user => user?.setupComplete === true;

export const requiresProfileSetup = user => !isProfileSetupComplete(user);

export const isBackupEligibleUser = user => {
  const username = normalizeText(user?.username);
  return isProfileSetupComplete(user) && username.length > 0;
};

export default {
  isProfileSetupComplete,
  requiresProfileSetup,
  isBackupEligibleUser,
};
