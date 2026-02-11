export type DbContext = {
  userId: string;
  wardId: string;
};

type Queryable = {
  query: (text: string, values?: readonly unknown[]) => Promise<unknown>;
};

export async function setDbContext(client: Queryable, context: DbContext): Promise<void> {
  await client.query('SELECT set_config($1, $2, true)', ['app.user_id', context.userId]);
  await client.query('SELECT set_config($1, $2, true)', ['app.ward_id', context.wardId]);
}
