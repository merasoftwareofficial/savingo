import {
  processDueSchedules,
  processScheduledEntryById,
  syncAllScheduledAlarms,
} from './recurringDatabase';
import {ensureBackgroundScheduleDatabasesReady} from './dbLifecycleManager';

export const SCHEDULE_PROCESSING_TASK = 'ScheduleProcessingTask';

let activeProcessingPromise = null;

const normalizeRunAt = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
};

const runProcessing = async taskData => {
  if (activeProcessingPromise) {
    return activeProcessingPromise;
  }

  activeProcessingPromise = (async () => {
    try {
      ensureBackgroundScheduleDatabasesReady();
      const runAt = normalizeRunAt(taskData?.runAt);
      const scheduleId = Number(taskData?.scheduleId);
      if (Number.isInteger(scheduleId) && scheduleId > 0) {
        return await processScheduledEntryById(scheduleId, runAt);
      }
      if (taskData?.restoreAll) {
        await processDueSchedules(runAt);
        return await syncAllScheduledAlarms();
      }
      return await processDueSchedules(runAt);
    } finally {
      activeProcessingPromise = null;
    }
  })();

  return activeProcessingPromise;
};

export const runScheduledProcessingTask = async taskData =>
  runProcessing(taskData);
