import {GoogleSignin} from '@react-native-google-signin/google-signin';
import RNFS from 'react-native-fs';
import RNBlobUtil from 'react-native-blob-util';

const DRIVE_BASE_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
];
let interactiveScopePromise = null;

const getAccessToken = async () => {
  const tokens = await GoogleSignin.getTokens();
  return tokens?.accessToken || null;
};

const runEnsureDriveScopesInteractive = async () => {
  const hasPrevious = await GoogleSignin.hasPreviousSignIn();
  if (!hasPrevious) {
    await GoogleSignin.signIn();
  } else {
    try {
      await GoogleSignin.signInSilently();
    } catch (error) {
      await GoogleSignin.signIn();
    }
  }
  await GoogleSignin.addScopes({scopes: DRIVE_SCOPES});
  return GoogleSignin.signInSilently();
};

export const ensureDriveScopesInteractive = async () => {
  if (interactiveScopePromise) {
    return interactiveScopePromise;
  }
  interactiveScopePromise = runEnsureDriveScopesInteractive().finally(() => {
    interactiveScopePromise = null;
  });
  return interactiveScopePromise;
};

export const ensureDriveScopesSilent = async () => {
  const hasPrevious = await GoogleSignin.hasPreviousSignIn();
  if (!hasPrevious) {
    throw new Error('drive_not_signed_in');
  }
  await GoogleSignin.signInSilently();
  const token = await getAccessToken();
  if (!token) {
    throw new Error('drive_token_missing');
  }
  return true;
};

export const ensureDriveScopes = ensureDriveScopesInteractive;

const driveFetch = async (url, options = {}) => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Missing Google access token');
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };
  const response = await fetch(url, {...options, headers});
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Drive API error: ${response.status} ${text}`);
  }
  return response;
};

export const listAppDataFiles = async (nameFilter = null) => {
  console.log('📁 [DRIVE] Listing files from appDataFolder...');
  console.log('📁 [DRIVE] nameFilter:', nameFilter);

  const q = nameFilter ? `name='${nameFilter.replace(/'/g, "\\'")}'` : null;
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name,modifiedTime,size)',
  });
  if (q) {
    params.set('q', q);
  }
  const url = `${DRIVE_BASE_URL}/files?${params.toString()}`;
  console.log('📁 [DRIVE] Request URL:', url);

  const response = await driveFetch(url);
  const data = await response.json();

  console.log('📁 [DRIVE] Files found:', data.files?.length || 0);
  console.log('📁 [DRIVE] Files:', JSON.stringify(data.files, null, 2));

  return data.files || [];
};

export const uploadAppDataFile = async ({
  filePath,
  fileName,
  mimeType = 'application/zip',
  existingFileId = null,
  onProgress = null,
}) => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Missing Google access token');
  }
  const stat = await RNFS.stat(filePath);
  const fileSize = Number(stat?.size) || 0;
  const metadata = {
    name: fileName,
    mimeType,
    parents: ['appDataFolder'],
  };

  const getLocationHeader = response => {
    const headers = response?.info?.().headers || {};
    const candidates = Object.entries(headers);
    const match = candidates.find(
      ([key]) => key.toLowerCase() === 'location'
    );
    return match ? match[1] : null;
  };

  const uploadToSession = async sessionUrl => {
    const response = await RNBlobUtil.fetch(
      'PUT',
      sessionUrl,
      {
        Authorization: `Bearer ${token}`,
        'Content-Type': mimeType,
        'Content-Length': String(fileSize),
      },
      RNBlobUtil.wrap(filePath),
    ).uploadProgress({interval: 1}, (written, total) => {
      if (onProgress) {
        onProgress(written, total || fileSize);
      }
    });
    return response.json();
  };

  if (existingFileId) {
    const updateMetadata = {
      name: metadata.name,
      mimeType: metadata.mimeType,
    };
    const updateUrl = `${DRIVE_UPLOAD_URL}/${existingFileId}?uploadType=resumable`;
    const sessionResponse = await RNBlobUtil.fetch(
      'PATCH',
      updateUrl,
      {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(fileSize),
      },
      JSON.stringify(updateMetadata),
    );
    const sessionUrl = getLocationHeader(sessionResponse);
    if (!sessionUrl) {
      throw new Error('Missing resumable upload URL');
    }
    return uploadToSession(sessionUrl);
  }

  const createUrl = `${DRIVE_UPLOAD_URL}?uploadType=resumable`;
  const sessionResponse = await RNBlobUtil.fetch(
    'POST',
    createUrl,
    {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(fileSize),
    },
    JSON.stringify(metadata),
  );
  const sessionUrl = getLocationHeader(sessionResponse);
  if (!sessionUrl) {
    throw new Error('Missing resumable upload URL');
  }
  return uploadToSession(sessionUrl);
};

export const downloadAppDataFile = async (fileId, destinationPath) => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Missing Google access token');
  }
  const fromUrl = `${DRIVE_BASE_URL}/files/${fileId}?alt=media`;
  const result = await RNFS.downloadFile({
    fromUrl,
    toFile: destinationPath,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).promise;

  if (result.statusCode !== 200) {
    throw new Error(`Drive download failed: ${result.statusCode}`);
  }
  return destinationPath;
};

export const deleteAppDataFile = async fileId => {
  const url = `${DRIVE_BASE_URL}/files/${fileId}`;
  await driveFetch(url, {method: 'DELETE'});
  return true;
};
