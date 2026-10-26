import 'server-only';

type RpcFn = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ error: unknown }>;

/**
 * Advances round statuses by their schedule (scheduled -> open -> evaluation)
 * before rounds are read or submitted to. Best-effort: a failure here must never
 * break the page; the database still enforces the submission window.
 */
export async function refreshRoundStatuses(client: { rpc: unknown }, hackathonId?: string | null): Promise<void> {
  try {
    const rpc = (client.rpc as RpcFn).bind(client);
    await rpc('refresh_round_statuses', { p_hackathon_id: hackathonId ?? null });
  } catch {
    // ignore: display falls back to the stored status
  }
}
