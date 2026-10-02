function monthIndex(value, missingMonth) {
  const match = /^(\d{4})(?:-(0[1-9]|1[0-2]))?$/.exec(String(value || ''));
  if (!match) return null;
  return Number(match[1]) * 12 + (match[2] ? Number(match[2]) - 1 : missingMonth);
}

export function experienceOverSixMonths(role, now = new Date()) {
  // A year-only start may be as late as December; a year-only end may be as
  // early as January. Include a role only when the dates confirm seven months.
  const start = monthIndex(role?.startDate, 11);
  const end = role?.currentRole
    ? now.getUTCFullYear() * 12 + now.getUTCMonth()
    : monthIndex(role?.endDate, 0);
  return start !== null && end !== null && end - start + 1 > 6;
}

export function longerExperience(roles, now = new Date()) {
  return Array.isArray(roles) ? roles.filter((role) => experienceOverSixMonths(role, now)) : [];
}
