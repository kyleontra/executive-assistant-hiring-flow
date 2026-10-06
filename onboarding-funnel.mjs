export function onboardingFunnel(rows, { now = Date.now(), idleHours = 48, since = null } = {}) {
  const cohort = rows.filter(row => !since || Date.parse(row.steps.find(step => step.id === 'account')?.completedAt) >= since);
  const steps = cohort[0]?.steps || rows[0]?.steps || [];
  return { total: cohort.length, steps: steps.map(({ id, label }) => {
    let reached = 0, completed = 0, active = 0, stalled = 0, waiting = 0;
    for (const row of cohort) {
      const step = row.steps.find(item => item.id === id);
      if (!step || (!step.firstSeenAt && !(id === 'review' && row.currentStage === 'waiting') && !['complete','skipped','needs_update','started'].includes(step.status))) continue;
      reached++;
      if (['complete','skipped'].includes(step.status)) { completed++; continue; }
      if (id === 'review' && step.status !== 'needs_update') { waiting++; continue; }
      // Candidates who finished onboarding cannot have churned on an optional guide.
      if (row.currentStage === 'complete') { active++; continue; }
      const lastActivity = Date.parse(row.lastActivityAt);
      if (Number.isFinite(lastActivity) && now - lastActivity >= idleHours * 3600000) stalled++;
      else active++;
    }
    return { id, label, reached, completed, active, stalled, waiting, churn: reached ? stalled / reached : null, conversion: reached ? completed / reached : null };
  }) };
}
