const EXACT_FAKE_NUMBERS = new Set([
  '0000000000',
  '1111111111',
  '2222222222',
  '3333333333',
  '4444444444',
  '5555555555',
  '6666666666',
  '7777777777',
  '8888888888',
  '9999999999',
  '1234567890',
  '9876543210',
  '0123456789',
  '1122334455',
  '9988776655',
  '1212121212',
  '1010101010',
  '1231231231',
  '0001234567',
  '1234500000',
]);

const toDigits = value => String(value || '').replace(/\D/g, '');

export const normalizePhoneForCompare = value => {
  const digits = toDigits(value);
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
};

const isAllSameDigit = digits => /^(\d)\1+$/.test(digits);
const isAscendingSequence = digits => digits === '1234567890';
const isDescendingSequence = digits => digits === '9876543210';
const isAlternatingPair = digits => /^(\d\d)\1+$/.test(digits);

const hasHeavyRepetition = digits => {
  const counts = new Map();
  for (const char of digits) {
    counts.set(char, (counts.get(char) || 0) + 1);
  }
  const maxCount = Math.max(...counts.values());
  return maxCount >= 8;
};

export const isVaguePhoneNumber = value => {
  const digits = normalizePhoneForCompare(value);
  if (!digits || digits.length < 10) {
    return false;
  }

  return (
    EXACT_FAKE_NUMBERS.has(digits) ||
    isAllSameDigit(digits) ||
    isAscendingSequence(digits) ||
    isDescendingSequence(digits) ||
    isAlternatingPair(digits) ||
    hasHeavyRepetition(digits)
  );
};

export const getVaguePhoneError = value => {
  if (!isVaguePhoneNumber(value)) {
    return '';
  }
  return 'Please enter a valid phone number.';
};

