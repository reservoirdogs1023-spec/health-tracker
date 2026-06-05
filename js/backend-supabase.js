// Real backend backed by supabase-js. Same contract as MemoryBackend.
// `supabaseClient` is a client created via supabase.createClient(url, anonKey).
function createSupabaseBackend(supabaseClient) {
  const list = async (table) => {
    const { data, error } = await supabaseClient.from(table).select('*');
    if (error) throw new Error(error.message);
    return data || [];
  };

  const upsert = async (table, row, onConflict) => {
    const { data, error } = await supabaseClient
      .from(table)
      .upsert(row, { onConflict })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  };

  const remove = async (table, match) => {
    let q = supabaseClient.from(table).delete();
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
    const { error } = await q;
    if (error) throw new Error(error.message);
  };

  return { list, upsert, remove };
}

if (typeof window !== 'undefined') window.createSupabaseBackend = createSupabaseBackend;
