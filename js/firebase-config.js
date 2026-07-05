// ===== Firebase Configuration =====
// Uses Firebase v11+ modular SDK via importmap (see HTML script tags)

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { getFunctions, connectFunctionsEmulator } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-functions.js';

// =====================================================
// REPLACE WITH YOUR FIREBASE CONFIG from Firebase Console:
// Project Settings > General > Your apps > Web app
// =====================================================
const firebaseConfig = {
  apiKey: "AIzaSyCmHVCQNwVRnfPxSTjY8NouPxJptygOjCU",
  authDomain: "amicabull-ec499.firebaseapp.com",
  projectId: "amicabull-ec499",
  storageBucket: "amicabull-ec499.firebasestorage.app",
  messagingSenderId: "516537981821",
  appId: "1:516537981821:web:0deb1c0a8eb542e130ca14",
  measurementId: "G-STM3MS013Y"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// Uncomment for local development with emulators:
// connectAuthEmulator(auth, 'http://localhost:9099');
// connectFirestoreEmulator(db, 'localhost', 8080);
// connectFunctionsEmulator(functions, 'localhost', 5001);

export { app, auth, db, functions };
