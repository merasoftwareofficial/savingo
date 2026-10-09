import notifee, {
  AuthorizationStatus,
  AndroidImportance,
} from '@notifee/react-native';

const PHONE_CLAIM_CHANNEL_ID = 'phone_claim_requests';

const normalizeText = value => String(value || '').trim();

const isNotificationAuthGranted = status =>
  status === AuthorizationStatus.AUTHORIZED ||
  status === AuthorizationStatus.PROVISIONAL;

const ensureNotificationPermission = async () => {
  try {
    const settings = await notifee.getNotificationSettings();
    const status = settings?.authorizationStatus;
    if (isNotificationAuthGranted(status)) {
      return {granted: true, status};
    }

    const requested = await notifee.requestPermission();
    const requestedStatus = requested?.authorizationStatus;
    return {
      granted: isNotificationAuthGranted(requestedStatus),
      status: requestedStatus,
    };
  } catch (error) {
    console.error('[PHONE_CLAIM_NOTIF] permission check failed:', error);
    return {granted: false, status: 'error'};
  }
};

const ensurePhoneClaimNotificationChannel = async () => {
  await notifee.createChannel({
    id: PHONE_CLAIM_CHANNEL_ID,
    name: 'Phone Transfer Requests',
    importance: AndroidImportance.HIGH,
    sound: 'default',
  });
  return PHONE_CLAIM_CHANNEL_ID;
};

const buildNotificationData = payload => ({
  type: normalizeText(payload?.type || 'phone_claim_request'),
  status: normalizeText(payload?.status),
  notifVersion: normalizeText(payload?.notifVersion || 'v1'),
  eventId: normalizeText(payload?.eventId),
  claimId: normalizeText(payload?.claimId),
  requesterId: normalizeText(payload?.requesterId),
  requesterName: normalizeText(payload?.requesterName),
  phoneNormalized: normalizeText(payload?.phoneNormalized),
  phoneLastFour: normalizeText(payload?.phoneLastFour),
  notificationId: normalizeText(payload?.notificationId),
});

export const buildPhoneClaimNotificationId = claimId =>
  `phone_claim_${normalizeText(claimId).replace(/[^a-zA-Z0-9_.-]/g, '_') || 'unknown'}`;

const displayPhoneClaimNotification = async ({
  claimId,
  title,
  body,
  pressActionId,
  payload,
}) => {
  if (!normalizeText(claimId)) {
    return;
  }

  const permission = await ensureNotificationPermission();
  if (!permission.granted) {
    return;
  }

  const channelId = await ensurePhoneClaimNotificationChannel();
  const notificationId =
    normalizeText(payload?.notificationId) ||
    buildPhoneClaimNotificationId(claimId);

  await notifee.displayNotification({
    id: notificationId,
    title,
    body,
    data: buildNotificationData({
      ...payload,
      claimId,
      notificationId,
    }),
    android: {
      channelId,
      smallIcon: 'ic_launcher',
      importance: AndroidImportance.HIGH,
      pressAction: {
        id: pressActionId,
        launchActivity: 'default',
      },
    },
  });
};

export const displayPhoneClaimRequestNotification = async payload => {
  const claimId = normalizeText(payload?.claimId);
  await displayPhoneClaimNotification({
    claimId,
    title: 'Phone Number Change Request',
    body: 'A phone number change request needs your action. Open Savingo to review it.',
    pressActionId: 'phone_claim_open',
    payload: {
      ...payload,
      type: 'phone_claim_request',
    },
  });
};

export const displayPhoneClaimResultNotification = async payload => {
  const claimId = normalizeText(payload?.claimId);
  const status = normalizeText(payload?.status).toLowerCase();
  const phoneLastFour = normalizeText(payload?.phoneLastFour);

  let body = 'Your phone number change request has been updated.';
  if (status === 'approved') {
    body = phoneLastFour
      ? `Your request for the number ending in ${phoneLastFour} was approved.`
      : 'Your phone number change request was approved.';
  } else if (status === 'rejected') {
    body = phoneLastFour
      ? `Your request for the number ending in ${phoneLastFour} was rejected.`
      : 'Your phone number change request was rejected.';
  } else if (status === 'blocked') {
    body = phoneLastFour
      ? `Your request for the number ending in ${phoneLastFour} was rejected and blocked.`
      : 'Your phone number change request was rejected and blocked.';
  }

  await displayPhoneClaimNotification({
    claimId,
    title: 'Phone Number Request Update',
    body,
    pressActionId: 'phone_claim_result_open',
    payload: {
      ...payload,
      type: 'phone_claim_result',
      status,
    },
  });
};
