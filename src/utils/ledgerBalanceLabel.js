export const getLedgerNetOutstandingLabel = netBalance => {
  if (Number(netBalance) > 0) {
    return 'You Will Receive';
  }
  if (Number(netBalance) < 0) {
    return 'You Need To Pay';
  }
  return 'Settled';
};
