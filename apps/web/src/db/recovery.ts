export async function withDatabaseRecovery<T>(operation: () => Promise<T>, reset: () => void): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    reset();
    return operation();
  }
}
