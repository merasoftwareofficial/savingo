# Chat Feature Implementation Guide

## Overview
Global chat feature has been fully implemented with:
- ✅ Frontend screens and navigation
- ✅ Local SQLite database for messages
- ✅ Firebase Cloud Messaging (FCM) integration
- ✅ Backend API endpoints (Vercel serverless functions)
- ✅ MongoDB user directory integration
- ✅ Google Drive backup support

---

## 1. Frontend Setup

### A. Initialize Chat Database on App Start

**File:** `src/App.js` or your main app initialization file

```javascript
import { initChatDatabase } from './src/services/chatDatabase';
import { initMessagingService } from './src/services/messagingService';

export default function App() {
  useEffect(() => {
    // Initialize chat database
    initChatDatabase();

    // Initialize FCM messaging service
    initMessagingService();
  }, []);

  // ... rest of app
}
```

### B. Verify Navigation is Set Up

The following screens and routes have been added:

**Navigation Tabs** (in `MainTabNavigator.js`):
- Dashboard (existing)
- Ledger (existing)
- **Chat** (NEW) ← Points to ChatScreen
- More (existing)

**Stack Routes** (in `AppNavigator.js`):
- `UserSearch` → UserSearchScreen
- `ChatConversation` → ChatConversationScreen

### C. UI Components

Three new screens have been created:

1. **ChatScreen** (`src/screens/ChatScreen.js`)
   - Displays list of conversations
   - Add button to start new chat
   - Navigates to UserSearchScreen

2. **UserSearchScreen** (`src/screens/UserSearchScreen.js`)
   - Global user search by username or phone
   - Shows search results
   - Creates conversation when user tapped
   - Navigates to ChatConversationScreen

3. **ChatConversationScreen** (`src/screens/ChatConversationScreen.js`)
   - Uses react-native-gifted-chat library
   - Real-time message display
   - Send/receive messages
   - Message status indicators

### D. Ledger Integration

**File:** `src/screens/LedgerContactDetailScreen.js`

Chat button has been added to the header. When tapped:
- Searches for user by phone number
- If found: opens chat conversation
- If not found: shows invite option

---

## 2. Backend Setup (Vercel)

### A. Deploy API Endpoints

Copy these files to your Vercel project:

```
api/
├── users/
│   ├── sync-profile.js
│   ├── search.js
│   ├── by-username/[username].js
│   ├── [userId]/profile.js
│   └── update-fcm-token.js
└── messages/
    ├── send.js
    └── delivery-receipt.js
```

### B. Environment Variables

Add to Vercel `.env.local`:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/accountApp
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"...","...":"..."}'
```

**How to get FIREBASE_SERVICE_ACCOUNT_KEY:**
1. Go to Firebase Console → Project Settings
2. Service Accounts tab
3. Generate new private key (JSON format)
4. Copy the entire JSON and paste as environment variable

### C. Endpoints Created

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/users/sync-profile` | Sync user profile to MongoDB |
| POST | `/api/users/search` | Search users globally |
| GET | `/api/users/by-username/:username` | Get user by username |
| GET | `/api/users/:userId/profile` | Get user profile |
| POST | `/api/users/update-fcm-token` | Update FCM token |
| POST | `/api/messages/send` | Send message via FCM |
| POST | `/api/messages/delivery-receipt` | Record delivery receipt |

---

## 3. MongoDB Setup

### A. Extend User Schema

Add these fields to existing `users` collection:

```javascript
{
  userId: String,              // Firebase UID
  username: String,            // Unique, lowercase
  displayName: String,         // Display name
  phoneNumber: String,         // With country code
  email: String,               // Email address
  photoURL: String,            // Profile photo URL
  bio: String,                 // User bio
  searchableTerms: [String],   // Search keywords array
  fcmToken: String,            // Firebase Cloud Messaging token
  isOnline: Boolean,           // Online status
  lastOnline: Date,            // Last seen timestamp
  privacy: {
    phoneNumberVisible: Boolean,   // Default: true
    lastSeenVisible: Boolean,      // Default: true
    profilePhotoVisible: Boolean   // Default: true
  },
  createdAt: Date,
  updatedAt: Date
}
```

### B. Create Indexes

```javascript
// In MongoDB shell or your database management tool
db.users.createIndex({ username: 1 });
db.users.createIndex({ userId: 1 });
db.users.createIndex({ phoneNumber: 1 });
db.users.createIndex({ searchableTerms: 1 });
db.users.createIndex({ "privacy.phoneNumberVisible": 1 });
```

---

## 4. Firebase Setup

### A. Enable Cloud Messaging

1. Go to Firebase Console
2. Select your project
3. Go to Cloud Messaging tab
4. Enable Cloud Messaging API
5. Generate web API key (if needed)

### B. Configure Android

Ensure `google-services.json` is up to date:
- Download latest from Firebase Console
- Place in `android/app/google-services.json`
- Rebuild Android app

### C. Test FCM

```javascript
import messaging from '@react-native-firebase/messaging';

// Get FCM token for testing
const token = await messaging().getToken();
console.log('FCM Token:', token);
```

---

## 5. Testing Checklist

### A. User Search
- [ ] Search user by username
- [ ] Search user by phone number
- [ ] Search returns correct results
- [ ] Privacy settings respected

### B. Message Sending
- [ ] Send message from User A to User B
- [ ] Message appears in User A's local DB with "sending" status
- [ ] Message appears in User B's chat (via FCM push)
- [ ] Delivery receipt sent back
- [ ] Message status updates to "delivered"

### C. Offline Support
- [ ] Send message while offline
- [ ] Message stored locally with "queued" status
- [ ] Internet restored
- [ ] Message automatically sent
- [ ] Status updates to "delivered"

### D. Ledger Integration
- [ ] Open ledger contact
- [ ] Tap Chat button
- [ ] If user on app: chat opens
- [ ] If user not on app: invite option shows

### E. Backup & Restore
- [ ] Send several messages
- [ ] Trigger backup
- [ ] chatDB.db included in backup
- [ ] Restore on new device
- [ ] All messages restored

---

## 6. How Features Work

### Message Flow (User A → User B):

```
1. User A types message in ChatConversationScreen
2. Message saved locally in SQLite (status: "sending")
3. Message sent to backend API: POST /api/messages/send
4. Backend queries MongoDB for User B's FCM token
5. Backend sends FCM push notification to User B
6. User B receives notification and FCM message
7. messagingService.handleIncomingMessage() triggered
8. Message saved in User B's local SQLite
9. Delivery receipt sent back to User A
10. User A's message status updated to "delivered"
11. Conversation updated with last message info
```

### User Search Flow:

```
1. User taps "+" button in ChatScreen
2. Navigates to UserSearchScreen
3. User enters search query (username or phone)
4. Query sent to backend: POST /api/users/search
5. Backend searches MongoDB users collection
6. Results returned with user profiles
7. User taps on result
8. createConversation() creates conversation record
9. Navigates to ChatConversationScreen
10. Ready to send messages
```

---

## 7. Troubleshooting

### Messages Not Sending
- Check FCM token is updated in MongoDB
- Verify backend endpoints are deployed
- Check Firebase project has Cloud Messaging enabled
- Check network connectivity

### Search Not Working
- Verify MongoDB is accessible
- Check searchableTerms are populated
- Verify API endpoint is deployed
- Check Firebase token is valid

### Backup Not Including Chat
- Verify chatDB.db added to DB_FILE_BASES in backupService.js
- Check file exists at: `{RNFS.DocumentDirectoryPath}/chatDB.db`

### FCM Not Receiving Messages
- Check notification permissions granted on device
- Check FCM token in MongoDB user record
- Check Firebase project Cloud Messaging is enabled
- Check device FCM token is valid

---

## 8. Environment Variables Reference

### Frontend (.env or hardcoded)
```
API_URL=https://account-android-app-backend.vercel.app/api
```

### Backend (Vercel)
```
MONGODB_URI=mongodb+srv://...
FIREBASE_SERVICE_ACCOUNT_KEY={...}
```

---

## 9. Next Steps

1. **Deploy Backend Endpoints:**
   - Push `/api` folder to Vercel
   - Set environment variables
   - Test endpoints

2. **Configure MongoDB:**
   - Extend user schema with new fields
   - Create indexes
   - Test queries

3. **Test Application:**
   - Create test accounts
   - Test user search
   - Test message sending
   - Test offline support
   - Test backup/restore

4. **Optional Enhancements:**
   - Add end-to-end encryption
   - Add group chats
   - Add voice/video calls
   - Add typing indicators
   - Add online status

---

## 10. File Structure

```
Frontend Files Created:
├── src/services/
│   ├── chatDatabase.js          (Local SQLite)
│   ├── userProfileService.js    (API calls)
│   └── messagingService.js      (FCM integration)
├── src/screens/
│   ├── ChatScreen.js            (Conversation list)
│   ├── UserSearchScreen.js      (Global search)
│   └── ChatConversationScreen.js (Message thread)
└── src/navigation/
    ├── MainTabNavigator.js      (Chat tab added)
    └── AppNavigator.js          (New routes added)

Backend Files Created:
├── api/users/
│   ├── sync-profile.js
│   ├── search.js
│   ├── by-username/[username].js
│   ├── [userId]/profile.js
│   └── update-fcm-token.js
└── api/messages/
    ├── send.js
    └── delivery-receipt.js

Configuration Files Modified:
├── src/services/backupService.js    (chatDB.db added)
├── src/services/ledgerDatabase.js   (Chat integration)
└── package.json                      (New dependencies added)
```

---

## Summary

✅ **Completed:**
- Frontend chat UI (3 screens)
- Local SQLite database (4 tables)
- Firebase Cloud Messaging integration
- Backend API endpoints (6 endpoints)
- MongoDB user directory
- Ledger integration
- Google Drive backup support

🚀 **Ready to:**
1. Deploy backend to Vercel
2. Configure MongoDB schema
3. Set Firebase environment variables
4. Test end-to-end
5. Launch to users!

---

**Questions?** Check the error logs or message trackers in the services for debugging.
