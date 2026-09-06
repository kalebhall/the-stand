export async function getSafeSession<T>(loadSession: () => Promise<T>): Promise<T | null> {
  try {
    return await loadSession();
  } catch {
    return null;
  }
}
