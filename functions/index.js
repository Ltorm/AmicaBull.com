const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const Anthropic = require("@anthropic-ai/sdk");

initializeApp();
const db = getFirestore();

// Initialize Claude client — set ANTHROPIC_API_KEY in Firebase config:
// firebase functions:secrets:set ANTHROPIC_API_KEY
const getClient = () => new Anthropic.default();

// =====================================================
// Rate limiting helper
// =====================================================
async function checkRateLimit(userId, maxPerHour = 10) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const snap = await db.collection("rateLimits")
    .where("userId", "==", userId)
    .where("timestamp", ">", oneHourAgo)
    .get();

  if (snap.size >= maxPerHour) {
    throw new HttpsError(
      "resource-exhausted",
      `Rate limit exceeded. Maximum ${maxPerHour} AI requests per hour.`
    );
  }

  await db.collection("rateLimits").add({
    userId,
    timestamp: FieldValue.serverTimestamp()
  });
}

// =====================================================
// AI MEDIATE — Full mediation for an issue
// =====================================================
exports.aiMediate = onCall(
  { secrets: ["ANTHROPIC_API_KEY"], memory: "512MiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in.");
    }

    const { issueId } = request.data;
    if (!issueId) {
      throw new HttpsError("invalid-argument", "issueId is required.");
    }

    const userId = request.auth.uid;
    await checkRateLimit(userId);

    // Get issue and verify access
    const issueRef = db.doc(`issues/${issueId}`);
    const issue = await issueRef.get();

    if (!issue.exists) {
      throw new HttpsError("not-found", "Issue not found.");
    }

    const issueData = issue.data();
    if (issueData.submittedBy !== userId && issueData.coParentId !== userId) {
      throw new HttpsError("permission-denied", "Not your issue.");
    }

    // Get all messages
    const messagesSnap = await db.collection(`issues/${issueId}/messages`)
      .orderBy("timestamp", "asc")
      .get();

    const messages = messagesSnap.docs.map(d => d.data());

    // Build conversation context for AI
    const conversationContext = messages.map(m => {
      const role = m.type === "submission" ? "Parent A (Submitter)"
        : m.type === "response" ? "Parent B (Responder)"
        : m.type === "rebuttal" ? "Parent A (Rebuttal)"
        : "System";

      let text = `[${role}]\n${m.content}`;
      if (m.priorities) {
        text += `\n[Their priorities]: ${m.priorities}`;
      }
      return text;
    }).join("\n\n---\n\n");

    // Call Claude Haiku for mediation
    const client = getClient();
    const aiResponse = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: `You are a neutral, professional family mediator AI for the AmicaBull co-parenting platform. Your role:

1. NEVER take sides. Treat both parents equally.
2. ALWAYS center the child's wellbeing in your analysis.
3. Identify shared priorities and common ground.
4. De-escalate any inflammatory language in your summary.
5. Generate 3 realistic, fair compromise options.
6. Be concise and practical — these are real families making real decisions.

Respond in this exact JSON format:
{
  "summary": "A neutral 2-3 sentence summary of the situation",
  "sharedPriorities": "What both parents agree on",
  "agreements": ["Point of agreement 1", "Point of agreement 2", ...],
  "compromiseOptions": [
    {"label": "Recommended", "description": "The most balanced option"},
    {"label": "Option B", "description": "An alternative approach"},
    {"label": "Option C", "description": "Another alternative"}
  ]
}`,
      messages: [{
        role: "user",
        content: `Issue: "${issueData.title}" (Category: ${issueData.category}, Urgency: ${issueData.urgency})\nChildren involved: ${(issueData.children || []).join(", ")}\n${issueData.deadline ? "Deadline: " + issueData.deadline : ""}\n\n--- PARENT COMMUNICATIONS ---\n\n${conversationContext}\n\n--- END ---\n\nAnalyze both positions and generate a neutral mediation summary with compromise options.`
      }]
    });

    // Parse AI response
    let mediation;
    try {
      const text = aiResponse.content[0].text;
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      mediation = JSON.parse(jsonMatch[0]);
    } catch (e) {
      throw new HttpsError("internal", "Failed to parse AI mediation response.");
    }

    // Store AI summary as a message (only Cloud Functions can create ai_summary type)
    const aiContent = [
      `**Summary:** ${mediation.summary}`,
      `\n**Shared Priorities:** ${mediation.sharedPriorities}`,
      `\n**Key Agreements:**\n${mediation.agreements.map(a => `- ${a}`).join("\n")}`,
      `\n**Compromise Options:**`,
      ...mediation.compromiseOptions.map((opt, i) =>
        `\n${i + 1}. [${opt.label}] ${opt.description}`)
    ].join("\n");

    const now = new Date().toISOString();
    const hashData = aiContent + "|" + now;
    const crypto = require("crypto");
    const hash = "sha256:" + crypto.createHash("sha256").update(hashData).digest("hex");

    await db.collection(`issues/${issueId}/messages`).add({
      type: "ai_summary",
      authorId: "system",
      authorName: "AI Mediator",
      content: aiContent,
      priorities: null,
      timestamp: FieldValue.serverTimestamp(),
      hash,
      mediationData: mediation
    });

    // Update issue status
    await issueRef.update({
      status: "options_ready",
      mediationData: mediation,
      updatedAt: FieldValue.serverTimestamp()
    });

    return mediation;
  }
);

// =====================================================
// AI REFRAME — Neutral reframe of user text
// =====================================================
exports.aiReframe = onCall(
  { secrets: ["ANTHROPIC_API_KEY"], memory: "256MiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in.");
    }

    await checkRateLimit(request.auth.uid);

    const { text } = request.data;
    if (!text || text.length > 5000) {
      throw new HttpsError("invalid-argument", "Text is required (max 5000 chars).");
    }

    const client = getClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: "You are a neutral reframing assistant for a co-parenting platform. Take the user's text and rewrite it in a neutral, non-inflammatory tone that focuses on the child's needs and practical logistics. Remove blame, accusations, and emotional language. Keep the core facts and requests. Respond with ONLY the reframed text, no explanation.",
      messages: [{ role: "user", content: text }]
    });

    return { reframedText: response.content[0].text };
  }
);

// =====================================================
// CALCULATE FLEXIBILITY — Triggered on issue resolution
// =====================================================
exports.calculateFlexibility = onDocumentUpdated(
  "issues/{issueId}",
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    // Only run when issue becomes resolved
    if (before.status === "resolved" || after.status !== "resolved") return;

    const issueId = event.params.issueId;
    const messagesSnap = await db.collection(`issues/${issueId}/messages`)
      .orderBy("timestamp", "asc").get();
    const messages = messagesSnap.docs.map(d => d.data());

    const parentIds = [after.submittedBy, after.coParentId];

    for (const parentId of parentIds) {
      if (!parentId) continue;

      // Scoring factors (out of 100)
      let score = 0;

      // 1. Compromise acceptance (40%): Did they vote for the recommended option?
      const vote = (after.votes || {})[parentId];
      if (vote === 0) score += 40;       // Voted for recommended
      else if (vote !== undefined) score += 25; // Voted for something
      else score += 0;                    // Didn't vote

      // 2. Response time (20%): How quickly did they respond?
      const parentMessages = messages.filter(m => m.authorId === parentId);
      if (parentMessages.length > 0 && messages.length >= 2) {
        const firstMsg = messages[0].timestamp?.toDate?.() || new Date(messages[0].timestamp);
        const parentMsg = parentMessages[parentMessages.length > 1 ? 1 : 0].timestamp?.toDate?.()
          || new Date(parentMessages[0].timestamp);
        const hoursToRespond = (parentMsg - firstMsg) / (1000 * 60 * 60);
        if (hoursToRespond <= 4) score += 20;
        else if (hoursToRespond <= 24) score += 15;
        else if (hoursToRespond <= 72) score += 10;
        else score += 5;
      }

      // 3. Engagement quality (20%): Did they provide priorities and context?
      const hasContent = parentMessages.some(m => m.content && m.content.length > 50);
      const hasPriorities = parentMessages.some(m => m.priorities && m.priorities.length > 10);
      if (hasContent) score += 10;
      if (hasPriorities) score += 10;

      // 4. Follow-through (20%): Did the issue actually resolve?
      if (after.status === "resolved") score += 20;

      // Update user's running flexibility score (weighted average with history)
      const userRef = db.doc(`users/${parentId}`);
      const userSnap = await userRef.get();
      const currentScore = userSnap.data()?.flexibilityScore || 50;
      const newScore = Math.round(currentScore * 0.7 + score * 0.3); // 70% history, 30% new

      await userRef.update({
        flexibilityScore: newScore,
        updatedAt: FieldValue.serverTimestamp()
      });

      // Store in history
      await db.collection(`users/${parentId}/flexibilityHistory`).add({
        issueId,
        score,
        runningScore: newScore,
        breakdown: {
          compromiseAcceptance: vote === 0 ? 40 : (vote !== undefined ? 25 : 0),
          responseTime: score - (hasContent ? 10 : 0) - (hasPriorities ? 10 : 0) - 20 - (vote === 0 ? 40 : (vote !== undefined ? 25 : 0)),
          engagementQuality: (hasContent ? 10 : 0) + (hasPriorities ? 10 : 0),
          followThrough: 20
        },
        timestamp: FieldValue.serverTimestamp()
      });
    }
  }
);
