'use strict';

function filterApprovedAcademicMail(items, configuredSenders) {
  const allowed = new Set(
    String(configuredSenders || '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => /^([a-z0-9._%+-]+)?@[a-z0-9.-]+\.[a-z]{2,}$/.test(entry)),
  );
  if (!allowed.size || !Array.isArray(items)) return [];
  return items.filter((item) => {
    const address = String(item?.sender || '')
      .match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]
      ?.toLowerCase();
    if (!address) return false;
    const domain = address.slice(address.indexOf('@'));
    return allowed.has(address) || allowed.has(domain);
  });
}

function sanitizeStagedAcademicMail(snapshot, configuredSenders, nextRevision) {
  const emails = filterApprovedAcademicMail(snapshot.academic.emails, configuredSenders);
  if (emails.length === snapshot.academic.emails.length) return snapshot;
  return {
    ...snapshot,
    revision: nextRevision,
    publishedAt: new Date().toISOString(),
    academic: { ...snapshot.academic, emails },
  };
}

module.exports = { filterApprovedAcademicMail, sanitizeStagedAcademicMail };
