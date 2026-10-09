import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {spacing, fontSize, fontWeight, headerTexture} from '../utils/theme';
import {useToast} from '../hooks/useToast';
import TexturedSurface from '../components/TexturedSurface';
import {useTheme} from '../context/ThemeContext';
import {useAppAlert} from '../context/AppAlertContext';

const QuestionAnswerScreen = ({navigation, route}) => {
  const insets = useSafeAreaInsets();
  const {colors} = useTheme();
  const {showAlert} = useAppAlert();
  const themedAlert = React.useCallback((title, message, actions) => {
    const safeActions =
      Array.isArray(actions) && actions.length
        ? actions.map(action => ({
            text: String(action?.text || 'OK'),
            style: action?.style || 'default',
            onPress: action?.onPress,
          }))
        : [{text: 'OK'}];
    showAlert({
      title: String(title || ''),
      message: String(message || ''),
      actions: safeActions,
    });
  }, [showAlert]);
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const {question, category} = route.params || {};
  const [feedbackGiven, setFeedbackGiven] = useState(null);
  const {showToast} = useToast();

  if (!question) {
    return (
      <View style={styles.container}>
        <Text>Question not found</Text>
      </View>
    );
  }

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const handleFeedback = (isHelpful) => {
    setFeedbackGiven(isHelpful);
    const message = isHelpful
      ? 'Glad we could help!'
      : 'We\'ll improve this answer';
    showToast(message, 'success');
  };

  const handleWhatsAppPress = () => {
    const message = 'Hello, I would like to learn about Savingo.';
    const whatsappURL = `whatsapp://send?text=${encodeURIComponent(message)}`;
    Linking.openURL(whatsappURL).catch(err =>
      themedAlert('Error', 'WhatsApp is not installed on your device.')
    );
  };

  return (
    <View style={styles.container}>
      <TexturedSurface
        style={[
          styles.header,
          {
            paddingTop: spacing.sm + insets.top,
          },
        ]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          accessibilityLabel="Go back">
          <Icon name="chevron-back" size={22} color={headerTexture.icon} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>FAQs</Text>
        <View style={styles.headerSpacer} />
      </TexturedSurface>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <View style={styles.mainBox}>
          <Text style={styles.questionHeading}>{question.question}</Text>

          <Text style={styles.answerText}>{question.answer}</Text>

          <View style={styles.divider} />

          <View style={styles.feedbackSection}>
            <Text style={styles.feedbackLabel}>Was this helpful?</Text>
            <View style={styles.feedbackButtonRow}>
              <TouchableOpacity
                style={[
                  styles.feedbackButton,
                  feedbackGiven === true && styles.feedbackButtonActive,
                ]}
                onPress={() => handleFeedback(true)}
                activeOpacity={0.7}>
                <Icon
                  name="thumbs-up"
                  size={20}
                  color={feedbackGiven === true ? colors.primary : colors.text.light}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.feedbackButton,
                  feedbackGiven === false && styles.feedbackButtonActive,
                ]}
                onPress={() => handleFeedback(false)}
                activeOpacity={0.7}>
                <Icon
                  name="thumbs-down"
                  size={20}
                  color={feedbackGiven === false ? colors.primary : colors.text.light}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.bottomSection}>
          <Text style={styles.bottomText}>Didn't find your question?</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.contactButton, styles.whatsappButton]}
              onPress={handleWhatsAppPress}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Chat with us on WhatsApp">
              <Icon name="logo-whatsapp" size={18} color={colors.white} />
              <Text style={styles.buttonText}>CHAT WITH US</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const createStyles = colors => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: headerTexture.border,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: headerTexture.title,
  },
  headerSpacer: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  mainBox: {
    backgroundColor: colors.card,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  questionHeading: {
    fontSize: fontSize.xlarge,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    lineHeight: 28,
    marginBottom: spacing.md,
  },
  answerText: {
    fontSize: fontSize.regular,
    color: colors.text.secondary,
    lineHeight: 24,
    marginBottom: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  feedbackSection: {
    alignItems: 'center',
  },
  feedbackLabel: {
    fontSize: 14,
    color: colors.text.primary,
    marginBottom: spacing.md,
    fontWeight: fontWeight.medium,
  },
  feedbackButtonRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  feedbackButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.panelMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  feedbackButtonActive: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.primary,
  },
  bottomSection: {
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.md,
  },
  bottomText: {
    fontSize: fontSize.small,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
  },
  contactButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: spacing.xs,
  },
  whatsappButton: {
    backgroundColor: '#25D366',
  },
  buttonText: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
});

export default QuestionAnswerScreen;

