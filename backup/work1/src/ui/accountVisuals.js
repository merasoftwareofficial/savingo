const ORANGE_500 = '#F97316';
const PURPLE_500 = '#8B5CF6';
const TEAL_500 = '#14B8A6';
const AMBER_500 = '#F59E0B';
const PINK_500 = '#EC4899';
const SLATE_500 = '#64748B';
const BROWN_500 = '#A16207';
const CYAN_500 = '#06B6D4';
const MAGENTA_500 = '#D946EF';
const ROSE_500 = '#F43F5E';
const LIME_700 = '#4D7C0F';
const VIOLET_600 = '#7C3AED';
const STONE_500 = '#78716C';
const CREDIT_GRAY = '#808080';
const CREDIT_DARK_WINE = '#7F1D1D';
const CREDIT_DARK_GREEN = '#1F4D3D';
const CREDIT_DARK_BLUE = '#1E3A5F';

const CREDIT_COLOR_OPTIONS_ROTATION = [
  CREDIT_GRAY,
  CREDIT_DARK_WINE,
  CREDIT_DARK_GREEN,
  CREDIT_DARK_BLUE,
];

export const RESERVED_ACCOUNT_COLORS = [
  '#3B82F6',
  '#2563EB',
  '#1E40AF',
  '#EF4444',
  '#DC2626',
  '#B91C1C',
  '#22C55E',
  '#16A34A',
  '#15803D',
];

export const ACCOUNT_COLOR_OPTIONS = [
  {name: 'Orange', value: ORANGE_500},
  {name: 'Purple', value: PURPLE_500},
  {name: 'Teal', value: TEAL_500},
  {name: 'Amber', value: AMBER_500},
  {name: 'Pink', value: PINK_500},
  {name: 'Slate', value: SLATE_500},
  {name: 'Brown', value: BROWN_500},
  {name: 'Cyan', value: CYAN_500},
  {name: 'Magenta', value: MAGENTA_500},
  {name: 'Rose', value: ROSE_500},
  {name: 'Olive', value: LIME_700},
  {name: 'Violet', value: VIOLET_600},
  {name: 'Stone', value: STONE_500},
];

export const CREDIT_ACCOUNT_COLOR_OPTIONS = [
  {name: 'Matte Black', value: CREDIT_GRAY},
  {name: 'Dark Wine', value: CREDIT_DARK_WINE},
  {name: 'Dark Green', value: CREDIT_DARK_GREEN},
  {name: 'Dark Blue', value: CREDIT_DARK_BLUE},
];

export const AUTO_ACCOUNT_COLOR_OPTIONS = [
  ORANGE_500,
  PURPLE_500,
  TEAL_500,
  AMBER_500,
  PINK_500,
  SLATE_500,
  BROWN_500,
  CYAN_500,
  MAGENTA_500,
  ROSE_500,
  LIME_700,
  VIOLET_600,
  STONE_500,
];

const CREDIT_AUTO_COLOR_OPTIONS = CREDIT_ACCOUNT_COLOR_OPTIONS.map(item => item.value);

export const EARNING_TAG_OPTIONS = [
  {tag: 'Salary', icon: 'briefcase-outline', color: PURPLE_500},
  {tag: 'Business', icon: 'storefront-outline', color: BROWN_500},
  {tag: 'Freelance', icon: 'desktop-outline', color: TEAL_500},
  {tag: 'Rental Income', icon: 'business-outline', color: ORANGE_500},
  {tag: 'Part-time Job', icon: 'construct-outline', color: AMBER_500},
  {tag: 'Investment', icon: 'trending-up-outline', color: PINK_500},
];

export const EXPENSES_TAG_OPTIONS = [
  {tag: 'Eat Out', icon: 'restaurant-outline', color: ORANGE_500},
  {tag: 'Transport', icon: 'car-outline', color: TEAL_500},
  {tag: 'Rent', icon: 'home-outline', color: PURPLE_500},
  {tag: 'Bills & Utilities', icon: 'flash-outline', color: AMBER_500},
  {tag: 'Shopping', icon: 'bag-outline', color: PINK_500},
  {tag: 'Health', icon: 'medical-outline', color: BROWN_500},
  {tag: 'Education', icon: 'book-outline', color: TEAL_500},
  {tag: 'Entertainment', icon: 'game-controller-outline', color: PURPLE_500},
  {tag: 'Personal Care', icon: 'people-outline', color: SLATE_500},
  {tag: 'Family', icon: 'gift-outline', color: ORANGE_500},
];

export const CREDIT_TAG_OPTIONS = [
  {tag: 'Visa', icon: 'card-outline', color: CREDIT_GRAY},
  {tag: 'Mastercard', icon: 'card-outline', color: CREDIT_DARK_WINE},
  {tag: 'RuPay', icon: 'card-outline', color: CREDIT_DARK_GREEN},
  {tag: 'American Express', icon: 'card-outline', color: CREDIT_DARK_BLUE},
  {tag: 'Discover', icon: 'card-outline', color: CREDIT_GRAY},
  {tag: 'Diners Club', icon: 'card-outline', color: CREDIT_DARK_WINE},
  {tag: 'JCB', icon: 'card-outline', color: CREDIT_DARK_GREEN},
  {tag: 'UnionPay', icon: 'card-outline', color: CREDIT_DARK_BLUE},
  {tag: 'Bank Credit Card', icon: 'wallet-outline', color: CREDIT_GRAY},
  {tag: 'Rewards Card', icon: 'diamond-outline', color: CREDIT_DARK_WINE},
];

export const MANUAL_ACCOUNT_ICON_OPTIONS = [
  ...EARNING_TAG_OPTIONS,
  ...EXPENSES_TAG_OPTIONS,
  {tag: 'Cash', icon: 'cash-outline', color: ORANGE_500},
  {tag: 'Wallet', icon: 'wallet-outline', color: PURPLE_500},
  {tag: 'Invoice', icon: 'receipt-outline', color: TEAL_500},
  {tag: 'Accounting', icon: 'calculator-outline', color: AMBER_500},
  {tag: 'Profit', icon: 'bar-chart-outline', color: PINK_500},
  {tag: 'Shop', icon: 'storefront-outline', color: BROWN_500},
  {tag: 'Office', icon: 'business-outline', color: SLATE_500},
  {tag: 'Construction', icon: 'construct-outline', color: CYAN_500},
  {tag: 'Repair', icon: 'hammer-outline', color: MAGENTA_500},
  {tag: 'Inventory', icon: 'cube-outline', color: ROSE_500},
  {tag: 'Wholesale', icon: 'layers-outline', color: LIME_700},
  {tag: 'Groceries', icon: 'cart-outline', color: VIOLET_600},
  {tag: 'Fast Food', icon: 'fast-food-outline', color: ORANGE_500},
  {tag: 'Cafe', icon: 'cafe-outline', color: BROWN_500},
  {tag: 'Bus', icon: 'bus-outline', color: TEAL_500},
  {tag: 'Train', icon: 'train-outline', color: SLATE_500},
  {tag: 'Travel', icon: 'airplane-outline', color: PURPLE_500},
  {tag: 'Clothing', icon: 'shirt-outline', color: PINK_500},
  {tag: 'School', icon: 'school-outline', color: AMBER_500},
  {tag: 'Fitness', icon: 'fitness-outline', color: LIME_700},
  {tag: 'Medicine', icon: 'medkit-outline', color: ROSE_500},
  {tag: 'Internet', icon: 'wifi-outline', color: CYAN_500},
  {tag: 'Water', icon: 'water-outline', color: TEAL_500},
  {tag: 'Mobile', icon: 'phone-portrait-outline', color: AMBER_500},
];

const EARNING_AUTO_ICONS = [
  'bs-cash-coin',
  'briefcase-outline',
  'storefront-outline',
  'receipt-outline',
  'trending-up-outline',
  'bar-chart-outline',
  'business-outline',
  'cash-outline',
  'calculator-outline',
  'construct-outline',
];

const EXPENSES_AUTO_ICONS = [
  'bag-outline',
  'restaurant-outline',
  'cart-outline',
  'fast-food-outline',
  'cafe-outline',
  'car-outline',
  'bus-outline',
  'train-outline',
  'airplane-outline',
  'home-outline',
  'flash-outline',
  'wifi-outline',
  'call-outline',
  'water-outline',
  'medkit-outline',
  'school-outline',
  'shirt-outline',
  'fitness-outline',
  'hammer-outline',
];

const SAVING_AUTO_ICONS = [
  'wallet-outline',
  'archive-outline',
  'shield-checkmark-outline',
  'lock-closed-outline',
];

const CREDIT_AUTO_ICONS = [
  'card-outline',
  'card',
  'wallet-outline',
  'receipt-outline',
  'cash-outline',
  'calculator-outline',
];

const getColorPool = accountType => {
  const type = normalizeType(accountType);
  if (type === 'credit') {
    return CREDIT_AUTO_COLOR_OPTIONS;
  }
  return AUTO_ACCOUNT_COLOR_OPTIONS.filter(
    color => !RESERVED_ACCOUNT_COLORS.includes(String(color || '').trim().toUpperCase()),
  );
};

const normalizeType = accountType => {
  const value = String(accountType || '').trim().toLowerCase();
  if (
    value === 'earning' ||
    value === 'expenses' ||
    value === 'saving' ||
    value === 'credit'
  ) {
    return value;
  }
  return 'expenses';
};

const pickUnused = (options, usedValues, fallbackIndex) => {
  const unused = options.find(value => !usedValues.has(String(value || '').trim()));
  return unused || options[fallbackIndex % options.length];
};

const getIconPool = accountType => {
  const type = normalizeType(accountType);
  if (type === 'earning') {
    return EARNING_AUTO_ICONS;
  }
  if (type === 'saving') {
    return SAVING_AUTO_ICONS;
  }
  if (type === 'credit') {
    return CREDIT_AUTO_ICONS;
  }
  return EXPENSES_AUTO_ICONS;
};

const normalizeAccountNameForVisual = accountName =>
  String(accountName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const hasAnyKeyword = (text, keywords) =>
  keywords.some(keyword => text.includes(keyword));

const NAME_VISUAL_RULES = [
  {
    types: ['earning'],
    keywords: ['salary', 'job', 'wage', 'payroll', 'income'],
    icons: [
      'briefcase-outline',
      'cash-outline',
      'wallet-outline',
      'receipt-outline',
      'card-outline',
      'bar-chart-outline',
    ],
    colors: [PURPLE_500, TEAL_500, AMBER_500, SLATE_500],
  },
  {
    types: ['expenses'],
    keywords: ['installment', 'installments', 'emi', 'loan', 'payment', 'monthly payment'],
    icons: [
      'calendar-outline',
      'card-outline',
      'receipt-outline',
      'calculator-outline',
    ],
    colors: [SLATE_500, PURPLE_500, AMBER_500],
  },
  {
    types: ['earning', 'expenses'],
    keywords: ['shop', 'store', 'mart', 'kirana', 'dukan', 'retail'],
    icons: [
      'storefront-outline',
      'business-outline',
      'receipt-outline',
      'calculator-outline',
      'cube-outline',
    ],
    colors: [BROWN_500, ORANGE_500, AMBER_500],
  },
  {
    types: ['earning', 'expenses'],
    keywords: ['business', 'office', 'company', 'firm', 'agency'],
    icons: [
      'business-outline',
      'briefcase-outline',
      'receipt-outline',
      'calculator-outline',
    ],
    colors: [SLATE_500, PURPLE_500, BROWN_500],
  },
  {
    types: ['earning', 'expenses'],
    keywords: ['factory', 'manufacturing', 'construction', 'labour', 'labor', 'workshop'],
    icons: ['construct-outline', 'hammer-outline', 'cube-outline'],
    colors: [CYAN_500, BROWN_500, SLATE_500],
  },
  {
    types: ['earning', 'expenses'],
    keywords: ['repair', 'service', 'maintenance', 'mechanic'],
    icons: ['hammer-outline', 'construct-outline', 'build-outline'],
    colors: [MAGENTA_500, STONE_500, BROWN_500],
  },
  {
    types: ['earning'],
    keywords: ['freelance', 'online', 'digital', 'computer', 'software', 'design'],
    icons: ['desktop-outline', 'laptop-outline', 'color-palette-outline'],
    colors: [TEAL_500, CYAN_500, PURPLE_500],
  },
  {
    types: ['earning'],
    keywords: ['rent income', 'rental income', 'tenant'],
    icons: ['business-outline', 'home-outline', 'receipt-outline'],
    colors: [ORANGE_500, BROWN_500, PURPLE_500],
  },
  {
    types: ['earning'],
    keywords: ['investment', 'profit', 'trading', 'stock', 'dividend', 'interest'],
    icons: ['trending-up-outline', 'bar-chart-outline', 'stats-chart-outline'],
    colors: [PINK_500, PURPLE_500, TEAL_500],
  },
  {
    types: ['earning', 'expenses'],
    keywords: ['cash', 'counter'],
    icons: ['cash-outline', 'wallet-outline', 'calculator-outline'],
    colors: [ORANGE_500, AMBER_500, BROWN_500],
  },
  {
    types: ['expenses'],
    keywords: ['food', 'restaurant', 'hotel', 'dinner', 'lunch', 'breakfast', 'eat'],
    icons: ['restaurant-outline', 'fast-food-outline', 'cafe-outline'],
    colors: [ORANGE_500, BROWN_500, AMBER_500],
  },
  {
    types: ['expenses'],
    keywords: ['fast food', 'snack', 'burger', 'pizza'],
    icons: ['fast-food-outline', 'restaurant-outline', 'cafe-outline'],
    colors: [ORANGE_500, AMBER_500, BROWN_500],
  },
  {
    types: ['expenses'],
    keywords: ['tea', 'coffee', 'cafe'],
    icons: ['cafe-outline', 'restaurant-outline'],
    colors: [BROWN_500, ORANGE_500],
  },
  {
    types: ['expenses'],
    keywords: ['grocery', 'groceries', 'milk', 'vegetable', 'ration', 'cart'],
    icons: ['cart-outline', 'bag-outline', 'storefront-outline'],
    colors: [VIOLET_600, ORANGE_500, AMBER_500],
  },
  {
    types: ['expenses'],
    keywords: ['shopping', 'market', 'mall'],
    icons: ['bag-outline', 'cart-outline', 'storefront-outline'],
    colors: [PINK_500, VIOLET_600, ORANGE_500],
  },
  {
    types: ['expenses'],
    keywords: ['rent', 'room', 'house', 'home', 'flat'],
    icons: ['home-outline', 'business-outline', 'receipt-outline'],
    colors: [PURPLE_500, BROWN_500, SLATE_500],
  },
  {
    types: ['expenses'],
    keywords: ['electric', 'electricity', 'power', 'bill', 'utility'],
    icons: ['flash-outline', 'receipt-outline', 'calculator-outline'],
    colors: [AMBER_500, ORANGE_500, SLATE_500],
  },
  {
    types: ['expenses'],
    keywords: ['internet', 'wifi', 'broadband'],
    icons: ['wifi-outline', 'globe-outline', 'phone-portrait-outline'],
    colors: [CYAN_500, TEAL_500, SLATE_500],
  },
  {
    types: ['expenses'],
    keywords: ['mobile', 'phone', 'recharge', 'call'],
    icons: ['phone-portrait-outline', 'call-outline', 'receipt-outline'],
    colors: [AMBER_500, CYAN_500, TEAL_500],
  },
  {
    types: ['expenses'],
    keywords: ['water'],
    icons: ['water-outline', 'receipt-outline'],
    colors: [TEAL_500, CYAN_500],
  },
  {
    types: ['expenses'],
    keywords: ['medical', 'medicine', 'doctor', 'hospital', 'health'],
    icons: ['medkit-outline', 'medical-outline', 'fitness-outline'],
    colors: [ROSE_500, PINK_500, BROWN_500],
  },
  {
    types: ['expenses'],
    keywords: ['school', 'fees', 'education', 'tuition', 'class'],
    icons: ['school-outline', 'book-outline', 'receipt-outline'],
    colors: [AMBER_500, TEAL_500, PURPLE_500],
  },
  {
    types: ['expenses'],
    keywords: ['book', 'books', 'stationery'],
    icons: ['book-outline', 'school-outline', 'bag-outline'],
    colors: [TEAL_500, AMBER_500, SLATE_500],
  },
  {
    types: ['expenses'],
    keywords: ['bus'],
    icons: ['bus-outline', 'car-outline'],
    colors: [TEAL_500, SLATE_500],
  },
  {
    types: ['expenses'],
    keywords: ['train', 'railway'],
    icons: ['train-outline', 'bus-outline'],
    colors: [SLATE_500, TEAL_500],
  },
  {
    types: ['expenses'],
    keywords: ['travel', 'trip', 'flight', 'airplane'],
    icons: ['airplane-outline', 'train-outline', 'car-outline'],
    colors: [PURPLE_500, TEAL_500, SLATE_500],
  },
  {
    types: ['expenses'],
    keywords: ['car', 'vehicle', 'petrol', 'diesel', 'fuel', 'transport'],
    icons: ['car-outline', 'car-sport-outline', 'bus-outline'],
    colors: [TEAL_500, AMBER_500, SLATE_500],
  },
  {
    types: ['expenses'],
    keywords: ['cloth', 'clothes', 'clothing', 'shirt', 'dress'],
    icons: ['shirt-outline', 'bag-outline'],
    colors: [PINK_500, PURPLE_500],
  },
  {
    types: ['expenses'],
    keywords: ['gym', 'fitness'],
    icons: ['fitness-outline', 'medkit-outline'],
    colors: [LIME_700, TEAL_500],
  },
  {
    types: ['expenses'],
    keywords: ['family', 'gift', 'festival'],
    icons: ['gift-outline', 'people-outline'],
    colors: [ORANGE_500, PINK_500],
  },
  {
    types: ['saving'],
    keywords: ['saving', 'savings', 'save'],
    icons: ['wallet-outline', 'archive-outline', 'shield-checkmark-outline'],
    colors: [TEAL_500, PURPLE_500, SLATE_500],
  },
  {
    types: ['saving'],
    keywords: ['safe', 'secure', 'security', 'emergency'],
    icons: ['shield-checkmark-outline', 'lock-closed-outline', 'wallet-outline'],
    colors: [SLATE_500, TEAL_500, PURPLE_500],
  },
  {
    types: ['saving'],
    keywords: ['lock', 'fixed', 'deposit', 'fd'],
    icons: ['lock-closed-outline', 'archive-outline', 'wallet-outline'],
    colors: [PURPLE_500, SLATE_500, TEAL_500],
  },
];

const findNameVisualRule = (accountName, accountType) => {
  const text = normalizeAccountNameForVisual(accountName);
  if (!text) {
    return null;
  }
  const type = normalizeType(accountType);
  return (
    NAME_VISUAL_RULES.find(
      rule => rule.types.includes(type) && hasAnyKeyword(text, rule.keywords),
    ) || null
  );
};

const pickRelevantUnused = (options, usedValues) => {
  const safeOptions = Array.isArray(options) ? options.filter(Boolean) : [];
  if (safeOptions.length === 0) {
    return null;
  }
  return (
    safeOptions.find(
      value => !usedValues.has(String(value || '').trim().toUpperCase()),
    ) || safeOptions[0]
  );
};

export const getNextAccountVisual = (existingAccounts = [], accountType = 'expenses') => {
  const type = normalizeType(accountType);
  const accounts = Array.isArray(existingAccounts) ? existingAccounts : [];
  const sameTypeAccounts = accounts.filter(
    account => normalizeType(account?.account_type) === type,
  );
  const usedColors = new Set(
    accounts
      .map(account => String(account?.icon_color || '').trim().toUpperCase())
      .filter(Boolean),
  );
  const usedIcons = new Set(
    sameTypeAccounts
      .map(account => String(account?.icon || '').trim())
      .filter(Boolean),
  );
  const colorOptions = getColorPool(type);
  const iconOptions = getIconPool(type);
  const index = sameTypeAccounts.length;

  return {
    icon: pickUnused(iconOptions, usedIcons, index),
    color: pickUnused(colorOptions, usedColors, accounts.length),
  };
};

export const getBestAccountVisualForName = (
  accountName,
  accountType = 'expenses',
  existingAccounts = [],
) => {
  const rule = findNameVisualRule(accountName, accountType);
  if (rule) {
    const type = normalizeType(accountType);
    const accounts = Array.isArray(existingAccounts) ? existingAccounts : [];
    const sameTypeAccounts = accounts.filter(
      account => normalizeType(account?.account_type) === type,
    );
    const usedIcons = new Set(
      sameTypeAccounts
        .map(account => String(account?.icon || '').trim().toUpperCase())
        .filter(Boolean),
    );
    const usedColors = new Set(
      accounts
        .map(account => String(account?.icon_color || '').trim().toUpperCase())
        .filter(Boolean),
    );

    return {
      icon: pickRelevantUnused(rule.icons, usedIcons),
      color: pickRelevantUnused(rule.colors, usedColors),
    };
  }

  return getNextAccountVisual(existingAccounts, accountType);
};

export const ACCOUNT_COLOR_MIGRATION_MAP = {
  '#111827': CREDIT_GRAY,
};
