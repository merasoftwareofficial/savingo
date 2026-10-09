const getLinkedRemarkType = remarkValue => {
  const remark = String(remarkValue || '').trim().toLowerCase();
  if (remark.startsWith('transferred to ')) {
    return 'transfer_to';
  }
  if (remark.startsWith('transferred from ')) {
    return 'transfer_from';
  }
  if (remark.startsWith('requested by ')) {
    return 'request_by';
  }
  if (remark.startsWith('requested from ')) {
    return 'request_from';
  }
  if (remark.startsWith('requested to ')) {
    return 'request_to';
  }
  return null;
};

const extractLinkedAccountName = remarkValue => {
  const remark = String(remarkValue || '').trim();
  if (!remark) {
    return '';
  }
  const lower = remark.toLowerCase();
  const prefixes = [
    'transferred to ',
    'transferred from ',
    'requested by ',
    'requested from ',
    'requested to ',
  ];
  const prefix = prefixes.find(item => lower.startsWith(item));
  if (!prefix) {
    return '';
  }
  const withoutPrefix = remark.slice(prefix.length).trim();
  if (!withoutPrefix) {
    return '';
  }
  const separatorIndex = withoutPrefix.indexOf(' - ');
  const name =
    separatorIndex === -1
      ? withoutPrefix
      : withoutPrefix.slice(0, separatorIndex);
  return name.trim().toLowerCase();
};

const isLinkedRemarkPair = (sourceType, candidateType) => {
  if (!sourceType || !candidateType) {
    return true;
  }
  if (sourceType === 'transfer_to') {
    return candidateType === 'transfer_from';
  }
  if (sourceType === 'transfer_from') {
    return candidateType === 'transfer_to';
  }
  if (sourceType === 'request_by') {
    return candidateType === 'request_from' || candidateType === 'request_to';
  }
  if (sourceType === 'request_from') {
    return candidateType === 'request_by';
  }
  if (sourceType === 'request_to') {
    return candidateType === 'request_by';
  }
  return true;
};

export {getLinkedRemarkType, extractLinkedAccountName, isLinkedRemarkPair};
