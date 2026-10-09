import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ScrollView, Image} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {calculateContactBalance} from '../services/ledgerDatabase';
import {batchSearchUsers, getUserById} from '../services/userProfileService';
import {useTheme} from '../context/ThemeContext';

const ContactProfileScreen = ({route, navigation}) => {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    contact = {},
    contactName = 'Contact',
    phone = '',
    bio: initialBio = '',
    userId = '',
    balance: initialBalance = null,
  } = route?.params || {};

  const [bio, setBio] = useState(String(initialBio || '').trim());
  const [summary, setSummary] = useState(
    initialBalance || {
      netBalance: 0,
      totalPaid: 0,
      totalGet: 0,
      transactionCount: 0,
    },
  );

  useEffect(() => {
    const recordId = String(contact?.recordID || '').trim();
    if (!recordId) {
      return;
    }
    const latest = calculateContactBalance(recordId);
    setSummary(latest);
  }, [contact?.recordID]);

  useEffect(() => {
    let active = true;

    const resolveBio = async () => {
      if (bio) {
        return;
      }
      try {
        let resolved = null;
        const normalizedUserId = String(userId || '').trim();
        if (normalizedUserId) {
          resolved = await getUserById(normalizedUserId);
        }

        if (!resolved) {
          const rawPhone = String(phone || '').trim();
          if (rawPhone) {
            const usersMap = await batchSearchUsers([rawPhone]);
            const users = Object.values(usersMap || {});
            resolved = users && users.length > 0 ? users[0] : null;
          }
        }

        const nextBio = String(resolved?.bio || '').trim();
        if (active && nextBio) {
          setBio(nextBio);
        }
      } catch (error) {
        console.error('Failed to resolve contact bio:', error);
      }
    };

    resolveBio();
    return () => {
      active = false;
    };
  }, [bio, userId, phone]);

  const totalLenDen = useMemo(
    () => Number(summary?.totalPaid || 0) + Number(summary?.totalGet || 0),
    [summary?.totalPaid, summary?.totalGet],
  );

  const displayPhone = String(phone || '').trim();
  const avatarUri = String(contact?.thumbnailPath || contact?.photoURL || '').trim();
  const initial = (String(contactName || '?').charAt(0) || '?').toUpperCase();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="chevron-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contact Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            {avatarUri ? (
              <Image source={{uri: avatarUri}} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarText}>{initial}</Text>
            )}
          </View>
          <Text style={styles.nameText}>{contactName}</Text>
          {displayPhone ? <Text style={styles.phoneText}>{displayPhone}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bio</Text>
          <Text style={styles.bioText}>{bio || 'No bio available'}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transaction Summary</Text>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total Transaction Value</Text>
            <Text style={styles.statValue}>{totalLenDen.toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total Paid</Text>
            <Text style={styles.statValue}>{Number(summary?.totalPaid || 0).toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total Received</Text>
            <Text style={styles.statValue}>{Number(summary?.totalGet || 0).toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Transactions</Text>
            <Text style={styles.statValue}>{Number(summary?.transactionCount || 0)}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const createStyles = colors =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    height: 56,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.regular,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  headerSpacer: {
    width: 32,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  identityCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    padding: spacing.lg,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    color: colors.white,
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
  },
  nameText: {
    fontSize: fontSize.large,
    color: colors.text.primary,
    fontWeight: fontWeight.semibold,
  },
  phoneText: {
    marginTop: 4,
    fontSize: fontSize.medium,
    color: colors.text.secondary,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  bioText: {
    fontSize: fontSize.medium,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  statLabel: {
    fontSize: fontSize.medium,
    color: colors.text.secondary,
  },
  statValue: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
    fontWeight: fontWeight.semibold,
  },
});

export default ContactProfileScreen;
