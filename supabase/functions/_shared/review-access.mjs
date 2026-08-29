export function reviewSubmissionVisible(status = '') {
  return status === 'pending' || status === 'verified';
}

export function reviewSubmissionAcceptable(status = '') {
  return status === 'pending';
}
