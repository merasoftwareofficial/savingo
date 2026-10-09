// ─── QUICK SUGGESTION CHIPS ───────────────────────────────────────────────────
export const QUICK_QUESTIONS = {
  en: [
    'How to add an account?',
    'How to record a transaction?',
    'How to edit or delete a transaction?',
    'What is the Ledger?',
    'How to backup data?',
    'How to restore data?',
    'How is balance calculated?',
    'How to change currency?',
    'Is my data secure?',
    'How to contact support?',
    'What is Savingo?',
    'How to logout?',
    'How to withdraw money?',
    'How to transfer between accounts?',
    'How to schedule a recurring transaction?',
    'What account types are available?',
  ],
  hi: [
    'Account kaise banayein?',
    'Transaction kaise add karein?',
    'Transaction edit ya delete kaise karein?',
    'Ledger kya hai?',
    'Backup kaise karein?',
    'Data restore kaise karein?',
    'Balance kaise calculate hota hai?',
    'Currency kaise change karein?',
    'Kya mera data safe hai?',
    'Support se contact karein',
    'Savingo kya hai?',
    'Logout kaise karein?',
    'Paise withdraw kaise karein?',
    'Accounts ke beech transfer kaise karein?',
    'Recurring transaction kaise set karein?',
    'Account ke kitne types hain?',
  ],
};

// ─── KNOWLEDGE BASE (sourced directly from FAQ_DATA) ──────────────────────────
const KB = [
  // ── GREETINGS ──
  {
    keywords: ['hello', 'hi', 'hey', 'namaste', 'helo', 'hii', 'sat sri akal', 'namaskar', 'salaam', 'salam', 'good morning', 'good evening'],
    answer: {
      en: 'Hello! I am Savingo Assistant. Ask me anything about the app — I am here to help!',
      hi: 'Namaste! Main Savingo Assistant hoon. App ke baare mein koi bhi sawaal poochhein — main help karunga!',
    },
  },
  {
    keywords: ['thanks', 'thank you', 'shukriya', 'dhanyawad', 'bahut acha', 'nice', 'great', 'perfect', 'thx', 'ty'],
    answer: {
      en: 'You are welcome! Feel free to ask if you have more questions.',
      hi: 'Koi baat nahi! Aur koi sawaal ho to zaroor poochhein.',
    },
  },

  // ── ADD NEW ACCOUNT ──
  {
    keywords: ['add account', 'new account', 'create account', 'account banao', 'account banana', 'naya account', 'account kaise', 'account add', 'account bnao', 'khata banao', 'account banayein', 'account create'],
    answer: {
      en: 'To add a new account:\n1. Go to the Dashboard screen\n2. Look for the "Add Account" button\n3. Enter the account name and select the account type\n4. Choose a color for the account (optional)\n5. Tap "Create Account"\n\nYou can create multiple accounts for different purposes like Personal, Business, Savings, etc.',
      hi: 'Naya account banane ke liye:\n1. Dashboard screen pe jaayein\n2. "Add Account" button dhundhen\n3. Account ka naam aur type select karein\n4. Color choose karein (optional)\n5. "Create Account" tap karein\n\nPersonal, Business, Savings jaise alag-alag purposes ke liye multiple accounts bana sakte hain.',
    },
  },

  // ── ADD TRANSACTION ──
  {
    keywords: ['add transaction', 'record transaction', 'transaction kaise', 'paisa add', 'entry karo', 'transaction add', 'income add', 'expense add', 'amount add', 'new transaction', 'transaction banana', 'transaction karein', 'paise daalo', 'transaction record'],
    answer: {
      en: 'To record a transaction:\n1. On the Dashboard, tap the amount input field\n2. Enter the transaction amount\n3. Select whether it\'s Income or Expense\n4. Choose the account from the dropdown\n5. Add a description (optional)\n6. Tap "Save"\n\nYou can also swipe down on an account card to quickly add a transaction.',
      hi: 'Transaction record karne ke liye:\n1. Dashboard pe amount input field tap karein\n2. Transaction amount enter karein\n3. Income ya Expense select karein\n4. Dropdown se account choose karein\n5. Description add karein (optional)\n6. "Save" tap karein\n\nAccount card pe swipe down karke bhi quickly transaction add kar sakte hain.',
    },
  },

  // ── EDIT / DELETE TRANSACTION ──
  {
    keywords: ['edit transaction', 'delete transaction', 'transaction delete', 'transaction edit', 'transaction hatao', 'transaction badlo', 'wrong entry', 'galat entry', 'entry delete', 'entry edit', 'remove transaction', 'transaction edit ya delete', 'transaction modify'],
    answer: {
      en: 'To edit a transaction:\n1. Go to the Ledger tab\n2. Tap on the transaction you want to edit\n3. Modify the details\n4. Tap "Save"\n\nTo delete a transaction:\n1. Long press on the transaction in the Ledger\n2. Tap "Delete"\n3. Confirm the deletion\n\nNote: Deleted transactions cannot be recovered.',
      hi: 'Transaction edit karne ke liye:\n1. Ledger tab pe jaayein\n2. Jo transaction edit karni hai usse tap karein\n3. Details modify karein\n4. "Save" tap karein\n\nTransaction delete karne ke liye:\n1. Ledger mein transaction pe long press karein\n2. "Delete" tap karein\n3. Deletion confirm karein\n\nNote: Delete ki gayi transaction wapas nahi aati.',
    },
  },

  // ── PRIMARY ACCOUNT ──
  {
    keywords: ['primary account', 'main account', 'default account', 'primary kaise', 'account primary', 'what is primary', 'primary account kya'],
    answer: {
      en: 'Primary account system is removed. Earning and expenses flows now work through direct account selection in transaction screens.',
      hi: 'Primary account system remove ho chuka hai. Ab earning aur expenses flows transaction screens mein direct account selection se chalte hain.',
    },
  },

  // ── INCOME VS EXPENSE ──
  {
    keywords: ['income expense difference', 'income kya hai', 'expense kya hai', 'income vs expense', 'difference between income', 'income account kya', 'expense account kya', 'income aur expense'],
    answer: {
      en: 'Income Account: Used to track money coming in (salary, refunds, payments received)\n\nExpense Account: Used to track money going out (purchases, bills, payments made)\n\nYour total balance is calculated as: (All Income) - (All Expenses)\n\nYou can view the breakdown of both in the Dashboard reports section.',
      hi: 'Income Account: Paisa aane pe track karne ke liye (salary, refunds, payments received)\n\nExpense Account: Paisa jaane pe track karne ke liye (purchases, bills, payments made)\n\nTotal balance calculate hota hai: (All Income) - (All Expenses)\n\nDashboard reports section mein dono ka breakdown dekh sakte hain.',
    },
  },

  // ── UPDATE PROFILE ──
  {
    keywords: ['update profile', 'profile update', 'profile change', 'naam change', 'name change', 'profile edit', 'profile kaise', 'apna naam', 'profile information', 'profile details'],
    answer: {
      en: 'To update your profile:\n1. Go to More screen (bottom right tab)\n2. Tap on your profile section at the top\n3. Edit your details:\n   - Name\n   - Phone number\n   - Gender\n   - Occupation\n4. Tap "Save"\n\nYour changes are saved both locally and to the cloud.',
      hi: 'Profile update karne ke liye:\n1. More screen pe jaayein (bottom right tab)\n2. Upar profile section tap karein\n3. Details edit karein:\n   - Naam\n   - Phone number\n   - Gender\n   - Occupation\n4. "Save" tap karein\n\nAapke changes locally aur cloud dono pe save hote hain.',
    },
  },

  // ── PROFILE PICTURE ──
  {
    keywords: ['profile picture', 'change photo', 'profile photo', 'dp change', 'picture change', 'avatar', 'profile pic', 'photo badlo', 'photo change', 'profile image'],
    answer: {
      en: 'To change your profile photo:\n1. Go to More screen\n2. Tap on your profile section\n3. Tap on the profile photo in the center\n4. Tap the pencil icon to edit\n5. Select a photo from your gallery\n6. Crop the photo as needed\n7. Tap "Save"\n\nYour new profile picture will be updated across the app.',
      hi: 'Profile photo change karne ke liye:\n1. More screen pe jaayein\n2. Profile section tap karein\n3. Beech mein profile photo tap karein\n4. Edit ke liye pencil icon tap karein\n5. Gallery se photo select karein\n6. Zaroorat ho to crop karein\n7. "Save" tap karein\n\nNaya profile picture poore app mein update ho jayega.',
    },
  },

  // ── PHONE NUMBER ──
  {
    keywords: ['phone number', 'mobile number', 'number change', 'contact number', 'registered phone', 'phone badlo', 'number badlo', 'phone number change'],
    answer: {
      en: 'To update your phone number:\n1. Go to More screen\n2. Tap on your profile section\n3. Find the "Phone Number" field\n4. Enter your new 10-digit phone number\n5. Tap "Save"\n\nMake sure you enter a valid phone number as it\'s used for WhatsApp reminders and support contact.',
      hi: 'Phone number update karne ke liye:\n1. More screen pe jaayein\n2. Profile section tap karein\n3. "Phone Number" field dhundhen\n4. Naya 10-digit phone number enter karein\n5. "Save" tap karein\n\nValid phone number enter karein kyunki ye WhatsApp reminders aur support ke liye use hota hai.',
    },
  },

  // ── OCCUPATION ──
  {
    keywords: ['occupation', 'job change', 'profession', 'kaam', 'occupation change', 'occupation update', 'occupation kaise'],
    answer: {
      en: 'To change your occupation:\n1. Go to More screen\n2. Tap on your profile section\n3. Tap on the "Occupation" field\n4. Select from the list of occupations or choose "Manual" to enter custom text\n5. Tap "Save"\n\nYour occupation helps us provide relevant features and support.',
      hi: 'Occupation change karne ke liye:\n1. More screen pe jaayein\n2. Profile section tap karein\n3. "Occupation" field tap karein\n4. List mein se select karein ya custom text ke liye "Manual" choose karein\n5. "Save" tap karein\n\nAapka occupation relevant features aur support provide karne mein help karta hai.',
    },
  },

  // ── WHAT IS LEDGER ──
  {
    keywords: ['what is ledger', 'ledger kya hai', 'ledger kya', 'ledger explain', 'ledger tab', 'ledger screen'],
    answer: {
      en: 'The Ledger is a complete record of all your transactions. It shows:\n- Date of transaction\n- Amount\n- Transaction type (Income/Expense)\n- Description\n- Account used\n\nYou can view all transactions in chronological order and filter them by date, type, or account. The Ledger is a powerful tool for tracking and analyzing your financial history.',
      hi: 'Ledger aapki saari transactions ka complete record hai. Yahan dikhta hai:\n- Transaction ki date\n- Amount\n- Transaction type (Income/Expense)\n- Description\n- Account\n\nSaari transactions chronological order mein dekh sakte hain aur date, type, ya account se filter kar sakte hain. Ledger financial history track karne ka powerful tool hai.',
    },
  },

  // ── VIEW TRANSACTION HISTORY ──
  {
    keywords: ['transaction history', 'view history', 'purani transactions', 'history kaise', 'all transactions', 'past transactions', 'history dekhna'],
    answer: {
      en: 'To view your transaction history:\n1. Go to the Ledger tab (bottom center)\n2. Scroll through to see all transactions\n3. Use filters to narrow down by:\n   - Date range\n   - Transaction type (Income/Expense)\n   - Account\n\nTap any transaction to see more details or to edit it.',
      hi: 'Transaction history dekhne ke liye:\n1. Ledger tab pe jaayein (neeche center)\n2. Scroll karke saari transactions dekhein\n3. Filters use karein:\n   - Date range\n   - Transaction type (Income/Expense)\n   - Account\n\nKisi bhi transaction pe tap karein zyada details ya edit ke liye.',
    },
  },

  // ── SEARCH TRANSACTIONS ──
  {
    keywords: ['search transaction', 'find transaction', 'transaction dhundho', 'specific transaction', 'filter transaction', 'transactions filter', 'date filter', 'filter kaise'],
    answer: {
      en: 'To search for a transaction:\n1. Go to Ledger tab\n2. Use the filter options to narrow down the list\n3. Filter by date range to find transactions within a specific period\n4. Filter by type (Income/Expense) or account\n\nYou can also scroll through the ledger to manually find transactions.',
      hi: 'Transaction search karne ke liye:\n1. Ledger tab pe jaayein\n2. Filter options use karein list narrow down karne ke liye\n3. Date range se specific period ki transactions find karein\n4. Type (Income/Expense) ya account se bhi filter karein\n\nManually dhundne ke liye ledger scroll bhi kar sakte hain.',
    },
  },

  // ── DELETE ACCOUNT ──
  {
    keywords: ['delete account', 'account delete', 'account hatao', 'account remove', 'account band karo', 'account close', 'account destroy'],
    answer: {
      en: 'To delete an account:\n1. Go to Dashboard\n2. Long press on the account you want to delete\n3. Tap "Delete"\n4. Confirm the deletion\n\nWarning: Deleting an account will also delete all transactions in that account. This action cannot be undone. You can archive the account instead of deleting if you want to keep the data.',
      hi: 'Account delete karne ke liye:\n1. Dashboard pe jaayein\n2. Jo account delete karna hai usse long press karein\n3. "Delete" tap karein\n4. Deletion confirm karein\n\nWarning: Account delete karne se us account ki saari transactions bhi delete ho jaayengi. Ye action undo nahi ho sakta. Data rakhna chahte ho to delete ki jagah account archive kar sakte hain.',
    },
  },

  // ── HOW TO BACKUP ──
  {
    keywords: ['how to backup', 'backup kaise', 'backup karo', 'backup karein', 'data save', 'backup now', 'manual backup', 'backup data', 'data backup'],
    answer: {
      en: 'Your data is automatically backed up daily to Google Drive. You can also manually backup:\n\n1. Go to More screen\n2. Tap "Backup & Restore"\n3. Tap "Backup Now"\n4. Wait for the backup to complete\n5. You\'ll see a confirmation message\n\nAll your transactions, accounts, and settings are securely backed up.',
      hi: 'Aapka data automatically roz Google Drive pe backup hota hai. Manual backup ke liye:\n\n1. More screen pe jaayein\n2. "Backup & Restore" tap karein\n3. "Backup Now" tap karein\n4. Backup complete hone ka wait karein\n5. Confirmation message aayega\n\nAapki saari transactions, accounts, aur settings securely backup ho jaati hain.',
    },
  },

  // ── HOW TO RESTORE ──
  {
    keywords: ['how to restore', 'restore kaise', 'data restore', 'backup restore', 'data wapas', 'restore data', 'restore karein', 'purana data wapas'],
    answer: {
      en: 'To restore your data:\n1. Go to More screen\n2. Tap "Backup & Restore"\n3. Tap "Restore"\n4. Select the backup file you want to restore\n5. Confirm the restoration\n6. The app will restart and load your data\n\nNote: This will overwrite your current data with the backed-up data.',
      hi: 'Data restore karne ke liye:\n1. More screen pe jaayein\n2. "Backup & Restore" tap karein\n3. "Restore" tap karein\n4. Jo backup file restore karni hai select karein\n5. Restoration confirm karein\n6. App restart hoga aur data load hoga\n\nNote: Current data backed-up data se overwrite ho jayega.',
    },
  },

  // ── IS DATA IN CLOUD ──
  {
    keywords: ['data cloud', 'cloud mein', 'data stored', 'data kahan', 'google drive', 'data online', 'cloud storage', 'data save kahan'],
    answer: {
      en: 'Yes! Savingo automatically backs up your data to Google Drive, which is secure and encrypted. Your data includes:\n- All accounts and transactions\n- Profile information\n- Settings and preferences\n\nBackups happen automatically once per day and whenever you manually trigger a backup. You can access your backups from the Backup & Restore section.',
      hi: 'Haan! Savingo automatically aapka data Google Drive pe backup karta hai, jo secure aur encrypted hai. Data mein shamil hai:\n- Saare accounts aur transactions\n- Profile information\n- Settings aur preferences\n\nBackup roz automatic hota hai aur jab bhi aap manually trigger karein. Backup & Restore section se access kar sakte hain.',
    },
  },

  // ── UNINSTALL ──
  {
    keywords: ['uninstall', 'delete app', 'app delete', 'app hatao', 'reinstall', 'app uninstall', 'kya hoga uninstall'],
    answer: {
      en: 'Your data is safe! When you uninstall Savingo:\n- Your backed-up data remains on Google Drive\n- When you reinstall the app and login with the same account, your data will be automatically restored\n- All your transactions and settings will be preserved\n\nMake sure you have a recent backup before uninstalling.',
      hi: 'Aapka data safe hai! Savingo uninstall karne pe:\n- Backed-up data Google Drive pe rehta hai\n- App reinstall karke same account se login karo, data automatically restore ho jayega\n- Saari transactions aur settings preserve rahegi\n\nUninstall se pehle recent backup zaroor karein.',
    },
  },

  // ── TRANSFER TO NEW PHONE ──
  {
    keywords: ['new phone', 'naya phone', 'transfer data', 'phone change', 'data transfer', 'new device', 'phone badla', 'phone switch'],
    answer: {
      en: 'To transfer your data to a new phone:\n1. On your old phone:\n   - Go to More > Backup & Restore\n   - Tap "Backup Now" to ensure latest backup\n   - Note: Your data is already backed up to Google Drive\n\n2. On your new phone:\n   - Install Savingo\n   - Login with your email account\n   - The app will automatically detect and restore your latest backup\n   - Confirm the restoration\n\nYour complete financial data will be available on your new phone.',
      hi: 'Naye phone pe data transfer karne ke liye:\n1. Purane phone pe:\n   - More > Backup & Restore pe jaayein\n   - Latest backup ke liye "Backup Now" tap karein\n   - Note: Data already Google Drive pe backed up hai\n\n2. Naye phone pe:\n   - Savingo install karein\n   - Email account se login karein\n   - App automatically latest backup detect karega\n   - Restoration confirm karein\n\nAapka complete financial data naye phone pe available hoga.',
    },
  },

  // ── QUICK PERIOD ──
  {
    keywords: ['quick period', 'monthly reset', 'period reset', 'reset day', 'month start', 'period kya', 'quick period kya', 'period feature'],
    answer: {
      en: 'Quick Period is a configurable time frame for viewing your financial summary. By default, it shows this month\'s data, but you can customize it:\n\n1. Go to More screen\n2. Tap "Settings"\n3. Find "Quick Period Reset Day"\n4. Select a day (1-28)\n5. Your monthly period will reset on that day\n\nFor example: If you set it to the 15th, your monthly summary will show data from the 15th of the previous month to the 15th of the current month.',
      hi: 'Quick Period financial summary dekhne ke liye ek configurable time frame hai. Default mein is mahine ka data dikhata hai, customize karne ke liye:\n\n1. More screen pe jaayein\n2. "Settings" tap karein\n3. "Quick Period Reset Day" dhundhen\n4. Koi din select karein (1-28)\n5. Monthly period us din reset hoga\n\nExample: 15 set karo to monthly summary pichle mahine ki 15 tarikh se is mahine ki 15 tarikh tak ka data dikhayega.',
    },
  },

  // ── BALANCE CALCULATED ──
  {
    keywords: ['balance calculated', 'balance kaise', 'balance calculate', 'total balance', 'net balance', 'balance kya', 'kitna paisa', 'balance formula', 'how is balance'],
    answer: {
      en: 'Your balance is calculated as:\n\nNet Balance = Total Income - Total Expense\n\nFor each account:\n- Income adds to the balance\n- Expense subtracts from the balance\n\nYour Dashboard shows:\n- Net Balance: Total across all accounts\n- Income Total: Sum of all income transactions\n- Expense Total: Sum of all expenses\n- Account-wise breakdown\n\nThe balance is updated in real-time as you add transactions.',
      hi: 'Balance calculate hota hai:\n\nNet Balance = Total Income - Total Expense\n\nHar account ke liye:\n- Income balance mein add hoti hai\n- Expense balance se minus hoti hai\n\nDashboard dikhata hai:\n- Net Balance: Saare accounts ka total\n- Income Total: Saari income transactions ka sum\n- Expense Total: Saare expenses ka sum\n- Account-wise breakdown\n\nTransaction add karte hi balance real-time update hota hai.',
    },
  },

  // ── VIEW REPORTS ──
  {
    keywords: ['view reports', 'income expense report', 'report kaise', 'monthly report', 'financial report', 'reports dekhna', 'summary kahan', 'report kahan'],
    answer: {
      en: 'To view detailed reports:\n1. Go to Dashboard\n2. Scroll down to see:\n   - This Month summary (Income and Expense)\n   - Net amount earned/spent\n   - Account-wise breakdown\n\n3. Go to Ledger tab to see:\n   - Individual transaction details\n   - Filter by date, type, or account\n   - Export data (coming soon)\n\nReports update automatically as you add new transactions.',
      hi: 'Detailed reports dekhne ke liye:\n1. Dashboard pe jaayein\n2. Scroll down karein:\n   - This Month summary (Income aur Expense)\n   - Net amount earned/spent\n   - Account-wise breakdown\n\n3. Ledger tab pe jaayein:\n   - Individual transaction details\n   - Date, type, ya account se filter\n   - Export data (coming soon)\n\nNaye transactions add karte hi reports automatically update hoti hain.',
    },
  },

  // ── FILTER BY DATE ──
  {
    keywords: ['filter date', 'date range', 'date se filter', 'by date', 'date filter', 'specific date', 'week filter', 'month filter', 'custom date'],
    answer: {
      en: 'To filter transactions in the Ledger:\n1. Go to Ledger tab\n2. Look for the filter options\n3. Select your date range:\n   - Today\n   - This Week\n   - This Month\n   - Custom date range\n4. You can also filter by account or transaction type\n5. Your filtered results will show immediately\n\nFiltering helps you focus on specific periods and analyze your spending patterns.',
      hi: 'Ledger mein transactions filter karne ke liye:\n1. Ledger tab pe jaayein\n2. Filter options dhundhen\n3. Date range select karein:\n   - Today\n   - This Week\n   - This Month\n   - Custom date range\n4. Account ya transaction type se bhi filter kar sakte hain\n5. Filtered results turant dikhenge\n\nFiltering specific periods pe focus karne aur spending patterns analyze karne mein help karta hai.',
    },
  },

  // ── CHANGE CURRENCY ──
  {
    keywords: ['change currency', 'currency change', 'currency kaise', 'currency set', 'rupee change', 'dollar set', 'currency select', 'currency badlo'],
    answer: {
      en: 'To change your currency:\n1. Go to More screen\n2. Tap "Settings"\n3. Tap on "Currency"\n4. Select your preferred currency from the list\n5. Tap to confirm\n\nYour currency selection affects:\n- How amounts are displayed\n- Currency symbol shown in the app\n- Reports and statements\n\nYou can change this anytime.',
      hi: 'Currency change karne ke liye:\n1. More screen pe jaayein\n2. "Settings" tap karein\n3. "Currency" tap karein\n4. List mein se preferred currency select karein\n5. Confirm karne ke liye tap karein\n\nCurrency selection affect karta hai:\n- Amounts kaise display hote hain\n- App mein currency symbol\n- Reports aur statements\n\nYe anytime change kar sakte hain.',
    },
  },

  // ── SUPPORTED CURRENCIES ──
  {
    keywords: ['supported currencies', 'which currencies', 'currency list', 'available currency', 'kaunsi currency', 'currencies supported', 'currency options'],
    answer: {
      en: 'Savingo supports major global currencies including:\n- Indian Rupee (₹)\n- US Dollar ($)\n- Euro (€)\n- British Pound (£)\n- Japanese Yen (¥)\n- And 50+ more currencies\n\nYou can select your currency during setup or change it anytime from Settings. The currency symbol will update throughout the app.',
      hi: 'Savingo major global currencies support karta hai:\n- Indian Rupee (₹)\n- US Dollar ($)\n- Euro (€)\n- British Pound (£)\n- Japanese Yen (¥)\n- Aur 50+ aur currencies\n\nSetup ke waqt ya Settings se anytime currency select kar sakte hain. Currency symbol poore app mein update ho jayega.',
    },
  },

  // ── MULTIPLE CURRENCIES ──
  {
    keywords: ['multiple currencies', 'two currencies', 'multi currency', 'alag currency', 'do currency', 'multiple currency support'],
    answer: {
      en: 'Currently, Savingo uses one primary currency for the entire app. However, you can:\n1. Create separate accounts for different currencies (e.g., "USD Account", "EUR Account")\n2. Track them separately in the Ledger\n3. Manually convert amounts when adding transactions\n\nMulti-currency support is on our roadmap for future updates.',
      hi: 'Abhi Savingo poore app ke liye ek primary currency use karta hai. Lekin aap:\n1. Alag currencies ke liye separate accounts bana sakte hain (e.g., "USD Account", "EUR Account")\n2. Ledger mein alag track kar sakte hain\n3. Transactions add karte waqt manually convert kar sakte hain\n\nMulti-currency support future updates ke roadmap pe hai.',
    },
  },

  // ── WHAT SETTINGS ──
  {
    keywords: ['what settings', 'customize settings', 'available settings', 'settings kya', 'settings options', 'kya customize', 'settings mein kya'],
    answer: {
      en: 'Savingo offers these customizable settings:\n\n1. Currency - Choose your preferred currency\n2. Quick Period Reset Day - Set when your monthly period resets (1-28)\n3. Language - Change app language (coming soon)\n4. Notifications - Manage notification settings\n5. Privacy - Control data privacy settings\n\nGo to More > Settings to customize these options.',
      hi: 'Savingo mein ye customizable settings hain:\n\n1. Currency - Preferred currency choose karein\n2. Quick Period Reset Day - Monthly period reset day set karein (1-28)\n3. Language - App language change karein (coming soon)\n4. Notifications - Notification settings manage karein\n5. Privacy - Data privacy settings control karein\n\nMore > Settings pe jaayein ye options customize karne ke liye.',
    },
  },

  // ── NOTIFICATIONS ──
  {
    keywords: ['notification', 'notifications', 'alert', 'notification settings', 'notification off', 'notification on', 'customize notification', 'notification manage'],
    answer: {
      en: 'To manage notifications:\n1. Go to More screen\n2. Look for "Notification Settings"\n3. Toggle notifications on/off for:\n   - Transactions\n   - Budget alerts\n   - Low balance warnings\n   - Backup reminders\n4. Set quiet hours if desired\n5. Adjust sound and vibration preferences\n\nCustomize notifications to stay informed without being overwhelmed.',
      hi: 'Notifications manage karne ke liye:\n1. More screen pe jaayein\n2. "Notification Settings" dhundhen\n3. Notifications on/off toggle karein:\n   - Transactions\n   - Budget alerts\n   - Low balance warnings\n   - Backup reminders\n4. Quiet hours set karein agar chahein\n5. Sound aur vibration preferences adjust karein\n\nNotifications customize karein taaki overwhelm na ho.',
    },
  },

  // ── DATA SECURITY ──
  {
    keywords: ['data secure', 'data safe', 'secure', 'security', 'encrypted', 'financial data secure', 'is data safe', 'kya data safe', 'safe hai'],
    answer: {
      en: 'Yes! Savingo takes security seriously:\n\n✓ All data is encrypted\n✓ Backup to Google Drive with encryption\n✓ Secure authentication with your Google account\n✓ No third-party access to your data\n✓ Data stays private unless you choose to share\n\nYour transactions and account information are protected with industry-standard security measures.',
      hi: 'Haan! Savingo security ko seriously leta hai:\n\n✓ Sab data encrypted hai\n✓ Encryption ke saath Google Drive backup\n✓ Google account se secure authentication\n✓ Koi third-party access nahi\n✓ Data private rehta hai jab tak aap share na karein\n\nAapki transactions aur account information industry-standard security measures se protected hain.',
    },
  },

  // ── WHO CAN SEE DATA ──
  {
    keywords: ['who can see', 'koi dekh sakta', 'data private', 'data visible', 'data privacy', 'private data', 'data access', 'koi access'],
    answer: {
      en: 'Only YOU can see your data:\n- Your transactions are private\n- Not visible to other app users\n- Not shared on social media\n- Only your backup is on Google Drive (encrypted)\n- Support team cannot access your data without permission\n\nYou have complete control over your financial information.',
      hi: 'Sirf AAP apna data dekh sakte hain:\n- Aapki transactions private hain\n- Doosre app users ko nahi dikhti\n- Social media pe share nahi hoti\n- Sirf aapka backup Google Drive pe hai (encrypted)\n- Support team bina permission ke data access nahi kar sakti\n\nAapko apni financial information ka complete control hai.',
    },
  },

  // ── DATA SHARING ──
  {
    keywords: ['data share', 'share data', 'third party', 'data sell', 'data sharing', 'savingo share', 'data kisi ko'],
    answer: {
      en: 'No. Savingo does NOT:\n✗ Share your data with advertisers\n✗ Sell your information\n✗ Use your data for marketing\n✗ Share with third-party apps\n\nYour data is exclusively yours. We only store what\'s necessary to provide the app service. Read our Privacy Policy for complete details.',
      hi: 'Nahi. Savingo YE NAHI karta:\n✗ Advertisers ke saath data share\n✗ Information sell\n✗ Marketing ke liye data use\n✗ Third-party apps se share\n\nAapka data exclusively aapka hai. Hum sirf wahi store karte hain jo app service provide karne ke liye zaroori hai.',
    },
  },

  // ── LOGOUT ──
  {
    keywords: ['logout', 'log out', 'sign out', 'signout', 'bahar niklo', 'account se niklo', 'logout kaise', 'account logout'],
    answer: {
      en: 'To logout from Savingo:\n1. Go to More screen\n2. Scroll to the bottom\n3. Tap "LOGOUT"\n4. Confirm the logout\n\nBefore logging out:\n✓ Ensure your data is backed up (go to Backup & Restore)\n✓ Remember your login email\n\nWhen you logout:\n- Local data is cleared from your device\n- Your backup is safe on Google Drive\n- You can login again anytime with your email',
      hi: 'Savingo se logout karne ke liye:\n1. More screen pe jaayein\n2. Neeche scroll karein\n3. "LOGOUT" tap karein\n4. Logout confirm karein\n\nLogout se pehle:\n✓ Data backed up hai ensure karein (Backup & Restore pe jaayein)\n✓ Login email yaad rakhein\n\nLogout karne pe:\n- Local data device se clear ho jayega\n- Aapka backup Google Drive pe safe rahega\n- Email se anytime wapas login kar sakte hain',
    },
  },

  // ── WHAT IS SAVINGO ──
  {
    keywords: ['what is savingo', 'savingo kya hai', 'app kya karta', 'about savingo', 'savingo about', 'yeh app kya hai', 'app ke baare'],
    answer: {
      en: 'Savingo is a personal finance management app designed to help you:\n\n✓ Track your income and expenses\n✓ Manage multiple accounts\n✓ Monitor your spending patterns\n✓ Set budgets and track progress\n✓ Get financial insights\n✓ Backup your data securely\n\nWhether you\'re managing personal finances or business transactions, Savingo makes it simple to stay on top of your money.',
      hi: 'Savingo ek personal finance management app hai jo aapki help karta hai:\n\n✓ Income aur expenses track karna\n✓ Multiple accounts manage karna\n✓ Spending patterns monitor karna\n✓ Budgets set karna aur progress track karna\n✓ Financial insights lena\n✓ Data securely backup karna\n\nPersonal finances ho ya business transactions — Savingo paise manage karna simple banata hai.',
    },
  },

  // ── GETTING STARTED ──
  {
    keywords: ['how to start', 'getting started', 'kaise shuru', 'start kaise', 'pehli baar', 'new user', 'shuru karna', 'use kaise karein'],
    answer: {
      en: 'Getting started is easy:\n\n1. Download the app and login with your email\n2. Set up your profile\n3. Create your first account\n4. Add your transactions\n5. View your financial summary on Dashboard\n\nWe recommend:\n- Entering your previous transactions to get a complete picture\n- Customizing your settings and currencies\n- Setting up backups for data safety\n- Exploring the Ledger to understand your finances',
      hi: 'Shuru karna aasaan hai:\n\n1. App download karein aur email se login karein\n2. Profile setup karein\n3. Pehla account banayein\n4. Transactions add karein\n5. Dashboard pe financial summary dekhein\n\nHum recommend karte hain:\n- Pehle ki transactions enter karein complete picture ke liye\n- Settings aur currencies customize karein\n- Data safety ke liye backup setup karein\n- Finances samajhne ke liye Ledger explore karein',
    },
  },

  // ── REPORT BUG ──
  {
    keywords: ['report bug', 'bug report', 'issue report', 'problem report', 'something wrong', 'app crash', 'app nahi chal raha', 'error aaya', 'bug hai'],
    answer: {
      en: 'If you encounter any issues:\n\n1. Go to More screen\n2. Scroll down to "Help & Support"\n3. Choose one of these options:\n   - Chat with us on WhatsApp\n   - Send feedback through the app\n\nProvide details about:\n- What you were doing\n- What went wrong\n- Your device and app version\n\nWe\'ll help you resolve the issue quickly.',
      hi: 'Koi issue aaye to:\n\n1. More screen pe jaayein\n2. "Help & Support" pe scroll down karein\n3. Ye options choose karein:\n   - WhatsApp pe chat karein\n   - Seedha call karein\n   - App se feedback bhejein\n\nYe details dein:\n- Aap kya kar rahe the\n- Kya galat hua\n- Device aur app version\n\nHum jaldi issue resolve karne mein help karenge.',
    },
  },

  // ── CONTACT SUPPORT ──
  {
    keywords: ['contact support', 'support contact', 'help contact', 'whatsapp support', 'call support', 'helpline', 'customer care', 'madad chahiye', 'support chahiye', 'contact karein'],
    answer: {
      en: 'We\'re here to help! You can reach us in multiple ways:\n\n1. WhatsApp: Go to More > Help & Support > Chat with us\n   - Get instant support\n\n2. In-app feedback: Share your feedback and suggestions\n\nOur support team is available to answer your questions and help you get the most out of Savingo.',
      hi: 'Hum help karne ke liye hain! Kaafi tarike se reach kar sakte hain:\n\n1. WhatsApp: More > Help & Support > Chat with us\n   - Instant support milega\n\n2. In-app feedback: Feedback aur suggestions share karein\n\nHamaari support team aapke questions answer karne ke liye available hai.',
    },
  },

  // ── APP VERSION ──
  {
    keywords: ['app version', 'version check', 'version number', 'which version', 'latest version', 'version kya hai', 'update check', 'app update'],
    answer: {
      en: 'To check your app version:\n\n1. Go to More screen\n2. Scroll down to "About Us"\n3. Tap "About App"\n4. You\'ll see:\n   - Version number (e.g., 1.0.0)\n   - Build code\n\nKeep your app updated to get the latest features and security improvements. Check your app store for available updates.',
      hi: 'App version check karne ke liye:\n\n1. More screen pe jaayein\n2. "About Us" pe scroll down karein\n3. "About App" tap karein\n4. Yahan dikhega:\n   - Version number (e.g., 1.0.0)\n   - Build code\n\nLatest features aur security improvements ke liye app updated rakhein. Available updates ke liye app store check karein.',
    },
  },

  // ── SETTINGS ──
  {
    keywords: ['settings', 'setting', 'preferences', 'customize', 'settings kahan', 'settings kaise'],
    answer: {
      en: 'Go to More → Settings.\n\nAvailable settings:\n- Currency\n- Quick Period Reset Day\n- Notifications\n- Privacy\n- Theme',
      hi: 'More → Settings pe jaayein.\n\nAvailable settings:\n- Currency\n- Quick Period Reset Day\n- Notifications\n- Privacy\n- Theme',
    },
  },

  // ── FILTER BY PERIOD ──
  {
    keywords: ['filter period', 'time period', 'last 5 days', 'last 10 days', 'last 30 days', 'this month filter', 'period filter', 'date period', '3 months', '6 months', '1 year', 'period select', 'quick period filter'],
    answer: {
      en: 'To filter by time period on Dashboard:\n1. Tap the period selector at the top of Dashboard\n2. Choose from quick options:\n   - Last 5 / 10 / 15 / 30 Days\n   - This Month\n   - 3 Months / 6 Months / 1 Year\n3. Your income, expense, and balance will update instantly for that period.',
      hi: 'Dashboard pe time period filter karne ke liye:\n1. Dashboard ke upar period selector tap karein\n2. Quick options mein se choose karein:\n   - Last 5 / 10 / 15 / 30 Days\n   - This Month\n   - 3 Months / 6 Months / 1 Year\n3. Income, expense aur balance us period ke liye instantly update ho jayega.',
    },
  },

  // ── CUSTOM DATE RANGE ──
  {
    keywords: ['custom date', 'custom range', 'date range select', 'specific date range', 'apni date', 'custom period', 'manual date'],
    answer: {
      en: 'To use a custom date range:\n1. Tap the period selector on Dashboard\n2. Select "Custom Date Range"\n3. Pick your start date\n4. Pick your end date\n5. Dashboard will show data only for that range.',
      hi: 'Custom date range use karne ke liye:\n1. Dashboard pe period selector tap karein\n2. "Custom Date Range" select karein\n3. Start date choose karein\n4. End date choose karein\n5. Dashboard sirf us range ka data dikhayega.',
    },
  },

  // ── SHOW/HIDE SAVINGS ON DASHBOARD ──
  {
    keywords: ['hide savings', 'show savings', 'savings dashboard', 'savings visible', 'savings account dashboard', 'savings hide', 'savings show'],
    answer: {
      en: 'To show or hide savings accounts on Dashboard:\n1. Long press any account on Dashboard\n2. Tap "Personalize Account"\n   OR go to Dashboard settings\n3. Toggle "Show Savings Accounts"\n\nHiding savings accounts keeps your Dashboard clean without deleting any data.',
      hi: 'Dashboard pe savings accounts show/hide karne ke liye:\n1. Dashboard pe kisi bhi account pe long press karein\n2. "Personalize Account" tap karein\n   YA Dashboard settings mein jaayein\n3. "Show Savings Accounts" toggle karein\n\nSavings hide karne se Dashboard clean rehta hai, data delete nahi hota.',
    },
  },

  // ── SAVINGS IN NET BALANCE ──
  {
    keywords: ['savings net balance', 'include savings', 'exclude savings', 'savings calculation', 'net balance savings', 'savings balance include'],
    answer: {
      en: 'To include or exclude savings from net balance:\n1. Long press an account on Dashboard\n2. Go to account settings or Dashboard options\n3. Toggle "Show Balance in Net Calculation"\n\nWhen excluded, savings account balance will not be counted in your total net balance shown on Dashboard.',
      hi: 'Net balance mein savings include/exclude karne ke liye:\n1. Dashboard pe account pe long press karein\n2. Account settings ya Dashboard options mein jaayein\n3. "Show Balance in Net Calculation" toggle karein\n\nExclude karne pe savings ka balance total net balance mein count nahi hoga.',
    },
  },

  // ── REORDER ACCOUNTS ──
  {
    keywords: ['reorder account', 'move account', 'account order', 'arrange account', 'account position', 'move up', 'move down', 'account sequence'],
    answer: {
      en: 'To reorder accounts on Dashboard:\n1. Long press the account you want to move\n2. Tap "Move Up" or "Move Down"\n3. Repeat until the account is in the desired position.\n\nAccounts can be reordered within their type (Earning stays with Earning, Expenses with Expenses).',
      hi: 'Dashboard pe accounts reorder karne ke liye:\n1. Jo account move karna hai usse long press karein\n2. "Move Up" ya "Move Down" tap karein\n3. Repeat karein jab tak account sahi jagah na aa jaye.\n\nAccounts apne type ke andar hi reorder hote hain (Earning, Earning ke saath).',
    },
  },

  // ── RENAME ACCOUNT ──
  {
    keywords: ['rename account', 'account rename', 'change account name', 'account name change', 'account naam badlo', 'naam badlna'],
    answer: {
      en: 'To rename an account:\n1. Long press the account on Dashboard\n2. Tap "Rename Account"\n3. Enter the new name\n4. Tap Save\n\nAccount name can be up to 30 characters.',
      hi: 'Account rename karne ke liye:\n1. Dashboard pe account pe long press karein\n2. "Rename Account" tap karein\n3. Naya naam enter karein\n4. Save tap karein\n\nAccount naam maximum 30 characters ka ho sakta hai.',
    },
  },

  // ── HOME SCREEN SHORTCUT ──
  {
    keywords: ['home screen shortcut', 'add shortcut', 'phone shortcut', 'desktop shortcut', 'home screen add', 'shortcut banana', 'widget add'],
    answer: {
      en: 'To add an account shortcut to your phone home screen:\n1. Long press the account on Dashboard\n2. Tap "Add to Home Screen"\n3. Confirm the shortcut creation\n\nNow you can tap the shortcut directly from your phone home screen to open that account instantly.',
      hi: 'Phone home screen pe account shortcut add karne ke liye:\n1. Dashboard pe account pe long press karein\n2. "Add to Home Screen" tap karein\n3. Shortcut creation confirm karein\n\nAb phone home screen se seedha us account ko instantly open kar sakte ho.',
    },
  },

  // ── ACCOUNT TYPES ──
  {
    keywords: ['account types', 'types of account', 'earning account', 'expenses account', 'savings account', 'account type kya', 'kitne type', 'account type difference'],
    answer: {
      en: 'Savingo has 3 types of accounts:\n\n1. Earning Account — tracks money coming in (salary, business income, freelance)\n2. Expenses Account — tracks money going out (food, transport, bills, shopping)\n3. Savings Account — tracks savings goals (separate from net balance calculation)\n\nYou can create multiple accounts of each type.',
      hi: 'Savingo mein 3 type ke accounts hain:\n\n1. Earning Account — aane wala paisa track karta hai (salary, business, freelance)\n2. Expenses Account — jaane wala paisa track karta hai (khana, transport, bills)\n3. Savings Account — savings goals track karta hai (net balance se alag)\n\nHar type ke multiple accounts bana sakte hain.',
    },
  },

  // ── SAVINGS ACCOUNT ──
  {
    keywords: ['savings account kya', 'what is savings', 'savings kaise banaye', 'create savings', 'savings account create', 'saving account'],
    answer: {
      en: 'A Savings Account is used to track your savings goals separately from daily expenses.\n\nTo create a savings account:\n1. Go to Dashboard\n2. Tap the "+" FAB button\n3. Select "Add Expenses Account"\n4. Choose a savings-related tag or create custom\n5. Tap "Create Account"\n\nSavings accounts can be shown/hidden on Dashboard and optionally excluded from net balance.',
      hi: 'Savings Account daily expenses se alag savings goals track karne ke liye hota hai.\n\nSavings account banane ke liye:\n1. Dashboard pe jaayein\n2. "+" FAB button tap karein\n3. "Add Expenses Account" select karein\n4. Savings-related tag choose karein ya custom banayein\n5. "Create Account" tap karein\n\nSavings accounts Dashboard pe show/hide kar sakte hain aur net balance se exclude bhi kar sakte hain.',
    },
  },

  // ── PREDEFINED CATEGORIES ──
  {
    keywords: ['predefined category', 'account category', 'account tag', 'category list', 'earning category', 'expense category', 'ready made account', 'account templates'],
    answer: {
      en: 'Savingo has predefined account categories:\n\nEarning categories:\nSalary, Business, Freelance, Rental Income, Part-time Job, Investment\n\nExpenses categories:\nEat Out, Transport, Rent, Bills & Utilities, Shopping, Health, Education, Entertainment, Personal Care, Family\n\nYou can also create fully custom accounts with your own name and icon.',
      hi: 'Savingo mein predefined account categories hain:\n\nEarning categories:\nSalary, Business, Freelance, Rental Income, Part-time Job, Investment\n\nExpenses categories:\nEat Out, Transport, Rent, Bills & Utilities, Shopping, Health, Education, Entertainment, Personal Care, Family\n\nApna khud ka custom account bhi bana sakte hain apne naam aur icon ke saath.',
    },
  },

  // ── CUSTOM ACCOUNT ──
  {
    keywords: ['custom account', 'manual account', 'own icon', 'custom icon account', 'apna account', 'khud ka account', 'manual mode'],
    answer: {
      en: 'To create a custom account with your own icon and name:\n1. Go to Dashboard → tap "+" button\n2. Select account type (Earning/Expenses)\n3. Switch to "Manual Mode"\n4. Enter your account name\n5. Select an icon from the picker\n6. Select a color\n7. Tap "Create Account"\n\nManual mode lets you fully customize the account appearance.',
      hi: 'Custom account apne icon aur naam ke saath banane ke liye:\n1. Dashboard → "+" button tap karein\n2. Account type select karein (Earning/Expenses)\n3. "Manual Mode" pe switch karein\n4. Account naam enter karein\n5. Icon picker se icon select karein\n6. Color select karein\n7. "Create Account" tap karein\n\nManual mode mein account appearance fully customize kar sakte hain.',
    },
  },

  // ── CHANGE ACCOUNT COLOR ──
  {
    keywords: ['account color', 'color change account', 'account colour', 'account rang', 'color badlo', 'change color'],
    answer: {
      en: 'To change an account\'s color:\n1. Long press the account on Dashboard\n2. Tap "Personalize Account"\n3. Select a new color from the 6 available options (Blue, Red, Green, Orange, Purple, Teal)\n4. Color saves automatically with a preview update.',
      hi: 'Account ka color change karne ke liye:\n1. Dashboard pe account pe long press karein\n2. "Personalize Account" tap karein\n3. 6 available colors mein se naya color select karein (Blue, Red, Green, Orange, Purple, Teal)\n4. Color automatically save ho jaata hai preview ke saath.',
    },
  },

  // ── CHANGE ACCOUNT ICON ──
  {
    keywords: ['account icon', 'icon change', 'change icon', 'icon badlo', 'account symbol', 'icon select'],
    answer: {
      en: 'To change an account\'s icon:\n1. Long press the account on Dashboard\n2. Tap "Personalize Account"\n3. Scroll through the icon picker\n4. Tap the drag handle to expand for a full grid view\n5. Tap your desired icon\n6. Icon saves automatically.',
      hi: 'Account ka icon change karne ke liye:\n1. Dashboard pe account pe long press karein\n2. "Personalize Account" tap karein\n3. Icon picker mein scroll karein\n4. Full grid view ke liye drag handle tap karein\n5. Apna pasandida icon tap karein\n6. Icon automatically save ho jaata hai.',
    },
  },

  // ── PERSONALIZE ACCOUNT ──
  {
    keywords: ['personalize account', 'customize account', 'account personalize', 'account customize', 'account design', 'account look'],
    answer: {
      en: 'To personalize an account:\n1. Long press the account on Dashboard\n2. Tap "Personalize Account"\n3. You can change:\n   - Account icon (20+ options)\n   - Account color (6 options)\n4. All changes save automatically with live preview.',
      hi: 'Account personalize karne ke liye:\n1. Dashboard pe account pe long press karein\n2. "Personalize Account" tap karein\n3. Ye change kar sakte hain:\n   - Account icon (20+ options)\n   - Account color (6 options)\n4. Saare changes live preview ke saath automatically save hote hain.',
    },
  },

  // ── WITHDRAW FROM ACCOUNT ──
  {
    keywords: ['withdraw', 'withdrawal', 'paise nikalo', 'withdraw kaise', 'account se nikalo', 'money withdraw', 'nikalna'],
    answer: {
      en: 'To withdraw money from an account:\n1. Open the account (tap it on Dashboard)\n2. Tap the "Withdraw" button at the bottom\n3. Enter the amount\n4. Add a note (optional)\n5. Set date and time\n6. Attach receipt (optional)\n7. Tap Confirm\n\nWithdrawal will be recorded as a transaction in the account.',
      hi: 'Account se paise withdraw karne ke liye:\n1. Account open karein (Dashboard pe tap karein)\n2. Neeche "Withdraw" button tap karein\n3. Amount enter karein\n4. Note add karein (optional)\n5. Date aur time set karein\n6. Receipt attach karein (optional)\n7. Confirm tap karein\n\nWithdrawal account mein transaction ke roop mein record ho jayega.',
    },
  },

  // ── TRANSFER BETWEEN ACCOUNTS ──
  {
    keywords: ['transfer account', 'account transfer', 'move money', 'paisa transfer', 'ek account se doosre', 'transfer karo', 'send money account'],
    answer: {
      en: 'To transfer money between accounts:\n1. Open the source account\n2. Tap "Withdraw" or "Transfer" button\n3. Select the target account from the dropdown\n4. Enter the amount\n5. Add a note (optional)\n6. Set date and time\n7. Tap Confirm\n\nBoth accounts will be updated — one debited, one credited.',
      hi: 'Accounts ke beech paisa transfer karne ke liye:\n1. Source account open karein\n2. "Withdraw" ya "Transfer" button tap karein\n3. Dropdown se target account select karein\n4. Amount enter karein\n5. Note add karein (optional)\n6. Date aur time set karein\n7. Confirm tap karein\n\nDono accounts update ho jayenge — ek se kaata jayega, doosre mein add hoga.',
    },
  },

  // ── REQUEST FROM EARNING ACCOUNT ──
  {
    keywords: ['request money', 'request earning', 'request transaction', 'earning se request', 'request kaise', 'account request'],
    answer: {
      en: 'To request money from an earning account (for expenses accounts):\n1. Open your Expenses account\n2. Tap the "Request" button at the bottom\n3. Select the earning account to request from\n4. Enter the amount\n5. Add a note (optional)\n6. Set date and time\n7. Tap Confirm\n\nThis moves money from the earning account to the expenses account.',
      hi: 'Earning account se request karne ke liye (expenses accounts ke liye):\n1. Apna Expenses account open karein\n2. Neeche "Request" button tap karein\n3. Jo earning account se request karni hai wo select karein\n4. Amount enter karein\n5. Note add karein (optional)\n6. Date aur time set karein\n7. Confirm tap karein\n\nYe earning account se expenses account mein paisa move karta hai.',
    },
  },

  // ── ATTACH RECEIPT ──
  {
    keywords: ['attach receipt', 'receipt add', 'receipt kaise', 'bill attach', 'photo attach', 'receipt photo', 'bill photo', 'receipt lagao'],
    answer: {
      en: 'To attach a receipt to a transaction:\n1. While adding a withdrawal or transaction\n2. Tap the receipt/camera icon\n3. Choose:\n   - Camera — take a new photo\n   - Gallery — select from existing photos\n4. Crop the image if needed\n5. Receipt will be saved with the transaction\n\nYou can view or remove the receipt anytime by tapping the transaction.',
      hi: 'Transaction mein receipt attach karne ke liye:\n1. Withdrawal ya transaction add karte waqt\n2. Receipt/camera icon tap karein\n3. Choose karein:\n   - Camera — naya photo lo\n   - Gallery — existing photos mein se select karein\n4. Zaroorat ho to image crop karein\n5. Receipt transaction ke saath save ho jayegi\n\nTransaction tap karke receipt kabhi bhi dekh ya remove kar sakte hain.',
    },
  },

  // ── ADD NOTE TO TRANSACTION ──
  {
    keywords: ['add note', 'transaction note', 'remark add', 'note likhna', 'description transaction', 'transaction remark', 'note kaise'],
    answer: {
      en: 'To add a note or remark to a transaction:\n1. While adding any transaction (add/withdraw/transfer)\n2. Find the "Note" or "Remark" input field\n3. Type your note\n4. Save the transaction\n\nYou can also edit the remark of an existing transaction by tapping it in the Ledger.',
      hi: 'Transaction mein note ya remark add karne ke liye:\n1. Koi bhi transaction add karte waqt (add/withdraw/transfer)\n2. "Note" ya "Remark" input field dhundhen\n3. Apna note type karein\n4. Transaction save karein\n\nExisting transaction ka remark bhi Ledger mein tap karke edit kar sakte hain.',
    },
  },

  // ── CUSTOM DATE TIME FOR TRANSACTION ──
  {
    keywords: ['transaction date', 'custom time', 'transaction time', 'date set', 'purani date', 'past date', 'date change transaction', 'time set'],
    answer: {
      en: 'To set a custom date and time for a transaction:\n1. While adding a transaction\n2. Tap the date/time field\n3. Select your date (past or present — future dates not allowed)\n4. Select hour and minute\n5. Confirm\n\nThis is useful for recording transactions you forgot to add on the same day.',
      hi: 'Transaction ke liye custom date aur time set karne ke liye:\n1. Transaction add karte waqt\n2. Date/time field tap karein\n3. Apni date select karein (past ya present — future dates allowed nahi)\n4. Hour aur minute select karein\n5. Confirm karein\n\nYe un transactions ke liye useful hai jo aap us din add karna bhool gaye the.',
    },
  },

  // ── MATH EXPRESSION IN AMOUNT ──
  {
    keywords: ['math expression', 'calculate amount', 'formula amount', '100+50', 'amount calculate', 'expression', 'calculation amount', 'jod ghatao'],
    answer: {
      en: 'Yes! You can use math expressions directly in the amount field:\n\nExamples:\n- 100+50 → 150\n- 500-200 → 300\n- 250*2 → 500\n- 1000/4 → 250\n\nJust type the expression and Savingo will automatically calculate the result before saving.',
      hi: 'Haan! Amount field mein seedha math expressions use kar sakte hain:\n\nExamples:\n- 100+50 → 150\n- 500-200 → 300\n- 250*2 → 500\n- 1000/4 → 250\n\nBas expression type karein aur Savingo save karne se pehle automatically calculate kar lega.',
    },
  },

  // ── SHOW/HIDE TRANSFER ENTRIES ──
  {
    keywords: ['transfer entries', 'hide transfer', 'show transfer', 'transfer history', 'transfer visible', 'transfer show hide'],
    answer: {
      en: 'To show or hide transfer entries in an account:\n1. Open the account\n2. Tap the three-dot menu (top right)\n3. Toggle "Show Transfer Entries"\n\nWhen hidden, transfer transactions won\'t appear in the account\'s transaction list, keeping it cleaner.',
      hi: 'Account mein transfer entries show/hide karne ke liye:\n1. Account open karein\n2. Three-dot menu tap karein (top right)\n3. "Show Transfer Entries" toggle karein\n\nHide karne pe transfer transactions account ki list mein nahi dikhenge, list clean rahegi.',
    },
  },

  // ── RECURRING TRANSACTION ──
  {
    keywords: ['recurring transaction', 'schedule transaction', 'automatic transaction', 'repeat transaction', 'monthly auto', 'recurring kaise', 'schedule karo', 'auto transaction'],
    answer: {
      en: 'To schedule a recurring transaction:\n1. While adding a transaction (add/withdraw)\n2. Look for the "Schedule" option\n3. Select frequency:\n   - Once\n   - Weekly\n   - Every 2 Weeks\n   - Monthly\n   - Every 2/3/6 Months\n4. Select the specific day/date\n5. Save\n\nThe transaction will automatically repeat at the set interval.',
      hi: 'Recurring transaction schedule karne ke liye:\n1. Transaction add karte waqt (add/withdraw)\n2. "Schedule" option dhundhen\n3. Frequency select karein:\n   - Once\n   - Weekly\n   - Har 2 Weeks\n   - Monthly\n   - Har 2/3/6 Months\n4. Specific day/date select karein\n5. Save karein\n\nTransaction set interval pe automatically repeat hoga.',
    },
  },

  // ── RECURRING FREQUENCIES ──
  {
    keywords: ['recurring frequency', 'repeat frequency', 'how often recurring', 'weekly monthly', 'schedule options', 'frequency options'],
    answer: {
      en: 'Available recurring frequencies in Savingo:\n\n- Once (one-time scheduled)\n- Weekly (every week on selected day)\n- Every 2 Weeks (bi-weekly)\n- Monthly (every month on selected date)\n- Every 2 Months\n- Every 3 Months (quarterly)\n- Every 6 Months (bi-annually)\n\nYou can set the specific day of week or date of month for each.',
      hi: 'Savingo mein available recurring frequencies:\n\n- Once (ek baar scheduled)\n- Weekly (har hafte selected day pe)\n- Har 2 Weeks (bi-weekly)\n- Monthly (har mahine selected date pe)\n- Har 2 Months\n- Har 3 Months (quarterly)\n- Har 6 Months (bi-annually)\n\nHar ek ke liye specific day of week ya date of month set kar sakte hain.',
    },
  },

  // ── AUTO-FUND ──
  {
    keywords: ['auto fund', 'autofund', 'auto top up', 'automatic fund', 'auto fill', 'auto fund kya', 'automatic top up'],
    answer: {
      en: 'Auto-Fund feature is removed. Use withdraw/request flow with explicit account selection.',
      hi: 'Auto-Fund feature remove ho chuka hai. Withdraw/request flow mein direct account selection use karein.',
    },
  },

  // ── AUTO-FUND ENABLE ──
  {
    keywords: ['enable auto fund', 'auto fund enable', 'auto fund kaise', 'auto fund on', 'auto fund savings'],
    answer: {
      en: 'Auto-Fund toggle is no longer available.',
      hi: 'Auto-Fund toggle ab available nahi hai.',
    },
  },
];

// ─── FALLBACK ────────────────────────────────────────────────────────────────
const FALLBACK = {
  en: "I didn't understand that. Please try different words, or ask about:\n• Account management\n• Recording transactions\n• Backup & Restore\n• Ledger & history\n• Currency settings\n• Profile settings\n• Privacy & security\n• Contact support",
  hi: 'Samajh nahi aaya. Alag words mein poochhein, ya in topics pe poochhein:\n• Account management\n• Transaction record karna\n• Backup & Restore\n• Ledger & history\n• Currency settings\n• Profile settings\n• Privacy & security\n• Support contact',
};

// ─── ENGINE ──────────────────────────────────────────────────────────────────
export function getBotResponse(userMessage, language = 'en') {
  const msg = userMessage.toLowerCase().trim();

  for (const item of KB) {
    for (const keyword of item.keywords) {
      if (msg.includes(keyword)) {
        return item.answer[language] || item.answer.en;
      }
    }
  }

  return FALLBACK[language] || FALLBACK.en;
}


