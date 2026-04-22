// ===== Authentication Module =====

import { auth, db } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';
import {
  doc, setDoc, getDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';

/**
 * Create a new user account + Firestore profile
 */
export async function signUp(email, password, firstName, lastName, role) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);

  await updateProfile(cred.user, {
    displayName: `${firstName} ${lastName}`
  });

  await setDoc(doc(db, 'users', cred.user.uid), {
    firstName,
    lastName,
    email,
    role,
    coParentId: null,
    coParentEmail: null,
    children: [],
    plan: 'free',
    flexibilityScore: 50,
    issuesSubmitted: 0,
    issuesResolved: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return cred.user;
}

/**
 * Sign in with email/password
 */
export async function logIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

/**
 * Sign out and redirect to login
 */
export async function logOut() {
  await signOut(auth);
  window.location.href = '/pages/login.html';
}

/**
 * Listen for auth state changes
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get current user (null if not logged in)
 */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Get user's Firestore profile
 */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Send password reset email
 */
export async function sendPasswordReset(email) {
  await sendPasswordResetEmail(auth, email);
}

/**
 * Require auth — redirect to login if not signed in.
 * Returns a promise that resolves with the user.
 */
export function requireAuth() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (!user) {
        window.location.href = '/pages/login.html';
      } else {
        resolve(user);
      }
    });
  });
}

/**
 * Redirect if already logged in (for login/signup pages)
 */
export function redirectIfLoggedIn() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (user) {
        window.location.href = '/pages/dashboard.html';
      } else {
        resolve();
      }
    });
  });
}

/**
 * Friendly error messages for Firebase auth errors
 */
export function getAuthErrorMessage(errorCode) {
  const messages = {
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password must be at least 8 characters.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password. Try again or reset it.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/invalid-credential': 'Invalid email or password.',
  };
  return messages[errorCode] || 'Something went wrong. Please try again.';
}
