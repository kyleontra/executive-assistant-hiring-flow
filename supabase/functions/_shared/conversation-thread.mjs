// One conversation per hirer and VA: messages from Contact Now, the Messages page and job
// applications all land in the same thread, however the conversation started.
export async function pairThread(admin, employerId, candidateId) {
  if (!employerId || !candidateId) return null;
  const { data, error } = await admin.from('candidate_message_threads')
    .select('id, edit_token_hash, application_id')
    .eq('employer_id', employerId).eq('candidate_id', candidateId)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}
