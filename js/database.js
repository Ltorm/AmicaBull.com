// ===== Firestore Database Module =====

import { db, functions } from './firebase-config.js';
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, setDoc,
  query, where, orderBy, serverTimestamp, Timestamp, or
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-functions.js';
import { generateHash } from './mediation.js';

// =====================================================
// ISSUES
// =====================================================

/**
 * Create a new issue
 * Status flow: awaiting_response → rebuttal_open → ai_review → options_ready → resolved|unresolved|escalated
 */
export async function createIssue(userId, userName, coParentId, issueData) {
  const issue = {
    title: issueData.title,
    category: issueData.category,
    context: issueData.context,
    priorities: issueData.priorities,
    urgency: issueData.urgency,
    deadline: issueData.deadline || null,
    children: issueData.children || [],
    submittedBy: userId,
    submitterName: userName,
    coParentId: coParentId,
    status: 'awaiting_response',
    step: 1,
    votes: {},
    resolvedOption: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const issueRef = await addDoc(collection(db, 'issues'), issue);

  // Create the initial submission message
  const contentForHash = issueData.context + issueData.priorities;
  const hash = await generateHash(contentForHash, new Date().toISOString());

  await addDoc(collection(db, 'issues', issueRef.id, 'messages'), {
    type: 'submission',
    authorId: userId,
    authorName: userName,
    content: issueData.context,
    priorities: issueData.priorities,
    timestamp: serverTimestamp(),
    hash
  });

  return issueRef.id;
}

/**
 * Get all issues for a user (as submitter or co-parent)
 */
export async function getIssues(userId) {
  const q = query(
    collection(db, 'issues'),
    or(
      where('submittedBy', '==', userId),
      where('coParentId', '==', userId)
    ),
    orderBy('createdAt', 'desc')
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Get a single issue by ID
 */
export async function getIssue(issueId) {
  const snap = await getDoc(doc(db, 'issues', issueId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Get all messages for an issue, ordered by timestamp
 */
export async function getIssueMessages(issueId) {
  const q = query(
    collection(db, 'issues', issueId, 'messages'),
    orderBy('timestamp', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Submit co-parent's response (step 2)
 */
export async function submitResponse(issueId, userId, userName, responseText, priorities) {
  const hash = await generateHash(responseText + priorities, new Date().toISOString());

  await addDoc(collection(db, 'issues', issueId, 'messages'), {
    type: 'response',
    authorId: userId,
    authorName: userName,
    content: responseText,
    priorities,
    timestamp: serverTimestamp(),
    hash
  });

  await updateDoc(doc(db, 'issues', issueId), {
    status: 'rebuttal_open',
    step: 2,
    updatedAt: serverTimestamp()
  });
}

/**
 * Submit original parent's rebuttal (step 3 — final)
 */
export async function submitRebuttal(issueId, userId, userName, rebuttalText) {
  const hash = await generateHash(rebuttalText, new Date().toISOString());

  await addDoc(collection(db, 'issues', issueId, 'messages'), {
    type: 'rebuttal',
    authorId: userId,
    authorName: userName,
    content: rebuttalText,
    priorities: null,
    timestamp: serverTimestamp(),
    hash
  });

  await updateDoc(doc(db, 'issues', issueId), {
    status: 'ai_review',
    step: 3,
    updatedAt: serverTimestamp()
  });

  return issueId; // Caller should trigger AI mediation
}

/**
 * Record a parent's vote on a compromise option
 */
export async function selectCompromise(issueId, optionIndex, userId) {
  const issueRef = doc(db, 'issues', issueId);
  const issue = await getIssue(issueId);

  const votes = { ...(issue.votes || {}), [userId]: optionIndex };

  // Security rules only allow a parent to write their own vote key,
  // so update the single field rather than replacing the whole map
  const update = {
    [`votes.${userId}`]: optionIndex,
    updatedAt: serverTimestamp()
  };

  // If both parents have voted and agree, resolve the issue
  const voterIds = Object.keys(votes);
  if (voterIds.length === 2) {
    const [v1, v2] = Object.values(votes);
    if (v1 === v2) {
      update.status = 'resolved';
      update.resolvedOption = v1;
    }
  }

  await updateDoc(issueRef, update);
  return update.status === 'resolved';
}

/**
 * Mark issue as unresolved (no compromise accepted)
 */
export async function markUnresolved(issueId) {
  await updateDoc(doc(db, 'issues', issueId), {
    status: 'unresolved',
    updatedAt: serverTimestamp()
  });
}

/**
 * Escalate issue (needs mediator/attorney)
 */
export async function escalateIssue(issueId) {
  await updateDoc(doc(db, 'issues', issueId), {
    status: 'escalated',
    updatedAt: serverTimestamp()
  });
}

// =====================================================
// FLEXIBILITY SCORES
// =====================================================

/**
 * Get a user's flexibility score history
 */
export async function getFlexibilityScores(userId) {
  const q = query(
    collection(db, 'users', userId, 'flexibilityHistory'),
    orderBy('timestamp', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Get current flexibility score for a user
 */
export async function getFlexibilityScore(userId) {
  const profile = await getDoc(doc(db, 'users', userId));
  return profile.exists() ? profile.data().flexibilityScore : 50;
}

// =====================================================
// CO-PARENT MANAGEMENT
// =====================================================

/**
 * Send co-parent invitation
 */
export async function inviteCoParent(inviterId, inviterName, inviteeEmail) {
  const invitation = {
    inviterId,
    inviterName,
    inviteeEmail: inviteeEmail.toLowerCase(),
    status: 'pending',
    createdAt: serverTimestamp()
  };

  const ref = await addDoc(collection(db, 'invitations'), invitation);

  // Update inviter's profile with co-parent email
  await updateDoc(doc(db, 'users', inviterId), {
    coParentEmail: inviteeEmail.toLowerCase(),
    updatedAt: serverTimestamp()
  });

  return ref.id;
}

/**
 * Get pending invitations for an email
 */
export async function getPendingInvitations(email) {
  const q = query(
    collection(db, 'invitations'),
    where('inviteeEmail', '==', email.toLowerCase()),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Get pending invitations sent by a user (to show "waiting" state)
 */
export async function getSentInvitations(userId) {
  const q = query(
    collection(db, 'invitations'),
    where('inviterId', '==', userId),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Accept a co-parent invitation — links both accounts.
 * Done via Cloud Function: clients cannot write each other's user docs
 * or coParentId (security rules), so linking happens server-side.
 */
export async function acceptInvitation(invitationId) {
  const accept = httpsCallable(functions, 'acceptInvitation');
  const result = await accept({ invitationId });
  return result.data;
}

// =====================================================
// CHILDREN
// =====================================================

/**
 * Add a child to user's profile
 */
export async function addChild(userId, childName, childAge) {
  const profile = await getDoc(doc(db, 'users', userId));
  const children = profile.data().children || [];
  children.push({ name: childName, age: childAge, id: crypto.randomUUID() });

  await updateDoc(doc(db, 'users', userId), {
    children,
    updatedAt: serverTimestamp()
  });
}
