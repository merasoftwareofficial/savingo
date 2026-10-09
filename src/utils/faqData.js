export const FAQ_DATA = [
  {
    id: 'accounts-transactions',
    title: 'Accounts & Transactions',
    icon: 'wallet-outline',
    description: 'Learn how to add accounts, record transactions, and manage your money',
    questions: [
      {
        id: 'add-account',
        question: 'How do I add a new account?',
        answer: 'To add a new account:\n1. Go to the Dashboard screen\n2. Look for the "Add Account" button\n3. Enter the account name and select the account type\n4. Choose a color for the account (optional)\n5. Tap "Create Account"\n\nYou can create multiple accounts for different purposes like Personal, Business, Savings, etc.',
      },
      {
        id: 'add-transaction',
        question: 'How do I add a transaction?',
        answer: 'To record a transaction:\n1. On the Dashboard, tap the amount input field\n2. Enter the transaction amount\n3. Select whether it\'s Income or Expense\n4. Choose the account from the dropdown\n5. Add a description (optional)\n6. Tap "Save"\n\nYou can also swipe down on an account card to quickly add a transaction.',
      },
      {
        id: 'edit-delete-transaction',
        question: 'How do I edit or delete a transaction?',
        answer: 'To edit a transaction:\n1. Go to the Ledger tab\n2. Tap on the transaction you want to edit\n3. Modify the details\n4. Tap "Save"\n\nTo delete a transaction:\n1. Long press on the transaction in the Ledger\n2. Tap "Delete"\n3. Confirm the deletion\n\nNote: Deleted transactions cannot be recovered.',
      },
      {
        id: 'primary-account',
        question: 'What is a primary account?',
        answer: 'Primary account system is removed. Earning and expenses flows now work through direct account selection in transaction screens.',
      },
      {
        id: 'income-vs-expense',
        question: 'What\'s the difference between Income and Expense accounts?',
        answer: 'Income Account: Used to track money coming in (salary, refunds, payments received)\n\nExpense Account: Used to track money going out (purchases, bills, payments made)\n\nYour total balance is calculated as: (All Income) - (All Expenses)\n\nYou can view the breakdown of both in the Dashboard reports section.',
      },
    ],
  },
  {
    id: 'my-profile',
    title: 'My Profile',
    icon: 'person-outline',
    description: 'Manage your profile, change picture, phone number, and occupation',
    questions: [
      {
        id: 'update-profile',
        question: 'How do I update my profile information?',
        answer: 'To update your profile:\n1. Go to More screen (bottom right tab)\n2. Tap on your profile section at the top\n3. Edit your details:\n   - Name\n   - Phone number\n   - Gender\n   - Occupation\n4. Tap "Save"\n\nYour changes are saved both locally and to the cloud.',
      },
      {
        id: 'change-profile-picture',
        question: 'How do I change my profile picture?',
        answer: 'To change your profile photo:\n1. Go to More screen\n2. Tap on your profile section\n3. Tap on the profile photo in the center\n4. Tap the pencil icon to edit\n5. Select a photo from your gallery\n6. Crop the photo as needed\n7. Tap "Save"\n\nYour new profile picture will be updated across the app.',
      },
      {
        id: 'change-phone-number',
        question: 'How do I change my registered phone number?',
        answer: 'To update your phone number:\n1. Go to More screen\n2. Tap on your profile section\n3. Find the "Phone Number" field\n4. Enter your new 10-digit phone number\n5. Tap "Save"\n\nMake sure you enter a valid phone number as it\'s used for WhatsApp reminders and support contact.',
      },
      {
        id: 'change-occupation',
        question: 'How do I update my occupation?',
        answer: 'To change your occupation:\n1. Go to More screen\n2. Tap on your profile section\n3. Tap on the "Occupation" field\n4. Select from the list of occupations or choose "Manual" to enter custom text\n5. Tap "Save"\n\nYour occupation helps us provide relevant features and support.',
      },
    ],
  },
  {
    id: 'ledger-management',
    title: 'Ledger Management',
    icon: 'book-outline',
    description: 'Track all your transactions and view your complete financial history',
    questions: [
      {
        id: 'what-is-ledger',
        question: 'What is the Ledger?',
        answer: 'The Ledger is a complete record of all your transactions. It shows:\n- Date of transaction\n- Amount\n- Transaction type (Income/Expense)\n- Description\n- Account used\n\nYou can view all transactions in chronological order and filter them by date, type, or account. The Ledger is a powerful tool for tracking and analyzing your financial history.',
      },
      {
        id: 'view-transaction-history',
        question: 'How do I view my transaction history?',
        answer: 'To view your transaction history:\n1. Go to the Ledger tab (bottom center)\n2. Scroll through to see all transactions\n3. Use filters to narrow down by:\n   - Date range\n   - Transaction type (Income/Expense)\n   - Account\n\nTap any transaction to see more details or to edit it.',
      },
      {
        id: 'search-transactions',
        question: 'How do I search for a specific transaction?',
        answer: 'To search for a transaction:\n1. Go to Ledger tab\n2. Use the filter options to narrow down the list\n3. Filter by date range to find transactions within a specific period\n4. Filter by type (Income/Expense) or account\n\nYou can also scroll through the ledger to manually find transactions.',
      },
      {
        id: 'delete-account',
        question: 'How do I delete an account?',
        answer: 'To delete an account:\n1. Go to Dashboard\n2. Long press on the account you want to delete\n3. Tap "Delete"\n4. Confirm the deletion\n\nWarning: Deleting an account will also delete all transactions in that account. This action cannot be undone. You can archive the account instead of deleting if you want to keep the data.',
      },
    ],
  },
  {
    id: 'data-backup',
    title: 'Data Backup & Restore',
    icon: 'cloud-upload-outline',
    description: 'Know how to backup or transfer your data to Google Drive safely',
    questions: [
      {
        id: 'how-to-backup',
        question: 'How do I backup my data?',
        answer: 'Your data is automatically backed up daily to Google Drive. You can also manually backup:\n\n1. Go to More screen\n2. Tap "Backup & Restore"\n3. Tap "Backup Now"\n4. Wait for the backup to complete\n5. You\'ll see a confirmation message\n\nAll your transactions, accounts, and settings are securely backed up.',
      },
      {
        id: 'how-to-restore',
        question: 'How do I restore my data from backup?',
        answer: 'To restore your data:\n1. Go to More screen\n2. Tap "Backup & Restore"\n3. Tap "Restore"\n4. Select the backup file you want to restore\n5. Confirm the restoration\n6. The app will restart and load your data\n\nNote: This will overwrite your current data with the backed-up data.',
      },
      {
        id: 'is-data-in-cloud',
        question: 'Is my data stored in the cloud?',
        answer: 'Yes! Savingo automatically backs up your data to Google Drive, which is secure and encrypted. Your data includes:\n- All accounts and transactions\n- Profile information\n- Settings and preferences\n\nBackups happen automatically once per day and whenever you manually trigger a backup. You can access your backups from the Backup & Restore section.',
      },
      {
        id: 'uninstall-app',
        question: 'What happens if I uninstall the app?',
        answer: 'Your data is safe! When you uninstall Savingo:\n- Your backed-up data remains on Google Drive\n- When you reinstall the app and login with the same account, your data will be automatically restored\n- All your transactions and settings will be preserved\n\nMake sure you have a recent backup before uninstalling.',
      },
      {
        id: 'transfer-data-new-phone',
        question: 'How do I transfer data to a new phone?',
        answer: 'To transfer your data to a new phone:\n1. On your old phone:\n   - Go to More > Backup & Restore\n   - Tap "Backup Now" to ensure latest backup\n   - Note: Your data is already backed up to Google Drive\n\n2. On your new phone:\n   - Install Savingo\n   - Login with your email account\n   - The app will automatically detect and restore your latest backup\n   - Confirm the restoration\n\nYour complete financial data will be available on your new phone.',
      },
    ],
  },
  {
    id: 'dashboard-reports',
    title: 'Dashboard & Reports',
    icon: 'stats-chart-outline',
    description: 'Understand your financial summary and view detailed reports',
    questions: [
      {
        id: 'what-is-quick-period',
        question: 'What is the Quick Period feature?',
        answer: 'Quick Period is a configurable time frame for viewing your financial summary. By default, it shows this month\'s data, but you can customize it:\n\n1. Go to More screen\n2. Tap "Settings"\n3. Find "Quick Period Reset Day"\n4. Select a day (1-28)\n5. Your monthly period will reset on that day\n\nFor example: If you set it to the 15th, your monthly summary will show data from the 15th of the previous month to the 15th of the current month.',
      },
      {
        id: 'how-balance-calculated',
        question: 'How is my balance calculated?',
        answer: 'Your balance is calculated as:\n\nNet Balance = Total Income - Total Expense\n\nFor each account:\n- Income adds to the balance\n- Expense subtracts from the balance\n\nYour Dashboard shows:\n- Net Balance: Total across all accounts\n- Income Total: Sum of all income transactions\n- Expense Total: Sum of all expenses\n- Account-wise breakdown\n\nThe balance is updated in real-time as you add transactions.',
      },
      {
        id: 'view-reports',
        question: 'How do I view my income and expense reports?',
        answer: 'To view detailed reports:\n1. Go to Dashboard\n2. Scroll down to see:\n   - This Month summary (Income and Expense)\n   - Net amount earned/spent\n   - Account-wise breakdown\n\n3. Go to Ledger tab to see:\n   - Individual transaction details\n   - Filter by date, type, or account\n   - Export data (coming soon)\n\nReports update automatically as you add new transactions.',
      },
      {
        id: 'filter-transactions',
        question: 'How do I filter transactions by date range?',
        answer: 'To filter transactions in the Ledger:\n1. Go to Ledger tab\n2. Look for the filter options\n3. Select your date range:\n   - Today\n   - This Week\n   - This Month\n   - Custom date range\n4. You can also filter by account or transaction type\n5. Your filtered results will show immediately\n\nFiltering helps you focus on specific periods and analyze your spending patterns.',
      },
    ],
  },
  {
    id: 'currency-settings',
    title: 'Currency Settings',
    icon: 'cash-outline',
    description: 'Change your currency and manage currency-related settings',
    questions: [
      {
        id: 'change-currency',
        question: 'How do I change my currency?',
        answer: 'To change your currency:\n1. Go to More screen\n2. Tap "Settings"\n3. Tap on "Currency"\n4. Select your preferred currency from the list\n5. Tap to confirm\n\nYour currency selection affects:\n- How amounts are displayed\n- Currency symbol shown in the app\n- Reports and statements\n\nYou can change this anytime.',
      },
      {
        id: 'supported-currencies',
        question: 'What currencies are supported?',
        answer: 'Savingo supports major global currencies including:\n- Indian Rupee (₹)\n- US Dollar ($)\n- Euro (€)\n- British Pound (£)\n- Japanese Yen (¥)\n- And 50+ more currencies\n\nYou can select your currency during setup or change it anytime from Settings. The currency symbol will update throughout the app.',
      },
      {
        id: 'multiple-currencies',
        question: 'Can I use multiple currencies?',
        answer: 'Currently, Savingo uses one primary currency for the entire app. However, you can:\n1. Create separate accounts for different currencies (e.g., "USD Account", "EUR Account")\n2. Track them separately in the Ledger\n3. Manually convert amounts when adding transactions\n\nMulti-currency support is on our roadmap for future updates.',
      },
    ],
  },
  {
    id: 'settings-preferences',
    title: 'Settings & Preferences',
    icon: 'settings-outline',
    description: 'Customize your app settings and preferences according to your needs',
    questions: [
      {
        id: 'what-are-settings',
        question: 'What settings can I customize?',
        answer: 'Savingo offers these customizable settings:\n\n1. Currency - Choose your preferred currency\n2. Quick Period Reset Day - Set when your monthly period resets (1-28)\n3. Language - Change app language (coming soon)\n4. Notifications - Manage notification settings\n5. Privacy - Control data privacy settings\n\nGo to More > Settings to customize these options.',
      },
      {
        id: 'notification-settings',
        question: 'How do I customize notifications?',
        answer: 'To manage notifications:\n1. Go to More screen\n2. Look for "Notification Settings"\n3. Toggle notifications on/off for:\n   - Transactions\n   - Budget alerts\n   - Low balance warnings\n   - Backup reminders\n4. Set quiet hours if desired\n5. Adjust sound and vibration preferences\n\nCustomize notifications to stay informed without being overwhelmed.',
      },
    ],
  },
  {
    id: 'privacy-security',
    title: 'Privacy & Security',
    icon: 'shield-checkmark-outline',
    description: 'Understand how your data is protected and kept secure',
    questions: [
      {
        id: 'data-security',
        question: 'Is my financial data secure?',
        answer: 'Yes! Savingo takes security seriously:\n\n✓ All data is encrypted\n✓ Backup to Google Drive with encryption\n✓ Secure authentication with your Google account\n✓ No third-party access to your data\n✓ Data stays private unless you choose to share\n\nYour transactions and account information are protected with industry-standard security measures.',
      },
      {
        id: 'who-can-see-data',
        question: 'Who can see my transaction data?',
        answer: 'Only YOU can see your data:\n- Your transactions are private\n- Not visible to other app users\n- Not shared on social media\n- Only your backup is on Google Drive (encrypted)\n- Support team cannot access your data without permission\n\nYou have complete control over your financial information.',
      },
      {
        id: 'data-sharing',
        question: 'Does Savingo share my data with third parties?',
        answer: 'No. Savingo does NOT:\n✗ Share your data with advertisers\n✗ Sell your information\n✗ Use your data for marketing\n✗ Share with third-party apps\n\nYour data is exclusively yours. We only store what\'s necessary to provide the app service. Read our Privacy Policy for complete details.',
      },
      {
        id: 'logout',
        question: 'How do I logout from my account?',
        answer: 'To logout from Savingo:\n1. Go to More screen\n2. Scroll to the bottom\n3. Tap "LOGOUT"\n4. Confirm the logout\n\nBefore logging out:\n✓ Ensure your data is backed up (go to Backup & Restore)\n✓ Remember your login email\n\nWhen you logout:\n- Local data is cleared from your device\n- Your backup is safe on Google Drive\n- You can login again anytime with your email',
      },
    ],
  },
  {
    id: 'general',
    title: 'General',
    icon: 'help-circle-outline',
    description: 'General information about Savingo and how to get started',
    questions: [
      {
        id: 'what-is-savingo',
        question: 'What is Savingo?',
        answer: 'Savingo is a personal finance management app designed to help you:\n\n✓ Track your income and expenses\n✓ Manage multiple accounts\n✓ Monitor your spending patterns\n✓ Set budgets and track progress\n✓ Get financial insights\n✓ Backup your data securely\n\nWhether you\'re managing personal finances or business transactions, Savingo makes it simple to stay on top of your money.',
      },
      {
        id: 'getting-started',
        question: 'How do I get started with Savingo?',
        answer: 'Getting started is easy:\n\n1. Download the app and login with your email\n2. Set up your profile\n3. Create your first account\n4. Add your transactions\n5. View your financial summary on Dashboard\n\nWe recommend:\n- Entering your previous transactions to get a complete picture\n- Customizing your settings and currencies\n- Setting up backups for data safety\n- Exploring the Ledger to understand your finances',
      },
      {
        id: 'report-bug',
        question: 'How do I report a bug or issue?',
        answer: 'If you encounter any issues:\n\n1. Go to More screen\n2. Scroll down to "Help & Support"\n3. Choose one of these options:\n   - Chat with us on WhatsApp\n   - Send feedback through the app\n\nProvide details about:\n- What you were doing\n- What went wrong\n- Your device and app version\n\nWe\'ll help you resolve the issue quickly.',
      },
      {
        id: 'contact-support',
        question: 'How do I contact support?',
        answer: 'We\'re here to help! You can reach us in multiple ways:\n\n1. WhatsApp: Go to More > Help & Support > Chat with us\n   - Get instant support\n\n2. In-app feedback: Share your feedback and suggestions\n\nOur support team is available to answer your questions and help you get the most out of Savingo.',
      },
      {
        id: 'app-version',
        question: 'What version of the app am I using?',
        answer: 'To check your app version:\n\n1. Go to More screen\n2. Scroll down to "About Us"\n3. Tap "About App"\n4. You\'ll see:\n   - Version number (e.g., 1.0.0)\n   - Build code\n\nKeep your app updated to get the latest features and security improvements. Check your app store for available updates.',
      },
    ],
  },
];
