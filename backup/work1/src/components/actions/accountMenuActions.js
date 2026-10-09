export const buildEarningAccountMenuActions = ({
  onRename,
  onPersonalize,
  onTransfer,
  showTransferAction = true,
  showTransferEntries,
  onToggleShowTransferEntries,
  onDelete,
}) => {
  const actions = [
    {
      id: 'rename',
      icon: 'create-outline',
      label: 'Rename Account',
      onPress: onRename,
      disabled: false,
      variant: 'default',
      layout: 'row',
    },
    {
      id: 'personalize',
      icon: 'color-palette-outline',
      label: 'Personalization',
      onPress: onPersonalize,
      disabled: false,
      variant: 'default',
      layout: 'row',
    },
  ];

  if (showTransferAction) {
    actions.push(
    {
      id: 'transfer',
      icon: 'swap-horizontal-outline',
      label: 'Transfer',
      onPress: onTransfer,
      disabled: false,
      variant: 'default',
      layout: 'row',
    });
  }

  actions.push(
    {
      id: 'show-transfer-enteries',
      icon: 'swap-horizontal-outline',
      label: 'Show transfer enteries',
      type: 'switch',
      value: Boolean(showTransferEntries),
      onValueChange: onToggleShowTransferEntries,
      disabled: false,
      selected: Boolean(showTransferEntries),
      variant: 'default',
      layout: 'split',
      trailingIcon: null,
    },
    {
      id: 'delete',
      icon: 'trash-outline',
      label: 'Delete Account',
      onPress: onDelete,
      disabled: false,
      variant: 'danger',
      layout: 'row',
    },
  );

  return actions;
};

export const buildExpensesAccountMenuActions = ({
  onRename,
  onPersonalize,
  showTransferAction = false,
  onTransfer,
  showTransferEntriesSettingVisible = true,
  showTransferEntries,
  onToggleShowTransferEntries,
  onDelete,
}) => {
  const actions = [
    {
      id: 'rename',
      icon: 'create-outline',
      label: 'Rename Account',
      onPress: onRename,
      disabled: false,
      variant: 'default',
      layout: 'row',
    },
    {
      id: 'personalize',
      icon: 'color-palette-outline',
      label: 'Personalization',
      onPress: onPersonalize,
      disabled: false,
      variant: 'default',
      layout: 'row',
    },
  ];

  if (showTransferAction) {
    actions.push({
      id: 'transfer',
      icon: 'swap-horizontal-outline',
      label: 'Transfer',
      onPress: onTransfer,
      disabled: false,
      variant: 'default',
      layout: 'row',
    });
  }

  if (showTransferEntriesSettingVisible) {
    actions.push({
      id: 'show-transfer-enteries',
      icon: 'swap-horizontal-outline',
      label: 'Show transfer enteries',
      type: 'switch',
      value: Boolean(showTransferEntries),
      onValueChange: onToggleShowTransferEntries,
      disabled: false,
      selected: Boolean(showTransferEntries),
      variant: 'default',
      layout: 'split',
      trailingIcon: null,
    });
  }

  actions.push({
    id: 'delete',
    icon: 'trash-outline',
    label: 'Delete Account',
    onPress: onDelete,
    disabled: false,
    variant: 'danger',
    layout: 'row',
  });

  return actions;
};

export const buildDashboardAccountMenuActions = ({
  selectedAccount,
  onRename,
  onDelete,
  onPersonalize,
  onAddToHomeScreen,
}) => {
  const actions = [];

  actions.push(
    {
      id: 'rename',
      icon: 'create-outline',
      label: 'Rename',
      onPress: onRename,
      disabled: false,
      variant: 'default',
      layout: 'row',
    },
    {
      id: 'delete',
      icon: 'trash-outline',
      label: 'Delete',
      onPress: onDelete,
      disabled: false,
      variant: 'danger',
      layout: 'row',
    },
    {
      id: 'add-to-home-screen',
      icon: 'add-circle-outline',
      label: 'Add to Home Screen',
      onPress: onAddToHomeScreen,
      disabled: false,
      variant: 'default',
      layout: 'row',
    },
    {
      id: 'personalize',
      icon: 'color-palette-outline',
      label: 'Personalization',
      onPress: onPersonalize,
      disabled: false,
      variant: 'default',
      layout: 'row',
    }
  );

  return actions;
};
