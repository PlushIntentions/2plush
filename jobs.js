export async function assignJob(jobId, technicianId) {
  return await supabase
    .from('jobs')
    .update({
      technician_id: technicianId,
      status: 'active',
      updated_at: new Date()
    })
    .eq('id', jobId)
    .is('technician_id', null);
}

export async function unassignJob(jobId) {
  return await supabase
    .from('jobs')
    .update({
      technician_id: null,
      status: 'pending',
      updated_at: new Date()
    })
    .eq('id', jobId)
    .not('technician_id', 'is', null);
}
