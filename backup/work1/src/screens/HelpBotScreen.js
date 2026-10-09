import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';
import TexturedSurface from '../components/TexturedSurface';
import {sendMessageToGemini} from '../services/geminiService';
import {QUICK_QUESTIONS, getBotResponse} from '../utils/botEngine';
import {ScrollView} from 'react-native';

const LANGUAGES = [
  {code: 'en', label: 'EN', full: 'English'},
  {code: 'hi', label: 'HI', full: 'Hindi'},
];

const WELCOME = {
  en: 'Hi! Ask me anything about the app — I\'m here to help!',
  hi: 'Namaste! App ke baare mein koi bhi sawaal poochhein — main help karunga!',
};

const getWelcomeMessage = lang => ({
  id: 'welcome',
  role: 'bot',
  text: WELCOME[lang] || WELCOME.en,
  showSupport: true,
  timestamp: Date.now(),
});

const TypingIndicator = ({colors, styles}) => {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = dot =>
      Animated.sequence([
        Animated.timing(dot, {toValue: 1, duration: 300, useNativeDriver: true}),
        Animated.timing(dot, {toValue: 0.3, duration: 300, useNativeDriver: true}),
      ]);

    const loop = Animated.loop(
      Animated.stagger(200, [animate(dot1), animate(dot2), animate(dot3)]),
    );
    loop.start();
    return () => loop.stop();
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingContainer}>
      <View style={styles.botAvatar}>
        <Icon name="sparkles" size={12} color={colors.primary} />
      </View>
      <View style={styles.typingBubble}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={[styles.dot, {opacity: dot}]} />
        ))}
      </View>
    </View>
  );
};

const MessageBubble = ({item, colors, styles}) => {
  const isUser = item.role === 'user';
  return (
    <View style={[styles.messageRow, isUser ? styles.userRow : styles.botRow]}>
      {!isUser && (
        <View style={styles.botAvatar}>
          <Icon name="sparkles" size={12} color={colors.primary} />
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.botBubble,
        ]}>
        <Text style={isUser ? styles.userText : styles.botText}>{item.text}</Text>
        {item.showSupport && (
          <Text style={styles.supportLine}>
            Need help from the team? Go to{' '}
            <Text style={styles.supportPath}>More {'>'} Support</Text>
          </Text>
        )}
      </View>
    </View>
  );
};

const HelpBotScreen = ({navigation}) => {
  const insets = useSafeAreaInsets();
  const {colors} = useTheme();
  const styles = React.useMemo(() => StyleSheet.create({
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
      borderBottomColor: colors.border,
    },
    headerBtn: {
      padding: spacing.xs,
      width: 36,
      alignItems: 'center',
    },
    headerCenter: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    headerTitle: {
      fontSize: fontSize.large,
      fontWeight: fontWeight.semibold,
      color: colors.headerText,
    },
    listContent: {
      padding: spacing.md,
      paddingBottom: spacing.sm,
    },
    messageRow: {
      flexDirection: 'row',
      marginBottom: spacing.sm,
      alignItems: 'flex-end',
    },
    userRow: {
      justifyContent: 'flex-end',
    },
    botRow: {
      justifyContent: 'flex-start',
    },
    botAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.xs,
      marginBottom: 2,
    },
    bubble: {
      maxWidth: '78%',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderRadius: 16,
    },
    userBubble: {
      backgroundColor: colors.primary,
      borderBottomRightRadius: 4,
    },
    botBubble: {
      backgroundColor: colors.card,
      borderBottomLeftRadius: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    userText: {
      fontSize: fontSize.medium,
      color: colors.white,
      lineHeight: 20,
    },
    botText: {
      fontSize: fontSize.medium,
      color: colors.text.primary,
      lineHeight: 20,
    },
    supportLine: {
      fontSize: fontSize.small,
      color: colors.primary,
      marginTop: spacing.sm,
      lineHeight: 18,
    },
    supportPath: {
      fontWeight: fontWeight.semibold,
    },
    typingContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginBottom: spacing.sm,
    },
    typingBubble: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      borderBottomLeftRadius: 4,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      gap: 4,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.text.light,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: spacing.sm,
    },
    input: {
      flex: 1,
      minHeight: 40,
      maxHeight: 100,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: fontSize.medium,
      color: colors.text.primary,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: {
      backgroundColor: colors.border,
    },
    langBar: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      gap: spacing.sm,
    },
    langBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    langBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    langText: {
      fontSize: fontSize.small,
      fontWeight: fontWeight.semibold,
      color: colors.text.secondary,
    },
    langTextActive: {
      color: colors.white,
    },
    quickSection: {
      marginTop: spacing.md,
      paddingHorizontal: spacing.xs,
    },
    quickLabel: {
      fontSize: fontSize.small,
      color: colors.text.light,
      fontWeight: fontWeight.medium,
      marginBottom: spacing.sm,
      marginLeft: spacing.xs,
    },
    quickGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    quickChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surfaceMuted || colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    quickChipText: {
      fontSize: fontSize.small,
      color: colors.primary,
      fontWeight: fontWeight.medium,
    },
  }), [colors]);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [language, setLanguage] = useState('en');
  const flatListRef = useRef(null);

  useEffect(() => {
    setMessages([getWelcomeMessage('en')]);
  }, []);

  const handleLanguageChange = useCallback((lang) => {
    setLanguage(lang);
    setMessages([getWelcomeMessage(lang)]);
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({animated: true});
    }, 100);
  }, []);

  const handleSend = useCallback(async (quickText) => {
    const isQuick = typeof quickText === 'string';
    const text = (isQuick ? quickText : inputText).trim();
    if (!text || isTyping) {
      return;
    }

    const userMsg = {
      id: `u_${Date.now()}`,
      role: 'user',
      text,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    setIsTyping(true);
    scrollToBottom();

    // Quick chip → local botEngine (no API call)
    if (isQuick) {
      console.log('[HelpBot] Source: botEngine (quick chip) | Lang:', language, '| Q:', text);
      const responseText = getBotResponse(text, language);
      console.log('[HelpBot] botEngine response:', responseText.slice(0, 80));
      setMessages([...updatedMessages, {id: `b_${Date.now()}`, role: 'bot', text: responseText, timestamp: Date.now()}]);
      setIsTyping(false);
      scrollToBottom();
      return;
    }

    // Typed text → Gemini API
    console.log('[HelpBot] Source: Gemini | Lang:', language, '| Q:', text);
    try {
      const historyForApi = updatedMessages.filter(m => m.id !== 'welcome').slice(0, -1);
      console.log('[HelpBot] Gemini request → history length:', historyForApi.length);
      const responseText = await sendMessageToGemini(text, historyForApi, language);
      console.log('[HelpBot] Gemini response OK:', responseText.slice(0, 80));
      setMessages([...updatedMessages, {id: `b_${Date.now()}`, role: 'bot', text: responseText, timestamp: Date.now()}]);
      scrollToBottom();
    } catch (err) {
      console.warn('[HelpBot] Gemini failed:', err?.message, '→ falling back to botEngine');
      const fallbackText = getBotResponse(text, language);
      console.log('[HelpBot] Fallback response:', fallbackText.slice(0, 80));
      setMessages([...updatedMessages, {id: `b_${Date.now()}`, role: 'bot', text: fallbackText, timestamp: Date.now()}]);
      scrollToBottom();
    } finally {
      setIsTyping(false);
    }
  }, [inputText, isTyping, messages, scrollToBottom]);

  const handleClear = useCallback(() => {
    setMessages([getWelcomeMessage(language)]);
  }, [language]);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={0}>
      {/* Header */}
      <TexturedSurface
        style={[styles.header, {paddingTop: spacing.sm + insets.top}]}>
        {navigation.canGoBack() ? (
          <TouchableOpacity style={styles.headerBtn} onPress={handleBack}>
            <Icon name="chevron-back" size={22} color={colors.headerIcon} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerBtn} />
        )}
        <View style={styles.headerCenter}>
          <Icon name="sparkles" size={16} color={colors.headerIcon} />
          <Text style={styles.headerTitle}>Savingo Assistant</Text>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={handleClear}>
          <Icon name="trash-outline" size={20} color={colors.headerIcon} />
        </TouchableOpacity>
      </TexturedSurface>

      {/* Language Selector */}
      <View style={styles.langBar}>
        {LANGUAGES.map(lang => (
          <TouchableOpacity
            key={lang.code}
            style={[styles.langBtn, language === lang.code && styles.langBtnActive]}
            onPress={() => handleLanguageChange(lang.code)}
            activeOpacity={0.7}>
            <Text style={[styles.langText, language === lang.code && styles.langTextActive]}>
              {lang.full}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({item}) => <MessageBubble item={item} colors={colors} styles={styles} />}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={scrollToBottom}
        ListFooterComponent={
          <>
            {isTyping && <TypingIndicator colors={colors} styles={styles} />}
            {messages.length <= 1 && !isTyping && (
              <View style={styles.quickSection}>
                <Text style={styles.quickLabel}>
                  {language === 'hi' ? 'Jaldi poochhein:' : 'Quick questions:'}
                </Text>
                <ScrollView
                  horizontal={false}
                  showsVerticalScrollIndicator={false}>
                  <View style={styles.quickGrid}>
                    {QUICK_QUESTIONS[language].map((q, i) => (
                      <TouchableOpacity
                        key={i}
                        style={styles.quickChip}
                        onPress={() => handleSend(q)}
                        activeOpacity={0.7}>
                        <Text style={styles.quickChipText}>{q}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
          </>
        }
      />

      {/* Input */}
      <View style={[styles.inputRow, {paddingBottom: spacing.sm + insets.bottom}]}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={language === 'hi' ? 'Apna sawal yahan likhein...' : 'Type your question here...'}
          placeholderTextColor={colors.text.light}
          multiline
          maxLength={500}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!inputText.trim() || isTyping) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || isTyping}>
          <Icon name="send" size={18} color={colors.white} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

export default HelpBotScreen;


