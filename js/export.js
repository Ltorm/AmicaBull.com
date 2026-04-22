// ===== Export Module =====

import { getIssue, getIssueMessages } from './database.js';
import { generateIssueAuditHash } from './mediation.js';

/**
 * Export issue as PDF (opens print dialog with formatted HTML)
 */
export async function exportIssuePDF(issueId) {
  const issue = await getIssue(issueId);
  const messages = await getIssueMessages(issueId);
  const auditHash = await generateIssueAuditHash(messages);

  const html = buildExportHTML(issue, messages, auditHash);
  const printWindow = window.open('', '_blank');
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 500);
}

/**
 * Export issue as CSV
 */
export async function exportIssueCSV(issueId) {
  const issue = await getIssue(issueId);
  const messages = await getIssueMessages(issueId);

  const headers = ['Timestamp', 'Type', 'Author', 'Content', 'Priorities', 'Hash'];
  const rows = messages.map(m => [
    formatTimestamp(m.timestamp),
    m.type,
    m.authorName || 'AI Mediator',
    `"${(m.content || '').replace(/"/g, '""')}"`,
    `"${(m.priorities || '').replace(/"/g, '""')}"`,
    m.hash || ''
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadFile(`AmicaBull_Issue_${issueId}.csv`, csv, 'text/csv');
}

/**
 * Export issue as JSON with hash verification
 */
export async function exportIssueJSON(issueId) {
  const issue = await getIssue(issueId);
  const messages = await getIssueMessages(issueId);
  const auditHash = await generateIssueAuditHash(messages);

  const data = {
    exportedAt: new Date().toISOString(),
    platform: 'AmicaBull',
    auditHash,
    issue: {
      id: issue.id,
      title: issue.title,
      category: issue.category,
      status: issue.status,
      urgency: issue.urgency,
      deadline: issue.deadline,
      children: issue.children,
      createdAt: formatTimestamp(issue.createdAt),
      resolvedOption: issue.resolvedOption
    },
    messages: messages.map(m => ({
      type: m.type,
      author: m.authorName || 'AI Mediator',
      authorId: m.authorId || 'system',
      content: m.content,
      priorities: m.priorities || null,
      timestamp: formatTimestamp(m.timestamp),
      hash: m.hash
    })),
    verification: {
      method: 'SHA-256',
      note: 'Each message hash = SHA-256(content + "|" + timestamp). Audit hash covers all message hashes. Any modification will invalidate the chain.'
    }
  };

  const json = JSON.stringify(data, null, 2);
  downloadFile(`AmicaBull_Issue_${issueId}.json`, json, 'application/json');
}

// =====================================================
// Helpers
// =====================================================

function formatTimestamp(ts) {
  if (!ts) return '';
  // Firestore Timestamp object
  if (ts.toDate) return ts.toDate().toISOString();
  // Already a Date or string
  return new Date(ts).toISOString();
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildExportHTML(issue, messages, auditHash) {
  const msgHTML = messages.map(m => `
    <div style="margin-bottom:20px;padding:16px;border:1px solid #e5e5e5;border-radius:8px;${m.type === 'ai_summary' ? 'background:#f0fdf4;border-color:#86efac;' : ''}">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <strong>${escapeHTML(m.authorName || 'AI Mediator')}</strong>
        <span style="color:#666;font-size:13px">${formatTimestamp(m.timestamp)}</span>
      </div>
      <div style="font-size:13px;color:#666;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">
        ${m.type.replace('_', ' ')}
      </div>
      <div style="line-height:1.7">${escapeHTML(m.content || '')}</div>
      ${m.priorities ? `<div style="margin-top:10px;padding:10px;background:#f5f5ff;border-radius:6px;font-size:14px"><strong>Priorities:</strong> ${escapeHTML(m.priorities)}</div>` : ''}
      <div style="margin-top:8px;font-size:11px;color:#999;font-family:monospace">Hash: ${m.hash || 'N/A'}</div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html><head>
  <title>AmicaBull Issue Report — ${escapeHTML(issue.title)}</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1e1b4b; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 24px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #999; }
    @media print { body { padding: 20px; } }
  </style>
</head><body>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
    <h1>${escapeHTML(issue.title)}</h1>
    <span style="padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;background:${issue.status === 'resolved' ? '#dcfce7;color:#16a34a' : '#fef3c7;color:#d97706'}">${issue.status.toUpperCase()}</span>
  </div>
  <div class="meta">
    Category: ${escapeHTML(issue.category)} &bull;
    Urgency: ${escapeHTML(issue.urgency)} &bull;
    Created: ${formatTimestamp(issue.createdAt)}
    ${issue.deadline ? '&bull; Deadline: ' + escapeHTML(issue.deadline) : ''}
  </div>
  <h2 style="font-size:18px;margin-bottom:16px">Communication Log</h2>
  ${msgHTML}
  <div class="footer">
    <p><strong>AmicaBull — Co-Parenting Resolution Platform</strong></p>
    <p>Exported: ${new Date().toISOString()}</p>
    <p style="font-family:monospace">Audit Hash: ${auditHash}</p>
    <p>This document is a verified export. Any modification to the original messages will produce a different audit hash, indicating tampering.</p>
  </div>
</body></html>`;
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
