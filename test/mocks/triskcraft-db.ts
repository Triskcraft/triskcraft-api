export function createPrismaClient() {
  return { $disconnect: () => Promise.resolve() };
}
