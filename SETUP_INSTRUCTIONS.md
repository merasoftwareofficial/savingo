# Account App - Final Setup Instructions

## ✅ Code Setup Complete!

Backend aur Frontend ka saara code ready hai. Ab aapko ye manual steps karne hain:

---

## STEP 1: google-services.json Copy Karein

**Agar abhi tak nahi kiya:**

```bash
copy E:\account-android-app\google-services.json E:\account-android-app\AccountApp\android\app\google-services.json
```

---

## STEP 2: Firebase Web Client ID Get Karein

1. Firebase Console mein jaayein: https://console.firebase.google.com/
2. Apni project select karein
3. Project Settings → General tab
4. Neeche scroll karke **"Your apps"** section mein jaayein
5. **Web app** add karein (agar nahi hai):
   - Click **"Add app"** → **Web icon (</>)**
   - App nickname: "AccountApp Web"
   - Register karein
6. **Firebase SDK configuration** dikhega:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "...",
     projectId: "...",
     // ...
   };
   ```
7. **Copy karna hai sirf `apiKey` wali value**

---

## STEP 3: Web Client ID Ko Code Mein Add Karein

File open karein: `AccountApp/src/config/firebase.js`

Line 6 par ye hai:
```javascript
webClientId: 'YOUR_WEB_CLIENT_ID_FROM_FIREBASE',
```

**Replace karein** apni Web API Key se:
```javascript
webClientId: 'AIzaSyB...your_actual_key_here',
```

Save karein!

---

## STEP 4: SHA-1 Certificate Generate Karein

Terminal mein ye commands run karein:

```bash
cd E:\account-android-app\AccountApp\android
gradlew signingReport
```

**Output mein search karein:**
```
SHA1: AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD
```

Ye SHA1 hash **copy karein**.

---

## STEP 5: SHA-1 Ko Firebase Mein Add Karein

1. Firebase Console → Project Settings
2. **"Your apps"** section mein Android app pe click karein
3. Neeche **"SHA certificate fingerprints"** section mein jaayein
4. **"Add fingerprint"** button click karein
5. SHA-1 hash paste karein
6. Save karein

---

## STEP 6: Updated google-services.json Download Karein

1. Firebase Console mein hi, Android app settings mein
2. **"Download google-services.json"** button click karein
3. Downloaded file ko copy karein:
   ```bash
   copy Downloads\google-services.json E:\account-android-app\AccountApp\android\app\google-services.json
   ```
   (Replace karein purani file ko)

---

## STEP 7: Backend Server Start Karein

Ek terminal window open karein:

```bash
cd E:\account-android-app\backend
npm run dev
```

**Check karein:** "Server is running on port 5000" dikhna chahiye.

---

## STEP 8: Metro Bundler Start Karein

Dusri terminal window open karein:

```bash
cd E:\account-android-app\AccountApp
npx react-native start
```

---

## STEP 9: Android App Build + Run Karein

Teesri terminal window open karein:

**Option A: Emulator use kar rahe hain:**
```bash
cd E:\account-android-app\AccountApp
npx react-native run-android
```

**Option B: Physical device use kar rahe hain:**
1. USB Debugging enable karein phone mein
2. USB se connect karein
3. Command run karein:
   ```bash
   npx react-native run-android
   ```

---

## STEP 10: Testing

### Test Flow:

1. **Login Screen** dikhegi
   - Username/Password fields honge
   - "Continue with Google" button hoga

2. **Google Sign-In Test:**
   - "Continue with Google" click karein
   - Google account select karein
   - **Setup Screen** khulegi

3. **Setup Screen Test:**
   - Username type karein (e.g., "john_doe")
   - Real-time check hoga ✓ Available / ✗ Taken
   - Agar taken, suggestions dikhenge
   - Password enter karein
   - Confirm password enter karein
   - "Complete Setup" click karein
   - **Home Screen** khulega

4. **Home Screen:**
   - User profile dikhe
   - Balance dikhe (₹0)
   - Logout button kaam kare

5. **Username/Password Login Test:**
   - Logout karein
   - Login screen pe username/password enter karein
   - Login kare
   - Home screen khule

---

## Troubleshooting

### Agar Firebase error aaye:
- Check karein google-services.json sahi location pe hai
- SHA-1 certificate Firebase mein add hai
- Web Client ID sahi hai `firebase.js` mein

### Agar Backend se connect nahi ho raha:
- Backend server chal raha hai? (port 5000)
- **Emulator use kar rahe hain?** `http://10.0.2.2:5000` (already set hai)
- **Physical device use kar rahe hain?**
  - File: `AccountApp/src/services/api.js`
  - Line 4: Change karein `http://10.0.2.2:5000` → `http://YOUR_COMPUTER_IP:5000`
  - Computer IP kaise nikaalein: `ipconfig` (Windows) ya `ifconfig` (Mac/Linux)

### Agar packages ki error aaye:
```bash
cd AccountApp
rm -rf node_modules
npm install
cd android
./gradlew clean
cd ..
npx react-native run-android
```

---

## Next Features (Future):

- ✅ Authentication ✓
- ✅ Username/Password Login ✓
- ✅ Google Sign-In ✓
- ✅ SQLite Local Database ✓
- ⏳ Google Drive Backup
- ⏳ Money Transfer Between Users
- ⏳ Transaction History

---

**All the best! 🚀**

Koi issue aaye to batayein!
