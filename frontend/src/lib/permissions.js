export function hasAny(session, permissions) {
  const available = new Set(session?.permissions || []);
  return permissions.some((permission) => available.has(permission));
}
