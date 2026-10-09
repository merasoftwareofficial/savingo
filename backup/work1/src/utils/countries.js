/**
 * List of supported countries with their codes and currencies
 */
export const COUNTRIES = [
  { code: 'IN', name: 'India', dialCode: '+91', currency: '₹' },
  { code: 'US', name: 'United States', dialCode: '+1', currency: '$' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', currency: '£' },
  { code: 'CA', name: 'Canada', dialCode: '+1', currency: 'C$' },
  { code: 'AU', name: 'Australia', dialCode: '+61', currency: 'A$' },
  { code: 'DE', name: 'Germany', dialCode: '+49', currency: '€' },
  { code: 'FR', name: 'France', dialCode: '+33', currency: '€' },
  { code: 'JP', name: 'Japan', dialCode: '+81', currency: '¥' },
  { code: 'CN', name: 'China', dialCode: '+86', currency: '¥' },
  { code: 'BR', name: 'Brazil', dialCode: '+55', currency: 'R$' },
  { code: 'MX', name: 'Mexico', dialCode: '+52', currency: '$' },
  { code: 'IT', name: 'Italy', dialCode: '+39', currency: '€' },
  { code: 'ES', name: 'Spain', dialCode: '+34', currency: '€' },
  { code: 'NZ', name: 'New Zealand', dialCode: '+64', currency: 'NZ$' },
  { code: 'SG', name: 'Singapore', dialCode: '+65', currency: 'S$' },
  { code: 'HK', name: 'Hong Kong', dialCode: '+852', currency: 'HK$' },
  { code: 'RU', name: 'Russia', dialCode: '+7', currency: '₽' }
];

/**
 * Mapping of country codes to currency symbols
 */
export const countryToCurrency = {
  'IN': '₹',
  'US': '$',
  'GB': '£',
  'CA': 'C$',
  'AU': 'A$',
  'DE': '€',
  'FR': '€',
  'JP': '¥',
  'CN': '¥',
  'BR': 'R$',
  'MX': '$',
  'IT': '€',
  'ES': '€',
  'NZ': 'NZ$',
  'SG': 'S$',
  'HK': 'HK$',
  'RU': '₽'
};

/**
 * Mapping of country codes to currency names
 */
export const countryToCurrencyName = {
  'IN': 'Indian Rupee',
  'US': 'US Dollar',
  'GB': 'British Pound',
  'CA': 'Canadian Dollar',
  'AU': 'Australian Dollar',
  'DE': 'Euro',
  'FR': 'Euro',
  'JP': 'Japanese Yen',
  'CN': 'Chinese Yuan',
  'BR': 'Brazilian Real',
  'MX': 'Mexican Peso',
  'IT': 'Euro',
  'ES': 'Euro',
  'NZ': 'New Zealand Dollar',
  'SG': 'Singapore Dollar',
  'HK': 'Hong Kong Dollar',
  'RU': 'Russian Ruble'
};

/**
 * Get country object by country code
 * @param {string} countryCode - ISO country code (e.g., 'IN')
 * @returns {object|null} - Country object or null
 */
export const getCountryByCode = (countryCode) => {
  return COUNTRIES.find(c => c.code === countryCode) || null;
};

/**
 * Get currency by country code
 * @param {string} countryCode - ISO country code
 * @returns {string} - Currency symbol
 */
export const getCurrencyByCountry = (countryCode) => {
  return countryToCurrency[countryCode] || '₹';
};

/**
 * Get currency name by country code
 * @param {string} countryCode - ISO country code
 * @returns {string} - Currency name
 */
export const getCurrencyNameByCountry = (countryCode) => {
  return countryToCurrencyName[countryCode] || 'Indian Rupee';
};
