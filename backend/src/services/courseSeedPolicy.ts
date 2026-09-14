/**
 * Constellation 101 is maintained from the checked-in curriculum and may be
 * refreshed after its first install. Every other course becomes editor-owned
 * once it exists so a seed cannot erase later additions such as video links.
 */
export const RESEEDABLE_COURSE_SLUG = "constellation-101";

export function shouldSeedCourse(slug: string, alreadyExists: boolean): boolean {
  return !alreadyExists || slug === RESEEDABLE_COURSE_SLUG;
}
