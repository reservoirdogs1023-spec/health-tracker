// Caching wrapper around any backend with the {list, upsert, remove} contract.
// Memoizes list(table) so repeated reads in one render cycle hit the network once.
// Any write to a table invalidates that table's cache.
function createCachingBackend(inner) {
  const cache = {}; // table -> Promise<row[]>

  const list = (table) => {
    if (!cache[table]) {
      cache[table] = inner.list(table).catch(e => { delete cache[table]; throw e; });
    }
    return cache[table];
  };

  const upsert = async (table, row, onConflict) => {
    const r = await inner.upsert(table, row, onConflict);
    delete cache[table];
    return r;
  };

  const remove = async (table, match) => {
    await inner.remove(table, match);
    delete cache[table];
  };

  return { list, upsert, remove };
}

if (typeof window !== 'undefined') window.createCachingBackend = createCachingBackend;
