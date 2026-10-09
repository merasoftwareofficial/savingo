const parseEditHistory = txn => {
  if (!txn?.edit_history) {
    return [];
  }
  try {
    const parsed = JSON.parse(txn.edit_history);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const buildDeleteHistory = txn => {
  const editCount = Number(txn?.edit_count) || 0;
  if (!editCount) {
    return null;
  }
  const history = parseEditHistory(txn);
  const amountAbs = Math.abs(Number(txn?.amount) || 0);
  const base = history.length ? history : [amountAbs];
  return JSON.stringify([...base, 'Deleted']);
};

export {parseEditHistory, buildDeleteHistory};
