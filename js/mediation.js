// ===== AI Mediation Module =====

import { functions } from './firebase-config.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-functions.js';

/**
 * Generate SHA-256 hash for tamper-proof audit trail
 * Uses Web Crypto API (SubtleCrypto)
 */
export async function generateHash(content, timestamp) {
  const data = content + '|' + timestamp;
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(buffer));
  return 'sha256:' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Request full AI mediation for an issue
 * Calls Cloud Function that reads all messages, generates summary + compromise options
 * Returns: { summary, sharedPriorities, agreements, compromiseOptions[] }
 */
export async function requestMediation(issueId) {
  const aiMediate = httpsCallable(functions, 'aiMediate');
  const result = await aiMediate({ issueId });
  return result.data;
}

/**
 * Get a neutral AI reframe of user's text (preview before submission)
 * Returns: { reframedText }
 */
export async function generateNeutralReframe(text) {
  const aiReframe = httpsCallable(functions, 'aiReframe');
  const result = await aiReframe({ text });
  return result.data;
}

/**
 * Verify a message hash to confirm it hasn't been tampered with
 */
export async function verifyHash(content, timestamp, expectedHash) {
  const computed = await generateHash(content, timestamp);
  return computed === expectedHash;
}

/**
 * Generate a full audit hash for an entire issue (all messages)
 */
export async function generateIssueAuditHash(messages) {
  const combined = messages
    .map(m => `${m.type}|${m.authorId}|${m.content}|${m.hash}`)
    .join('\n');
  return generateHash(combined, new Date().toISOString());
}
