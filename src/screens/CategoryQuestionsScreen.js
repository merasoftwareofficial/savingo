import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {spacing, fontSize, fontWeight, headerTexture} from '../utils/theme';
import PageHeader from '../components/ui/PageHeader';
import {useTheme} from '../context/ThemeContext';
import {useAppAlert} from '../context/AppAlertContext';

const CategoryQuestionsScreen = ({navigation, route}) => {
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
  const {category} = route.params || {};

  if (!category) {
    return (
      <View style={styles.container}>
        <Text>Category not found</Text>
      </View>
    );
  }

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const handleQuestionPress = (question) => {
    navigation.navigate('QuestionAnswer', {question, category});
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
      <PageHeader title="FAQs" onBackPress={handleBack} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {category.questions.map(question => (
          <TouchableOpacity
            key={question.id}
            style={styles.questionCard}
            onPress={() => handleQuestionPress(question)}
            activeOpacity={0.75}>
            <Text style={styles.questionText}>{question.question}</Text>
            <Icon
              name="chevron-forward"
              size={20}
              color={colors.text.light}
            />
          </TouchableOpacity>
        ))}

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
  questionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    marginBottom: spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  questionText: {
    flex: 1,
    fontSize: fontSize.regular,
    fontWeight: fontWeight.medium,
    color: colors.text.primary,
    lineHeight: 20,
    marginRight: spacing.sm,
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

export default CategoryQuestionsScreen;

