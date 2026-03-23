const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin SDK
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH 
  ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
  : path.join(__dirname, '../firebaseServiceAccount.json');

try {
  if (!fs.existsSync(serviceAccountPath)) {
    console.warn('\n⚠️  Firebase Service Account file not found!');
    console.warn(`Expected at: ${serviceAccountPath}`);
    console.warn('\n📋 To fix this:');
    console.warn('1. Go to Firebase Console → Project Settings → Service Accounts');
    console.warn('2. Click "Generate New Private Key"');
    console.warn('3. Save the JSON file as "firebaseServiceAccount.json" in the backend folder');
    console.warn('4. Restart the server\n');
    throw new Error(`Service account file not found at ${serviceAccountPath}`);
  }

  const serviceAccount = require(serviceAccountPath);
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  
  console.log('✅ Firebase Admin SDK initialized successfully');
} catch (error) {
  console.warn('\n⚠️  Firebase Admin initialization warning:');
  console.warn(`Error: ${error.message}\n`);
  console.warn('Push notifications will not work without proper Firebase credentials');
  console.warn('See: FIREBASE_SETUP.md for detailed configuration instructions\n');
}

module.exports = admin;
