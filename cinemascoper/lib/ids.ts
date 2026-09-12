let counter = 0;

/** Short, sortable, dependency-free id generator (no uuid package needed). */
export function makeId(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${counter}-${rand}`;
}
