import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import {zip, unzip} from 'react-native-zip-archive';
import {open} from 'react-native-quick-sqlite';
import {
  deleteAppDataFile,
  downloadAppDataFile,
  ensureDriveScopes,
  listAppDataFiles,
  uploadAppDataFile,
} from './driveService';
import {
  BACKUP_RESTORE_PENDING_KEY,
  POST_LOGIN_REQUIRED_ROUTE_KEY,
} from './startupCoordinator';
import {
  reinitializeCoreDatabasesAfterRestore,
  resetCoreDatabaseConnections,
} from './dbLifecycleManager';
import {runPostRestoreRepair} from './postRestoreRepairService';
import {getBackupProfileGateState} from '../utils/profileSetupGate';
import {readCachedSessionUser, writeCachedSessionUser} from './sessionService';
import {publishAccountsChanged} from './accountsChangeBus';
import {publishBackupRestored} from './backupRestoreEvents';

const DB_FILE_BASES = ['accountsDB.db', 'ledgerDB.db', 'accountApp.db', 'chatDB.db'];
const BACKUP_DIR = `${RNFS.CachesDirectoryPath}/backup_tmp`;
const ARCHIVE_NAME_PREFIX = 'backup_';
export const BACKUP_VERSION_OPTIONS = [1, 2, 3];
export const DEFAULT_BACKUP_VERSION_COUNT = 2;
export const BACKUP_VERSION_COUNT_KEY = 'backup.versionCount';
const DEFAULT_ONLY_ACCOUNT_LIMIT = 4;
const BACKUP_META_KEY = 'backup.meta';
const RECEIPTS_DIR_NAME = 'receipts';
const CHAT_DB_NAME = 'chatDB.db';
const CHAT_BACKUP_DIAG = '[CHAT_BACKUP_DIAG]';

const EXCLUDED_ASYNC_KEYS = new Set([
  'firebaseToken',
  'firebaseUid',
  'user',
  'backup.fileId',
  'backup.lastSuccessAt',
  'backup.accountEmail',
  'backup.enabled',
  'home.notificationPermissionPrompt.v1',
  BACKUP_META_KEY,
]);

const PROTECTED_ASYNC_KEYS = new Set([
  'firebaseToken',
  'firebaseUid',
  'user',
  'backup.fileId',
  'backup.lastSuccessAt',
  'backup.accountEmail',
  'backup.enabled',
  BACKUP_RESTORE_PENDING_KEY,
  POST_LOGIN_REQUIRED_ROUTE_KEY,
  BACKUP_META_KEY,
]);

const assertBackupAccessOrThrow = async () => {
  const gate = await getBackupProfileGateState();
  if (gate.ready) {
    return;
  }
  throw new Error(gate.message || 'Complete profile setup to use backup and restore');
};

const safeUnlink = async path => {
  try {
    const exists = await RNFS.exists(path);
    if (exists) {
      await RNFS.unlink(path);
    }
  } catch (error) {
    // Ignore cleanup errors
  }
};

const ensureDir = async path => {
  const exists = await RNFS.exists(path);
  if (!exists) {
    await RNFS.mkdir(path);
  }
};

const safeJsonParse = (raw, fallback = {}) => {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const getDbPath = dbName => `${RNFS.DocumentDirectoryPath}/${dbName}`;

const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getVersionedArchiveName = firebaseUid =>
  `${ARCHIVE_NAME_PREFIX}${firebaseUid || 'unknown'}_${Date.now()}.zip`;

const getLegacyArchiveName = firebaseUid =>
  `${ARCHIVE_NAME_PREFIX}${firebaseUid || 'unknown'}.zip`;

const parseBackupCreatedAt = file => {
  const match = String(file?.name || '').match(/_(\d+)\.zip$/);
  if (match) {
    return Number(match[1]) || 0;
  }
  return new Date(file?.modifiedTime || 0).getTime() || 0;
};

const sortBackupFilesNewestFirst = files =>
  (files || [])
    .slice()
    .sort((a, b) => parseBackupCreatedAt(b) - parseBackupCreatedAt(a));

const normalizeBackupVersionCount = value => {
  const numeric = Number(value);
  if (BACKUP_VERSION_OPTIONS.includes(numeric)) {
    return numeric;
  }
  return DEFAULT_BACKUP_VERSION_COUNT;
};

export const getBackupVersionCount = async () => {
  const stored = await AsyncStorage.getItem(BACKUP_VERSION_COUNT_KEY);
  return normalizeBackupVersionCount(stored);
};

export const setBackupVersionCount = async count => {
  const normalized = normalizeBackupVersionCount(count);
  await AsyncStorage.setItem(BACKUP_VERSION_COUNT_KEY, String(normalized));
  const saved = await getBackupVersionCount();
  if (saved !== normalized) {
    throw new Error('backup_version_count_save_failed');
  }
  return saved;
};

const getBackupFilesForUser = async firebaseUid => {
  const normalizedUid = String(firebaseUid || '').trim();
  if (!normalizedUid) {
    return [];
  }
  const files = await listAppDataFiles();
  const uidPattern = escapeRegExp(normalizedUid);
  const namePattern = new RegExp(
    `^${escapeRegExp(ARCHIVE_NAME_PREFIX)}${uidPattern}(?:_\\d+)?\\.zip$`,
  );
  return sortBackupFilesNewestFirst(
    files.filter(file => namePattern.test(String(file?.name || ''))),
  );
};

const getTableCount = (dbName, tableName) => {
  let db = null;
  try {
    db = open({name: dbName});
    const result = db.execute(`SELECT COUNT(*) as total FROM ${tableName}`);
    return Number(result.rows?._array?.[0]?.total || 0);
  } catch {
    return 0;
  } finally {
    if (db) db.close();
  }
};

const collectBackupDataCounts = () => ({
  accounts: getTableCount('accountsDB.db', 'accounts'),
  transactions: getTableCount('accountsDB.db', 'transactions'),
  recurringSchedules: getTableCount('accountsDB.db', 'recurring_schedules'),
  ledgerTransactions: getTableCount('ledgerDB.db', 'ledger_transactions'),
  ledgerContacts: getTableCount('ledgerDB.db', 'contact_names'),
  chatMessages: getTableCount('chatDB.db', 'messages'),
  chatConversations: getTableCount('chatDB.db', 'conversations'),
  localUsers: getTableCount('accountApp.db', 'user_data'),
});

const assertSnapshotSafeForBackup = ({source, counts}) => {
  if (source !== 'auto') {
    return;
  }
  const realActivityCount =
    Number(counts?.transactions || 0) +
    Number(counts?.recurringSchedules || 0) +
    Number(counts?.ledgerTransactions || 0) +
    Number(counts?.ledgerContacts || 0) +
    Number(counts?.chatMessages || 0) +
    Number(counts?.chatConversations || 0);
  const accountCount = Number(counts?.accounts || 0);
  const isEmptyOrDefaultOnly =
    accountCount <= DEFAULT_ONLY_ACCOUNT_LIMIT && realActivityCount === 0;
  if (isEmptyOrDefaultOnly) {
    throw new Error('backup_empty_snapshot_blocked');
  }
};

const getDbPathFromPragma = dbName => {
  let db = null;
  try {
    db = open({name: dbName});
    const result = db.execute('PRAGMA database_list');
    const rows = result.rows?._array || [];
    const mainRow = rows.find(row => row.name === 'main');
    if (mainRow?.file) {
      return mainRow.file;
    }
  } catch (error) {
    console.warn(`Backup path lookup failed for ${dbName}:`, error);
  } finally {
    if (db) db.close();
  }
  return null;
};

const checkpointDatabase = dbName => {
  let db = null;
  try {
    db = open({name: dbName});
    db.execute('PRAGMA wal_checkpoint(FULL);');
  } catch (error) {
    console.warn(`Backup checkpoint skipped for ${dbName}:`, error);
  } finally {
    if (db) db.close();
  }
};

const logFileSize = async label => {
  try {
    const stats = await RNFS.stat(label);
    console.log('Backup file size:', label, stats.size);
  } catch (error) {
    // Ignore stat errors
  }
};

const locateDbPath = async dbName => {
  const pragmaPath = getDbPathFromPragma(dbName);
  if (pragmaPath && (await RNFS.exists(pragmaPath))) {
    return pragmaPath;
  }
  const primary = getDbPath(dbName);
  if (await RNFS.exists(primary)) {
    return primary;
  }
  const fallback = `${RNFS.LibraryDirectoryPath}/${dbName}`;
  if (await RNFS.exists(fallback)) {
    return fallback;
  }
  return primary;
};

const locateRestoreTarget = async dbName => {
  const pragmaPath = getDbPathFromPragma(dbName);
  if (pragmaPath) {
    return pragmaPath;
  }
  return getDbPath(dbName);
};

const collectAsyncStorageSnapshot = async () => {
  const keys = await AsyncStorage.getAllKeys();
  const filtered = keys.filter(key => !EXCLUDED_ASYNC_KEYS.has(key));
  if (filtered.length === 0) {
    return {};
  }
  const entries = await AsyncStorage.multiGet(filtered);
  return entries.reduce((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
};


const readManifestFromRestoreDir = async dataDir => {
  const manifestPath = `${dataDir}/manifest.json`;
  if (!(await RNFS.exists(manifestPath))) {
    throw new Error('restore_manifest_missing');
  }
  const rawManifest = await RNFS.readFile(manifestPath, 'utf8');
  const manifest = safeJsonParse(rawManifest, null);
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('restore_manifest_invalid');
  }
  if (Number(manifest.backupVersion || 0) < 1) {
    throw new Error('restore_manifest_version_invalid');
  }
  return manifest;
};

const validateRestoreManifest = async manifest => {
  const activeFirebaseUid = String(
    (await AsyncStorage.getItem('firebaseUid')) || '',
  ).trim();
  const backupFirebaseUid = String(manifest?.firebaseUid || '').trim();

  if (activeFirebaseUid && backupFirebaseUid && activeFirebaseUid !== backupFirebaseUid) {
    throw new Error('restore_wrong_account_blocked');
  }

  return {
    activeFirebaseUid,
    backupFirebaseUid,
  };
};

const restoreAsyncStorageSnapshot = async payload => {
  const normalizedPayload =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : {};

  const preservedPairs = await AsyncStorage.multiGet(
    Array.from(PROTECTED_ASYNC_KEYS),
  );
  const currentKeys = await AsyncStorage.getAllKeys();
  const removableKeys = currentKeys.filter(key => !PROTECTED_ASYNC_KEYS.has(key));

  if (removableKeys.length > 0) {
    await AsyncStorage.multiRemove(removableKeys);
  }

  const restoreEntries = Object.entries(normalizedPayload)
    .filter(([key, value]) => !PROTECTED_ASYNC_KEYS.has(key) && value != null)
    .map(([key, value]) => [key, String(value)]);

  if (restoreEntries.length > 0) {
    await AsyncStorage.multiSet(restoreEntries);
  }

  const preservedEntries = preservedPairs.filter(([, value]) => value != null);
  if (preservedEntries.length > 0) {
    await AsyncStorage.multiSet(preservedEntries);
  }
};

const writeSnapshotFiles = async ({firebaseUid, includeReceipts = true, source = 'manual'}) => {
  await safeUnlink(BACKUP_DIR);
  await ensureDir(BACKUP_DIR);

  const dataDir = `${BACKUP_DIR}/data`;
  await ensureDir(dataDir);

  const dbFiles = [];
  logChatDbStats('pre_backup_scan');
  for (const dbName of DB_FILE_BASES) {
    checkpointDatabase(dbName);
    const sourcePath = await locateDbPath(dbName);
    console.log('📦 [BACKUP] Checking DB:', dbName);
    console.log('📦 [BACKUP] Source path:', sourcePath);

    const sourceExists = await RNFS.exists(sourcePath);
    if (dbName === CHAT_DB_NAME) {
      console.log(`${CHAT_BACKUP_DIAG} source_path=${sourcePath}`);
      console.log(`${CHAT_BACKUP_DIAG} source_exists=${sourceExists}`);
    }
    console.log('📦 [BACKUP] File exists?', sourceExists);

    const target = `${dataDir}/${dbName}`;
    if (sourceExists) {
      await RNFS.copyFile(sourcePath, target);
      if (dbName === CHAT_DB_NAME) {
        let copiedSize = -1;
        try {
          const stats = await RNFS.stat(target);
          copiedSize = Number(stats?.size || 0);
        } catch {
          // Ignore stat error for diagnostics.
        }
        console.log(`${CHAT_BACKUP_DIAG} backup_copy_ok=true copied_size=${copiedSize}`);
      }
      dbFiles.push(dbName);
      console.log('✅ [BACKUP] Copied successfully:', dbName);
      await logFileSize(target);
      if (dbName === CHAT_DB_NAME) {
        const targetExists = await RNFS.exists(target);
        let targetSize = -1;
        try {
          const stats = await RNFS.stat(target);
          targetSize = Number(stats?.size || 0);
        } catch {
          // Ignore stat error for diagnostics.
        }
        console.log(`${CHAT_BACKUP_DIAG} copied=true target_exists=${targetExists} size=${targetSize}`);
      }
    } else {
      console.log('❌ [BACKUP] File not found, skipping:', dbName);
      if (dbName === CHAT_DB_NAME) {
        console.log(`${CHAT_BACKUP_DIAG} copied=false reason=source_missing`);
      }
    }
    const walName = `${dbName}-wal`;
    const shmName = `${dbName}-shm`;
    const walSource = await locateDbPath(walName);
    const shmSource = await locateDbPath(shmName);
    if (await RNFS.exists(walSource)) {
      await RNFS.copyFile(walSource, `${dataDir}/${walName}`);
      dbFiles.push(walName);
      await logFileSize(`${dataDir}/${walName}`);
    }
    if (await RNFS.exists(shmSource)) {
      await RNFS.copyFile(shmSource, `${dataDir}/${shmName}`);
      dbFiles.push(shmName);
      await logFileSize(`${dataDir}/${shmName}`);
    }
  }

  const asyncData = await collectAsyncStorageSnapshot();
  await RNFS.writeFile(
    `${dataDir}/asyncStorage.json`,
    JSON.stringify(asyncData),
    'utf8',
  );

  let receiptFiles = [];
  if (includeReceipts) {
    const receiptsSource = `${RNFS.DocumentDirectoryPath}/${RECEIPTS_DIR_NAME}`;
    if (await RNFS.exists(receiptsSource)) {
      const receiptsTarget = `${dataDir}/${RECEIPTS_DIR_NAME}`;
      await ensureDir(receiptsTarget);
      const files = await RNFS.readDir(receiptsSource);
      for (const file of files) {
        if (file.isFile()) {
          const target = `${receiptsTarget}/${file.name}`;
          await RNFS.copyFile(file.path, target);
          receiptFiles.push(file.name);
        }
      }
    }
  }

  const dataCounts = collectBackupDataCounts();
  assertSnapshotSafeForBackup({source, counts: dataCounts});

  const manifest = {
    backupVersion: 1,
    createdAt: Date.now(),
    firebaseUid: firebaseUid || null,
    dbFiles,
    receiptFiles,
    dataCounts,
    source,
  };

  console.log('📦 [BACKUP] Total files added to backup:', dbFiles.length);
  console.log('📦 [BACKUP] Files list:', dbFiles);
  console.log(`${CHAT_BACKUP_DIAG} manifest_has_chatdb=${dbFiles.includes(CHAT_DB_NAME)}`);

  await RNFS.writeFile(
    `${dataDir}/manifest.json`,
    JSON.stringify(manifest),
    'utf8',
  );

  return {dataDir, manifest};
};

export const createBackupArchive = async ({firebaseUid, includeReceipts, source}) => {
  const {dataDir, manifest} = await writeSnapshotFiles({
    firebaseUid,
    includeReceipts,
    source,
  });
  const archiveName = getVersionedArchiveName(firebaseUid);
  const archivePath = `${BACKUP_DIR}/${archiveName}`;
  await safeUnlink(archivePath);
  await zip(dataDir, archivePath);
  await logFileSize(archivePath);
  console.log(
    `${CHAT_BACKUP_DIAG} archive_created chatdb_in_manifest=${manifest.dbFiles?.includes(CHAT_DB_NAME)}`,
  );
  return {archivePath, archiveName, manifest};
};

export const performBackup = async ({
  firebaseUid,
  accountEmail,
  includeReceipts,
  onProgress,
  source = 'manual',
}) => {
  await assertBackupAccessOrThrow();
  console.log('📦 [BACKUP] ===== Starting Backup =====');
  console.log('📦 [BACKUP] firebaseUid:', firebaseUid);
  console.log('📦 [BACKUP] accountEmail:', accountEmail);

  const {archivePath, archiveName, manifest} = await createBackupArchive({
    firebaseUid,
    includeReceipts,
    source,
  });

  console.log('📦 [BACKUP] Archive created:', archiveName);
  console.log('📦 [BACKUP] Archive path:', archivePath);

  const uploadResult = await uploadAppDataFile({
    filePath: archivePath,
    fileName: archiveName,
    existingFileId: null,
    onProgress,
  });

  console.log('✅ [BACKUP] Upload successful! Result:', uploadResult);

  await AsyncStorage.setItem('backup.fileId', uploadResult.id || '');
  await AsyncStorage.setItem('backup.lastSuccessAt', String(Date.now()));
  if (accountEmail) {
    await AsyncStorage.setItem('backup.accountEmail', accountEmail);
  }
  await AsyncStorage.setItem(BACKUP_META_KEY, JSON.stringify(manifest));
  await pruneOldBackups(firebaseUid, uploadResult.id);

  console.log('📦 [BACKUP] ===== Backup Complete =====');
  return uploadResult;
};

const pruneOldBackups = async (firebaseUid, latestFileId) => {
  const keepLimit = await getBackupVersionCount();
  const files = await getBackupFilesForUser(firebaseUid);
  const keep = new Set(
    files.slice(0, keepLimit).map(file => String(file.id || '')),
  );
  if (latestFileId) {
    keep.add(String(latestFileId));
  }
  const stale = files.filter(file => !keep.has(String(file.id || '')));
  for (const file of stale) {
    try {
      await deleteAppDataFile(file.id);
    } catch (error) {
      console.warn('Failed to prune old backup:', file?.name, error);
    }
  }
};

const resolveManualBackupParams = async ({accountEmail, includeReceipts} = {}) => {
  const firebaseUid = await AsyncStorage.getItem('firebaseUid');
  const resolvedEmail =
    accountEmail || (await AsyncStorage.getItem('backup.accountEmail'));
  let resolvedIncludeReceipts = includeReceipts;
  if (typeof resolvedIncludeReceipts !== 'boolean') {
    const include = await AsyncStorage.getItem('backup.includeReceipts');
    resolvedIncludeReceipts = include !== 'false';
  }
  return {
    firebaseUid,
    accountEmail: resolvedEmail,
    includeReceipts: resolvedIncludeReceipts,
  };
};

const logChatDbStats = stage => {
  let db = null;
  try {
    db = open({name: CHAT_DB_NAME});
    const tableCheck = db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='messages'",
    );
    const hasMessagesTable = Boolean(tableCheck.rows?._array?.length);
    if (!hasMessagesTable) {
      console.log(`${CHAT_BACKUP_DIAG} ${stage} messages_table=false`);
      return;
    }
    const messageCountResult = db.execute('SELECT COUNT(*) as total FROM messages');
    const convCountResult = db.execute('SELECT COUNT(*) as total FROM conversations');
    const messageCount = Number(messageCountResult.rows?._array?.[0]?.total || 0);
    const conversationCount = Number(convCountResult.rows?._array?.[0]?.total || 0);
    console.log(
      `${CHAT_BACKUP_DIAG} ${stage} messages=${messageCount} conversations=${conversationCount}`,
    );
  } catch (error) {
    console.log(
      `${CHAT_BACKUP_DIAG} ${stage} stats_error=${error?.message || String(error)}`,
    );
  } finally {
    if (db) db.close();
  }
};

export const runManualBackupNow = async ({accountEmail, includeReceipts} = {}) => {
  await assertBackupAccessOrThrow();
  await ensureDriveScopes();
  const payload = await resolveManualBackupParams({
    accountEmail,
    includeReceipts,
  });
  await performBackup({...payload, source: 'manual'});
  await AsyncStorage.setItem('backup.lastSuccessAt', String(Date.now()));
  return payload;
};

export const getLatestBackupForCurrentUser = async () => {
  await assertBackupAccessOrThrow();
  await ensureDriveScopes();
  const firebaseUid = await AsyncStorage.getItem('firebaseUid');
  const latest = await findLatestBackupFile(firebaseUid);
  return {firebaseUid, latest};
};

export const getRecentBackupsForCurrentUser = async () => {
  await assertBackupAccessOrThrow();
  await ensureDriveScopes();
  const firebaseUid = await AsyncStorage.getItem('firebaseUid');
  const versionCount = await getBackupVersionCount();
  const backups = (await getBackupFilesForUser(firebaseUid)).slice(0, versionCount);
  return {firebaseUid, backups, versionCount};
};

export const restoreBackupByIdFlow = async ({fileId}) => {
  await assertBackupAccessOrThrow();
  await ensureDriveScopes();
  await restoreFromBackup({fileId});
  return true;
};

export const findLatestBackupFile = async firebaseUid => {
  console.log('🔍 [BACKUP] ===== Searching for Backup =====');
  console.log('🔍 [BACKUP] firebaseUid:', firebaseUid);
  console.log('🔍 [BACKUP] Expected filename:', getLegacyArchiveName(firebaseUid));
  const normalizedUid = String(firebaseUid || '').trim();
  if (!normalizedUid) {
    console.log('❌ [BACKUP] Missing firebaseUid, skipping restore discovery');
    return null;
  }

  const candidates = await getBackupFilesForUser(normalizedUid);
  console.log('🔍 [BACKUP] Candidate files count:', candidates.length);
  console.log('🔍 [BACKUP] Candidate files:', JSON.stringify(candidates, null, 2));
  if (candidates.length === 0) {
    console.log('❌ [BACKUP] No backup file found for active firebaseUid');
    return null;
  }

  const latest = candidates[0];

  console.log('✅ [BACKUP] Latest backup selected:', JSON.stringify(latest, null, 2));
  console.log('🔍 [BACKUP] ===== Search Complete =====');
  return latest;
};

export const restoreFromBackup = async ({fileId}) => {
  await assertBackupAccessOrThrow();
  console.log('🔄 [RESTORE] ===== Starting Restore =====');
  console.log('🔄 [RESTORE] fileId:', fileId);

  await safeUnlink(BACKUP_DIR);
  await ensureDir(BACKUP_DIR);

  const preRestoreReset = resetCoreDatabaseConnections();
  console.log('🔄 [RESTORE] Pre-restore DB reset:', preRestoreReset);

  const archivePath = `${BACKUP_DIR}/restore.zip`;
  console.log('🔄 [RESTORE] Downloading to:', archivePath);

  try {
    await downloadAppDataFile(fileId, archivePath);
    console.log('✅ [RESTORE] Download successful');
  } catch (error) {
    console.error('❌ [RESTORE] Download failed:', error);
    console.error('❌ [RESTORE] Error details:', error.message);
    throw error;
  }

  const restoreDir = `${BACKUP_DIR}/restore`;
  await safeUnlink(restoreDir);
  await ensureDir(restoreDir);

  console.log('🔄 [RESTORE] Unzipping archive...');
  try {
    await unzip(archivePath, restoreDir);
    console.log('✅ [RESTORE] Unzip successful');
  } catch (error) {
    console.error('❌ [RESTORE] Unzip failed:', error);
    throw error;
  }

  // Debug: List all files in restore directory
  console.log('🔍 [RESTORE] Checking extracted contents...');
  const restoreDirContents = await RNFS.readDir(restoreDir);
  console.log('🔍 [RESTORE] Root files/folders:', restoreDirContents.map(f => f.name));

  // Check if files are in 'data' subfolder or directly in root
  let dataDir = `${restoreDir}/data`;
  const dataDirExists = await RNFS.exists(dataDir);

  if (!dataDirExists) {
    console.log('🔍 [RESTORE] Data folder not found, using root directory');
    dataDir = restoreDir;  // Use root directory instead
  }

  console.log('🔄 [RESTORE] Using directory:', dataDir);
  const finalContents = await RNFS.readDir(dataDir);
  const restoredFileNames = finalContents.map(f => String(f.name || ''));
  const manifest = await readManifestFromRestoreDir(dataDir);
  const manifestCheck = await validateRestoreManifest(manifest);
  console.log('🔄 [RESTORE] Manifest validation:', manifestCheck);
  console.log(`${CHAT_BACKUP_DIAG} restore_zip_has_chatdb=${restoredFileNames.includes(CHAT_DB_NAME)}`);
  console.log('🔍 [RESTORE] Files to restore:', finalContents.map(f => f.name));

  for (const dbName of DB_FILE_BASES) {
    const source = `${dataDir}/${dbName}`;
    const target = await locateRestoreTarget(dbName);
    console.log(`🔄 [RESTORE] Restoring ${dbName} from ${source} to ${target}`);
    const sourceExists = await RNFS.exists(source);
    if (dbName === CHAT_DB_NAME) {
      console.log(`${CHAT_BACKUP_DIAG} restore_source_exists=${sourceExists}`);
      console.log(`${CHAT_BACKUP_DIAG} restore_target_path=${target}`);
    }
    if (sourceExists) {
      await RNFS.copyFile(source, target);
      if (dbName === CHAT_DB_NAME) {
        let restoredSize = -1;
        try {
          const stats = await RNFS.stat(target);
          restoredSize = Number(stats?.size || 0);
        } catch {
          // Ignore stat error for diagnostics.
        }
        console.log(`${CHAT_BACKUP_DIAG} restore_copy_ok=true restored_size=${restoredSize}`);
      }
      console.log(`✅ [RESTORE] ${dbName} restored successfully`);
    } else {
      console.log(`⚠️ [RESTORE] ${dbName} not found in backup`);
      if (dbName === CHAT_DB_NAME) {
        console.log(`${CHAT_BACKUP_DIAG} restore_copy_ok=false reason=missing_in_zip`);
      }
    }
    const walName = `${dbName}-wal`;
    const shmName = `${dbName}-shm`;
    const walSource = `${dataDir}/${walName}`;
    const shmSource = `${dataDir}/${shmName}`;
    if (await RNFS.exists(walSource)) {
      await RNFS.copyFile(walSource, await locateRestoreTarget(walName));
    } else {
      await safeUnlink(await locateRestoreTarget(walName));
    }
    if (await RNFS.exists(shmSource)) {
      await RNFS.copyFile(shmSource, await locateRestoreTarget(shmName));
    } else {
      await safeUnlink(await locateRestoreTarget(shmName));
    }
  }

  const asyncPath = `${dataDir}/asyncStorage.json`;
  if (await RNFS.exists(asyncPath)) {
    const raw = await RNFS.readFile(asyncPath, 'utf8');
    const payload = safeJsonParse(raw || '{}', {});
    await restoreAsyncStorageSnapshot(payload);
  }

  const receiptsSource = `${dataDir}/${RECEIPTS_DIR_NAME}`;
  if (await RNFS.exists(receiptsSource)) {
    const receiptsTarget = `${RNFS.DocumentDirectoryPath}/${RECEIPTS_DIR_NAME}`;
    await ensureDir(receiptsTarget);
    const receiptFiles = await RNFS.readDir(receiptsSource);
    for (const file of receiptFiles) {
      if (file.isFile()) {
        const target = `${receiptsTarget}/${file.name}`;
        await RNFS.copyFile(file.path, target);
      }
    }
  }

  if (fileId) {
    await AsyncStorage.setItem('backup.fileId', String(fileId));
  }
  await AsyncStorage.setItem(BACKUP_META_KEY, JSON.stringify(manifest));

  // Restore may bring stale derived caches and outdated contact mappings.
  // Rehydrate with fresh resolution before user starts messaging.
  const dbReinit = reinitializeCoreDatabasesAfterRestore();
  console.log('🔄 [RESTORE] DB reinitialize result:', dbReinit);
  const repairResult = await runPostRestoreRepair();
  console.log('🔧 [RESTORE] Post-repair result:', repairResult);
  logChatDbStats('post_restore_reopen');

  if (!dbReinit.ok) {
    throw new Error('restore_db_reinitialize_failed');
  }

  publishAccountsChanged({
    reason: 'backup-restored',
    source: 'backup-restore',
    changeTypes: [
      'accounts-restored',
      'transactions-restored',
      'preferences-restored',
    ],
  });
  publishBackupRestored({source: 'backup-restore'});

  console.log('✅ [RESTORE] ===== Restore Complete =====');
  return true;
};

export const deleteBackup = async fileId => {
  await deleteAppDataFile(fileId);
  await AsyncStorage.removeItem('backup.fileId');
  return true;
};

