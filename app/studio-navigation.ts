/** A failed save must leave the editor and its remaining drafts in place. */
export async function preparePageSwitch(
  keep: boolean,
  operations: {
    inlineText: (keep: boolean) => Promise<boolean>;
    textDraft: () => Promise<boolean>;
    layout: () => Promise<boolean>;
  },
): Promise<void> {
  if (!(await operations.inlineText(keep)))
    throw Error('The text could not be saved. Your draft is retained.');
  if (!keep) return;
  if (!(await operations.textDraft()))
    throw Error('The text could not be saved. Your draft is retained.');
  if (!(await operations.layout()))
    throw Error(
      'The layout could not be saved. Resolve any validation or collaboration conflict, then try again.',
    );
}
