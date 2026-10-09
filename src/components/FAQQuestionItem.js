import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';

const FAQQuestionItem = ({question, answer}) => {
  const [expanded, setExpanded] = useState(false);
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.questionHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}>
        <Text style={styles.questionText}>{question}</Text>
        <Icon
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={18}
          color={colors.text.light}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.answerContent}>
          <Text style={styles.answerText}>{answer}</Text>
        </View>
      )}
    </View>
  );
};

const createStyles = colors => StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    marginBottom: spacing.sm,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  questionText: {
    flex: 1,
    fontSize: fontSize.regular,
    fontWeight: fontWeight.medium,
    color: colors.text.primary,
    marginRight: spacing.sm,
    lineHeight: 20,
  },
  answerContent: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  answerText: {
    fontSize: fontSize.regular,
    color: colors.text.primary,
    lineHeight: 22,
  },
});

export default FAQQuestionItem;
