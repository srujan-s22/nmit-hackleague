import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized: login required.' }, { status: 401 });
  }

  const { data: isRegistered, error } = await supabase.rpc('is_push_registered' as never, {
    p_user_id: user.id,
  } as never);

  if (error) {
    return NextResponse.json(
      { error: `Failed to query push status: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    active: Boolean(isRegistered),
  });
}
