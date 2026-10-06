'use strict';

const DEFAULT_ALLOWED_DOMAINS = ['@rishihood.edu.in', '@nst.rishihood.edu.in'];

function isUrgentPriority(priority) {
  const p = String(priority || '').trim().toLowerCase();
  return p === 'urgent' || p === 'high';
}

function filterApprovedAcademicMail(items, configuredSenders, { requireUrgent = false } = {}) {
  const configuredList = String(configuredSenders || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /^([a-z0-9._%+-]+)?@[a-z0-9.-]+\.[a-z]{2,}$/.test(entry));

  const allowed = new Set(
    configuredList.length > 0 ? configuredList : DEFAULT_ALLOWED_DOMAINS,
  );

  if (!Array.isArray(items)) return [];
  return items.filter((item) => {
    // 1. Sender validation
    const address = String(item?.sender || '')
      .match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]
      ?.toLowerCase();
    if (!address) return false;
    const domain = address.slice(address.indexOf('@'));
    if (!allowed.has(address) && !allowed.has(domain)) return false;

    // 2. Priority validation: reject nonurgent items
    if (item?.priority !== undefined && item?.priority !== null && item?.priority !== '') {
      if (!isUrgentPriority(item.priority)) return false;
    } else if (requireUrgent) {
      return false;
    }

    return true;
  });
}

function sanitizeStagedAcademicMail(snapshot, configuredSenders, nextRevision) {
  const currentEmails = snapshot?.academic?.emails;
  const emails = filterApprovedAcademicMail(currentEmails, configuredSenders, {
    requireUrgent: true,
  });
  if (Array.isArray(currentEmails) && emails.length === currentEmails.length) {
    return snapshot;
  }
  return {
    ...snapshot,
    revision: nextRevision,
    publishedAt: new Date().toISOString(),
    academic: { ...snapshot.academic, emails },
  };
}

module.exports = {
  filterApprovedAcademicMail,
  sanitizeStagedAcademicMail,
  DEFAULT_ALLOWED_DOMAINS,
  isUrgentPriority,
};
