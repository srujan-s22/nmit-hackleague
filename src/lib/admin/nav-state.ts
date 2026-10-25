import 'server-only';

export interface NavStateClient {
  from: (table: string) => {
    select: (
      columns: string,
      options: { count: 'exact'; head: true }
    ) => { eq: (column: string, value: string) => PromiseLike<{ count: number | null; error: unknown }> };
  };
}

/**
 * Whether the admin has any hackathon assignment (explicit assignment rows or an
 * in-charge designation) — the condition for the "My Assigned Hackathons" menu
 * item. Two cheap head-only count queries under the caller's own session.
 */
export async function adminHasAssignments(client: NavStateClient, adminId: string): Promise<boolean> {
  const [assignments, inCharge] = await Promise.all([
    client.from('hackathon_admin_assignments').select('admin_id', { count: 'exact', head: true }).eq('admin_id', adminId),
    client.from('hackathons').select('id', { count: 'exact', head: true }).eq('in_charge_admin_id', adminId),
  ]);
  return (assignments.count ?? 0) > 0 || (inCharge.count ?? 0) > 0;
}
