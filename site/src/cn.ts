/** The usual class helper: the truthy lists, joined. */
export const cn = (...lists: (string | false | null | undefined)[]) => lists.filter(Boolean).join(' ');
