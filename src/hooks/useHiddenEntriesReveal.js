import {useCallback, useEffect, useMemo, useState} from 'react';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const buildRevealState = (totalCount, initialVisibleCount, revealedCount) => {
  const visibleCount = clamp(
    initialVisibleCount + revealedCount,
    0,
    totalCount
  );
  const visibleStartIndex = Math.max(0, totalCount - visibleCount);
  const hiddenCount = Math.max(0, totalCount - visibleCount);
  return {visibleCount, visibleStartIndex, hiddenCount};
};

const useHiddenEntriesReveal = ({
  totalCount,
  initialVisibleCount = 30,
  revealStep = 20,
  resetKey,
}) => {
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    setRevealedCount(0);
  }, [resetKey]);

  const {visibleCount, visibleStartIndex, hiddenCount} = useMemo(
    () =>
      buildRevealState(totalCount, initialVisibleCount, revealedCount),
    [initialVisibleCount, revealedCount, totalCount]
  );

  const canReveal = hiddenCount > 0;

  const revealMore = useCallback(() => {
    if (!canReveal) {
      return;
    }
    const maxReveal = Math.max(0, totalCount - initialVisibleCount);
    setRevealedCount(prev => clamp(prev + revealStep, 0, maxReveal));
  }, [canReveal, initialVisibleCount, revealStep, totalCount]);

  return {
    visibleCount,
    visibleStartIndex,
    hiddenCount,
    canReveal,
    revealMore,
    revealedCount,
  };
};

export default useHiddenEntriesReveal;
