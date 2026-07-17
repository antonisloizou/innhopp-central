type SequencedInnhopp = {
  sequence?: number | null;
};

export const getInnhoppSequenceCount = (innhopps?: SequencedInnhopp[] | null): number =>
  (innhopps ?? []).reduce((maxSequence, innhopp) => {
    const sequence = innhopp.sequence;
    return typeof sequence === 'number' && Number.isFinite(sequence) && sequence > maxSequence
      ? sequence
      : maxSequence;
  }, 0);
