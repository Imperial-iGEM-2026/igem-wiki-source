/** Preserve existing reference IDs and their published links. */
export const referenceAnchor = (nodeId: string, entryId: string) =>
  'citation-' + encodeURIComponent(`${nodeId}/${entryId}`);
