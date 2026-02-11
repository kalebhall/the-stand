export type DbContext = {
  userId: string;
  wardId: string;
};

type Queryable = {
  query: (text: string, values?: readonly unknown[]) => Promise<unknown>;
};

function requireWardContext(wardId: string): string {
  const normalizedWardId = wardId.trim();
  if (normalizedWardId.length === 0) {
    throw new Error('Ward context is required before executing ward-scoped queries.');
  }

  return normalizedWardId;
}

export async function setDbContext(client: Queryable, context: DbContext): Promise<void> {
  await client.query('SELECT set_config($1, $2, true)', ['app.user_id', context.userId]);
  await client.query('SELECT set_config($1, $2, true)', ['app.ward_id', requireWardContext(context.wardId)]);
}

export { requireWardContext };
