import {DeviceEventEmitter} from 'react-native';
import {open} from 'react-native-quick-sqlite';
import {createTransaction} from './transactionsDatabase';
import {queueBackupFromStorage} from '../utils/backupQueue';
import {executeScheduledAction} from './scheduledActionExecutor';
import {cancelNativeAlarm, scheduleNativeAlarm} from './scheduledAlarmService';
import {notificationService} from './NotificationService';

const DB_NAME = 'accountsDB.db';
let db = null;

const MAX_CATCHUP_RUNS = 180;
export const SCHEDULE_EXECUTED_EVENT = 'schedule:executed';

export const SCHEDULE_REPEAT_TYPE = {
  ONCE: 'once',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
};

const LEGACY_REPEAT_TYPE_MAP = {
  once: SCHEDULE_REPEAT_TYPE.ONCE,
  daily: SCHEDULE_REPEAT_TYPE.DAILY,
  weekly: SCHEDULE_REPEAT_TYPE.WEEKLY,
  '2weeks': SCHEDULE_REPEAT_TYPE.WEEKLY,
  monthly: SCHEDULE_REPEAT_TYPE.MONTHLY,
  '2months': SCHEDULE_REPEAT_TYPE.MONTHLY,
  '3months': SCHEDULE_REPEAT_TYPE.MONTHLY,
  '6months': SCHEDULE_REPEAT_TYPE.MONTHLY,
};

const getDB = () => {
  if (db) return db;
  try {
    db = open({name: DB_NAME});
    return db;
  } catch (error) {
    console.error('Failed to open database:', error);
    throw error;
  }
};

const readRows = result => {
  if (!result?.rows) {
    return [];
  }
  if (result.rows._array) {
    return result.rows._array;
  }
  const rows = [];
  for (let index = 0; index < result.rows.length; index += 1) {
    rows.push(result.rows.item(index));
  }
  return rows;
};

const normalizeRepeatType = value => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return LEGACY_REPEAT_TYPE_MAP[normalized] || SCHEDULE_REPEAT_TYPE.ONCE;
};

const normalizeTimestamp = (value, fallback = Date.now()) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeActionType = value => {
  const normalized = String(value || 'add')
    .trim()
    .toLowerCase();
  if (
    normalized === 'add' ||
    normalized === 'withdraw' ||
    normalized === 'transfer' ||
    normalized === 'request'
  ) {
    return normalized;
  }
  return 'add';
};

const parseJsonObject = value => {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
};

const normalizeTransactionPlan = value => {
  const plan = Array.isArray(value) ? value : [];
  return plan
    .map(entry => ({
      accountId: Number(entry?.accountId),
      amount: Number(entry?.amount),
      remark: String(entry?.remark || ''),
      imageUri: String(entry?.imageUri || ''),
    }))
    .filter(
      entry => Number.isFinite(entry.accountId) && Number.isFinite(entry.amount),
    );
};

const normalizeActionPayload = value => {
  const payload = parseJsonObject(value);
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : null;
};

const copyTimeParts = (target, source) => {
  target.setHours(
    source.getHours(),
    source.getMinutes(),
    source.getSeconds(),
    source.getMilliseconds(),
  );
  return target;
};

const addMonthsClamped = (timestamp, monthDelta) => {
  const source = new Date(timestamp);
  const next = new Date(timestamp);
  const dayOfMonth = source.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + monthDelta);
  const lastDay = new Date(
    next.getFullYear(),
    next.getMonth() + 1,
    0,
  ).getDate();
  next.setDate(Math.min(dayOfMonth, lastDay));
  return copyTimeParts(next, source).getTime();
};

const calculateNextExecutionFromTimestamp = (timestamp, repeatType) => {
  switch (normalizeRepeatType(repeatType)) {
    case SCHEDULE_REPEAT_TYPE.DAILY:
      return timestamp + 24 * 60 * 60 * 1000;
    case SCHEDULE_REPEAT_TYPE.WEEKLY:
      return timestamp + 7 * 24 * 60 * 60 * 1000;
    case SCHEDULE_REPEAT_TYPE.MONTHLY:
      return addMonthsClamped(timestamp, 1);
    default:
      return timestamp;
  }
};

const getDayNumber = dayName => {
  const days = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return days[String(dayName || '').toLowerCase()] ?? 0;
};

const calculateLegacyStartAt = (
  scheduleType,
  scheduleDay,
  scheduleDate,
  baseTimestamp = Date.now(),
) => {
  const base = new Date(baseTimestamp);
  const nextDate = new Date(baseTimestamp);

  switch (String(scheduleType || '').toLowerCase()) {
    case 'daily':
      return base.getTime();
    case 'weekly': {
      const targetDay = getDayNumber(scheduleDay);
      const currentDay = base.getDay();
      let daysUntilNext = (targetDay - currentDay + 7) % 7;
      if (daysUntilNext === 0) {
        daysUntilNext = 7;
      }
      nextDate.setDate(base.getDate() + daysUntilNext);
      return nextDate.getTime();
    }
    case '2weeks': {
      const targetDay = getDayNumber(scheduleDay);
      const currentDay = base.getDay();
      let daysUntilNext = (targetDay - currentDay + 7) % 7;
      if (daysUntilNext === 0) {
        daysUntilNext = 7;
      }
      nextDate.setDate(base.getDate() + daysUntilNext + 7);
      return nextDate.getTime();
    }
    case 'monthly':
    case '2months':
    case '3months':
    case '6months':
      nextDate.setDate(Number(scheduleDate) || 1);
      if (nextDate.getTime() <= base.getTime()) {
        nextDate.setMonth(nextDate.getMonth() + 1);
      }
      return nextDate.getTime();
    default:
      return base.getTime();
  }
};

const normalizeScheduleRow = row => {
  const repeatType = normalizeRepeatType(row?.repeat_type || row?.schedule_type);
  const startAt = normalizeTimestamp(
    row?.start_at,
    normalizeTimestamp(
      row?.next_execution,
      calculateLegacyStartAt(
        row?.schedule_type,
        row?.schedule_day,
        row?.schedule_date,
        row?.created_at,
      ),
    ),
  );
  return {
    ...row,
    action_type: normalizeActionType(row?.action_type),
    target_account_id:
      row?.target_account_id == null ? null : Number(row.target_account_id),
    action_payload: normalizeActionPayload(row?.action_payload_json),
    transaction_plan: normalizeTransactionPlan(
      parseJsonObject(row?.transaction_plan_json),
    ),
    repeat_type: repeatType,
    start_at: startAt,
    next_execution: normalizeTimestamp(row?.next_execution, startAt),
    last_execution: Number(row?.last_execution) || null,
    is_active: Number(row?.is_active) === 0 ? 0 : 1,
  };
};

const scheduleExactAlarmForRow = async schedule => {
  const normalizedSchedule = normalizeScheduleRow(schedule);
  if (normalizedSchedule.is_active !== 1) {
    await cancelNativeAlarm(normalizedSchedule.id);
    return false;
  }
  return scheduleNativeAlarm(
    normalizedSchedule.id,
    normalizedSchedule.next_execution,
  );
};

const cancelExactAlarmForId = async scheduleId => cancelNativeAlarm(scheduleId);

const getScheduleAffectedAccountIds = schedule => {
  const accountIds = [Number(schedule?.account_id)];
  const targetAccountId = Number(schedule?.target_account_id);
  if (Number.isInteger(targetAccountId) && targetAccountId > 0) {
    accountIds.push(targetAccountId);
  }
  return [...new Set(accountIds.filter(id => Number.isInteger(id) && id > 0))];
};

const buildScheduleNotificationMessage = (schedule, processedEntries) => {
  const amountValue = Math.abs(Number(schedule?.amount) || 0).toLocaleString(
    'en-IN',
  );
  if (processedEntries > 1) {
    return `Scheduled entry completed ${processedEntries} times.`;
  }
  switch (String(schedule?.action_type || 'add').toLowerCase()) {
    case 'withdraw':
      return `Scheduled withdraw of ${amountValue} completed.`;
    case 'transfer':
      return `Scheduled transfer of ${amountValue} completed.`;
    case 'request':
      return `Scheduled request of ${amountValue} completed.`;
    case 'add':
    default:
      return `Scheduled entry of ${amountValue} completed.`;
  }
};

const notifyScheduleExecution = async (schedule, processedEntries, executedAt) => {
  DeviceEventEmitter.emit(SCHEDULE_EXECUTED_EVENT, {
    scheduleId: Number(schedule?.id),
    accountId: Number(schedule?.account_id),
    actionType: String(schedule?.action_type || 'add'),
    affectedAccountIds: getScheduleAffectedAccountIds(schedule),
    processedEntries: Number(processedEntries) || 0,
    executedAt: Number(executedAt) || Date.now(),
  });
  try {
    await notificationService.showLocalNotification(
      'Scheduled entry completed',
      buildScheduleNotificationMessage(schedule, processedEntries),
    );
  } catch (error) {
    console.error('Failed to show scheduled entry notification:', error);
  }
};

const processSingleSchedule = async (db, schedule, runAt) => {
  const now = normalizeTimestamp(runAt, Date.now());
  let nextExecution = normalizeTimestamp(schedule.next_execution, schedule.start_at);
  let lastExecution = schedule.last_execution;
  let catchupRuns = 0;

  while (nextExecution <= now && catchupRuns < MAX_CATCHUP_RUNS) {
    let executed = false;
    if (schedule.action_payload) {
      executed = await executeScheduledAction(
        schedule,
        schedule.action_payload,
        nextExecution,
        schedule.id,
      );
    } else {
      const transactionPlan =
        schedule.transaction_plan.length > 0
          ? schedule.transaction_plan
          : [
              {
                accountId: Number(schedule.account_id),
                amount:
                  schedule.action_type === 'withdraw'
                    ? -Math.abs(Number(schedule.amount) || 0)
                    : Number(schedule.amount) || 0,
                remark: String(schedule.remark || ''),
                imageUri: '',
              },
            ];

      for (const transaction of transactionPlan) {
        try {
          await createTransaction(
            transaction.accountId,
            transaction.amount,
            transaction.remark,
            nextExecution,
            transaction.imageUri || null,
            null,
            {sourceScheduleId: schedule.id},
          );
        } catch (error) {
          if (error?.code === 'CREDIT_LIMIT_EXCEEDED') {
            return {processedEntries: 0, schedule: normalizeScheduleRow(schedule)};
          }
          throw error;
        }
      }
      executed = true;
    }

    if (!executed) {
      return {processedEntries: 0, schedule: normalizeScheduleRow(schedule)};
    }

    lastExecution = nextExecution;
    catchupRuns += 1;

    if (schedule.repeat_type === SCHEDULE_REPEAT_TYPE.ONCE) {
      break;
    }

    nextExecution = calculateNextExecutionFromTimestamp(
      nextExecution,
      schedule.repeat_type,
    );
  }

  if (!catchupRuns) {
    return {processedEntries: 0, schedule: normalizeScheduleRow(schedule)};
  }

  let updatedRow;
  if (schedule.repeat_type === SCHEDULE_REPEAT_TYPE.ONCE) {
    db.execute(
      `UPDATE recurring_schedules
       SET is_active = 0, last_execution = ?, next_execution = ?, updated_at = ?
       WHERE id = ?`,
      [lastExecution, lastExecution, now, schedule.id],
    );
    updatedRow = {
      ...schedule,
      is_active: 0,
      last_execution: lastExecution,
      next_execution: lastExecution,
      updated_at: now,
    };
  } else {
    db.execute(
      `UPDATE recurring_schedules
       SET last_execution = ?, next_execution = ?, updated_at = ?
       WHERE id = ?`,
      [lastExecution, nextExecution, now, schedule.id],
    );
    updatedRow = {
      ...schedule,
      last_execution: lastExecution,
      next_execution: nextExecution,
      updated_at: now,
    };
  }

  return {
    processedEntries: catchupRuns,
    schedule: normalizeScheduleRow(updatedRow),
    executedAt: lastExecution,
  };
};

export const initRecurringDatabase = () => {
  try {
    const db = getDB();

    db.execute(`
      CREATE TABLE IF NOT EXISTS recurring_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        remark TEXT,
        schedule_type TEXT NOT NULL,
        schedule_day TEXT,
        schedule_date INTEGER,
        repeat_type TEXT,
        action_type TEXT,
        target_account_id INTEGER,
        action_payload_json TEXT,
        transaction_plan_json TEXT,
        start_at INTEGER,
        next_execution INTEGER NOT NULL,
        last_execution INTEGER,
        is_active INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        FOREIGN KEY (account_id) REFERENCES accounts (id)
      );
    `);

    try {
      db.execute('ALTER TABLE recurring_schedules ADD COLUMN repeat_type TEXT');
    } catch (error) {
      // Column already exists.
    }
    try {
      db.execute('ALTER TABLE recurring_schedules ADD COLUMN action_type TEXT');
    } catch (error) {
      // Column already exists.
    }
    try {
      db.execute('ALTER TABLE recurring_schedules ADD COLUMN target_account_id INTEGER');
    } catch (error) {
      // Column already exists.
    }
    try {
      db.execute('ALTER TABLE recurring_schedules ADD COLUMN action_payload_json TEXT');
    } catch (error) {
      // Column already exists.
    }
    try {
      db.execute('ALTER TABLE recurring_schedules ADD COLUMN transaction_plan_json TEXT');
    } catch (error) {
      // Column already exists.
    }
    try {
      db.execute('ALTER TABLE recurring_schedules ADD COLUMN start_at INTEGER');
    } catch (error) {
      // Column already exists.
    }
    try {
      db.execute('ALTER TABLE recurring_schedules ADD COLUMN last_execution INTEGER');
    } catch (error) {
      // Column already exists.
    }
    try {
      db.execute('ALTER TABLE recurring_schedules ADD COLUMN updated_at INTEGER');
    } catch (error) {
      // Column already exists.
    }

    try {
      db.execute(`
        UPDATE recurring_schedules
        SET repeat_type = CASE
          WHEN LOWER(TRIM(COALESCE(schedule_type, ''))) = 'daily' THEN 'daily'
          WHEN LOWER(TRIM(COALESCE(schedule_type, ''))) IN ('weekly', '2weeks') THEN 'weekly'
          WHEN LOWER(TRIM(COALESCE(schedule_type, ''))) IN ('monthly', '2months', '3months', '6months') THEN 'monthly'
          ELSE 'once'
        END
        WHERE repeat_type IS NULL OR TRIM(repeat_type) = ''
      `);
    } catch (error) {
      // Ignore backfill errors.
    }
    try {
      db.execute(`
        UPDATE recurring_schedules
        SET start_at = COALESCE(start_at, next_execution, created_at)
        WHERE start_at IS NULL OR start_at <= 0
      `);
    } catch (error) {
      // Ignore backfill errors.
    }
    try {
      db.execute(`
        UPDATE recurring_schedules
        SET action_type = COALESCE(NULLIF(TRIM(action_type), ''), 'add')
        WHERE action_type IS NULL OR TRIM(action_type) = ''
      `);
    } catch (error) {
      // Ignore backfill errors.
    }
    try {
      db.execute(`
        UPDATE recurring_schedules
        SET updated_at = COALESCE(updated_at, created_at)
        WHERE updated_at IS NULL OR updated_at <= 0
      `);
    } catch (error) {
      // Ignore backfill errors.
    }

    db.execute(
      'CREATE INDEX IF NOT EXISTS idx_recurring_schedules_due ON recurring_schedules (is_active, next_execution)',
    );

    console.log('Recurring schedules database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize recurring database:', error);
    throw error;
  }
};

export const resetRecurringDatabaseConnection = () => {
  if (!db) {
    return;
  }
  try {
    db.close?.();
  } catch (error) {
    console.warn('Failed to close recurring database handle:', error);
  } finally {
    db = null;
  }
};

export const createScheduledEntry = async ({
  accountId,
  amount,
  remark = '',
  repeatType = SCHEDULE_REPEAT_TYPE.ONCE,
  actionType = 'add',
  targetAccountId = null,
  actionPayload = null,
  transactionPlan = null,
  startAt = Date.now(),
}) => {
  try {
    initRecurringDatabase();
    const db = getDB();
    const timestamp = Date.now();
    const normalizedRepeatType = normalizeRepeatType(repeatType);
    const normalizedActionType = normalizeActionType(actionType);
    const normalizedStartAt = normalizeTimestamp(startAt, timestamp);
    const normalizedTargetAccountId =
      targetAccountId == null ? null : Number(targetAccountId);
    const normalizedActionPayload =
      actionPayload && typeof actionPayload === 'object' && !Array.isArray(actionPayload)
        ? JSON.stringify(actionPayload)
        : null;
    const normalizedTransactionPlan = normalizeTransactionPlan(transactionPlan);
    const transactionPlanJson =
      normalizedTransactionPlan.length > 0
        ? JSON.stringify(normalizedTransactionPlan)
        : null;

    const result = db.execute(
      `INSERT INTO recurring_schedules
       (account_id, amount, remark, schedule_type, schedule_day, schedule_date, repeat_type, action_type, target_account_id, action_payload_json, transaction_plan_json, start_at, next_execution, last_execution, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)`,
      [
        accountId,
        amount,
        remark || '',
        normalizedRepeatType,
        normalizedRepeatType,
        normalizedActionType,
        normalizedTargetAccountId,
        normalizedActionPayload,
        transactionPlanJson,
        normalizedStartAt,
        normalizedStartAt,
        timestamp,
        timestamp,
      ],
    );

    queueBackupFromStorage();
    await scheduleNativeAlarm(result.insertId, normalizedStartAt);
    return {success: true, insertId: result.insertId};
  } catch (error) {
    console.error('Failed to create scheduled entry:', error);
    throw error;
  }
};

export const createRecurringSchedule = async (
  accountId,
  amount,
  remark,
  scheduleType,
  scheduleDay = null,
  scheduleDate = null,
) => {
  return createScheduledEntry({
    accountId,
    amount,
    remark,
    actionType: 'add',
    repeatType: normalizeRepeatType(scheduleType),
    startAt: calculateLegacyStartAt(
      scheduleType,
      scheduleDay,
      scheduleDate,
      Date.now(),
    ),
  });
};

export const getActiveRecurringSchedules = accountId => {
  try {
    initRecurringDatabase();
    const db = getDB();
    const result = db.execute(
      'SELECT * FROM recurring_schedules WHERE account_id = ? AND is_active = 1 ORDER BY next_execution ASC, created_at DESC',
      [accountId],
    );

    return readRows(result).map(normalizeScheduleRow);
  } catch (error) {
    console.error('Failed to get recurring schedules:', error);
    return [];
  }
};

export const getAllActiveRecurringSchedules = () => {
  try {
    initRecurringDatabase();
    const db = getDB();
    const result = db.execute(
      'SELECT * FROM recurring_schedules WHERE is_active = 1 ORDER BY next_execution ASC, created_at DESC',
    );
    return readRows(result).map(normalizeScheduleRow);
  } catch (error) {
    console.error('Failed to get all recurring schedules:', error);
    return [];
  }
};

export const getScheduledEntryById = scheduleId => {
  try {
    initRecurringDatabase();
    const db = getDB();
    const result = db.execute(
      'SELECT * FROM recurring_schedules WHERE id = ? LIMIT 1',
      [scheduleId],
    );
    const rows = readRows(result);
    return rows.length > 0 ? normalizeScheduleRow(rows[0]) : null;
  } catch (error) {
    console.error('Failed to get scheduled entry by id:', error);
    return null;
  }
};

export const syncAllScheduledAlarms = async () => {
  const schedules = getAllActiveRecurringSchedules();
  for (const schedule of schedules) {
    await scheduleExactAlarmForRow(schedule);
  }
  return schedules.length;
};

export const processDueSchedules = async (runAt = Date.now()) => {
  try {
    const db = getDB();
    const now = normalizeTimestamp(runAt, Date.now());

    const schedules = readRows(
      db.execute(
        'SELECT * FROM recurring_schedules WHERE is_active = 1 AND next_execution <= ? ORDER BY next_execution ASC',
        [now],
      ),
    ).map(normalizeScheduleRow);

    let processedEntries = 0;

    for (const schedule of schedules) {
      const result = await processSingleSchedule(db, schedule, now);
      processedEntries += result.processedEntries;
      if (result.processedEntries > 0) {
        await scheduleExactAlarmForRow(result.schedule);
        await notifyScheduleExecution(
          result.schedule,
          result.processedEntries,
          result.executedAt,
        );
      }
    }

    if (processedEntries > 0) {
      queueBackupFromStorage();
    }
    return processedEntries;
  } catch (error) {
    console.error('Failed to process due schedules:', error);
    return 0;
  }
};

export const processScheduledEntryById = async (
  scheduleId,
  runAt = Date.now(),
) => {
  try {
    const db = getDB();
    const schedule = getScheduledEntryById(scheduleId);
    if (!schedule || schedule.is_active !== 1) {
      await cancelExactAlarmForId(scheduleId);
      return 0;
    }

    const result = await processSingleSchedule(db, schedule, runAt);
    if (result.processedEntries > 0) {
      queueBackupFromStorage();
      await notifyScheduleExecution(
        result.schedule,
        result.processedEntries,
        result.executedAt,
      );
    }
    await scheduleExactAlarmForRow(result.schedule);
    return result.processedEntries;
  } catch (error) {
    console.error('Failed to process scheduled entry by id:', error);
    return 0;
  }
};

export const deactivateSchedule = scheduleId => {
  try {
    const db = getDB();
    db.execute(
      'UPDATE recurring_schedules SET is_active = 0, updated_at = ? WHERE id = ?',
      [Date.now(), scheduleId],
    );
    queueBackupFromStorage();
    cancelExactAlarmForId(scheduleId).catch(error => {
      console.error('Failed to cancel exact alarm during deactivate:', error);
    });
    return {success: true};
  } catch (error) {
    console.error('Failed to deactivate schedule:', error);
    throw error;
  }
};

export const deleteRecurringSchedule = scheduleId => {
  try {
    const db = getDB();
    db.execute('DELETE FROM recurring_schedules WHERE id = ?', [scheduleId]);
    queueBackupFromStorage();
    cancelExactAlarmForId(scheduleId).catch(error => {
      console.error('Failed to cancel exact alarm during delete:', error);
    });
    return {success: true};
  } catch (error) {
    console.error('Failed to delete recurring schedule:', error);
    throw error;
  }
};
