import React, {memo, useCallback, useEffect, useMemo, useRef} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';

const KEYS = [
  [
    {label: 'C', value: 'C', kind: 'action'},
    {label: '\u00F7', value: '/', kind: 'operator'},
    {label: 'x', value: '*', kind: 'operator'},
  ],
  [
    {label: '7', value: '7', kind: 'number'},
    {label: '8', value: '8', kind: 'number'},
    {label: '9', value: '9', kind: 'number'},
    {label: '-', value: '-', kind: 'operator'},
  ],
  [
    {label: '4', value: '4', kind: 'number'},
    {label: '5', value: '5', kind: 'number'},
    {label: '6', value: '6', kind: 'number'},
    {label: '+', value: '+', kind: 'operator'},
  ],
  [
    {label: '1', value: '1', kind: 'number'},
    {label: '2', value: '2', kind: 'number'},
    {label: '3', value: '3', kind: 'number'},
    {label: '', value: '', kind: 'empty'},
  ],
  [
    {label: '.', value: '.', kind: 'number'},
    {label: '0', value: '0', kind: 'number'},
    {label: '=', value: '=', kind: 'equal'},
    {label: '', value: 'DEL', icon: 'backspace-outline', kind: 'action'},
  ],
];

const AmountCalculatorPad = ({expression, preview, onKeyPress}) => {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const expressionScrollRef = useRef(null);
  const expressionOffsetX = useRef(0);
  const expressionContentWidth = useRef(0);
  const expressionContainerWidth = useRef(0);
  const gestureStartX = useRef(0);
  const gestureStartOffset = useRef(0);
  const backspaceRepeatTimerRef = useRef(null);
  const isBackspaceHoldingRef = useRef(false);
  const hasDeletedOnPressInRef = useRef(false);
  const formattedExpression = useMemo(
    () =>
      String(expression || '')
        .replace(/\*/g, 'x')
        .replace(/\//g, '\u00F7'),
    [expression],
  );

  useEffect(() => {
    requestAnimationFrame(() => {
      expressionScrollRef.current?.scrollToEnd({animated: true});
    });
  }, [formattedExpression]);

  const onExpressionScroll = useCallback(event => {
    expressionOffsetX.current = event.nativeEvent.contentOffset.x;
  }, []);

  const onExpressionContentSizeChange = useCallback((contentWidth, _) => {
    expressionContentWidth.current = contentWidth || 0;
  }, []);

  const onExpressionLayout = useCallback(event => {
    expressionContainerWidth.current = event.nativeEvent.layout.width;
  }, []);

  const onExpressionTouchStart = useCallback(event => {
    gestureStartX.current = event.nativeEvent.pageX;
    gestureStartOffset.current = expressionOffsetX.current;
  }, []);

  const onExpressionTouchMove = useCallback(event => {
    const deltaX = gestureStartX.current - event.nativeEvent.pageX;
    const maxOffset = Math.max(
      0,
      expressionContentWidth.current - expressionContainerWidth.current,
    );
    const nextOffset = Math.min(
      Math.max(0, gestureStartOffset.current + deltaX),
      maxOffset,
    );
    expressionScrollRef.current?.scrollTo({x: nextOffset, animated: false});
  }, []);

  const stopBackspaceRepeat = useCallback(() => {
    if (backspaceRepeatTimerRef.current) {
      clearInterval(backspaceRepeatTimerRef.current);
      backspaceRepeatTimerRef.current = null;
    }
    isBackspaceHoldingRef.current = false;
    hasDeletedOnPressInRef.current = false;
  }, []);

  const triggerBackspaceDelete = useCallback(
    key => {
      onKeyPress?.(key.value, key);
    },
    [onKeyPress],
  );

  const startBackspaceRepeat = useCallback(
    key => {
      if (key.value !== 'DEL') {
        return;
      }
      isBackspaceHoldingRef.current = true;
      backspaceRepeatTimerRef.current = setInterval(() => {
        triggerBackspaceDelete(key);
      }, 90);
    },
    [triggerBackspaceDelete],
  );

  const onBackspacePressIn = useCallback(
    key => {
      if (key.value !== 'DEL') {
        return;
      }
      stopBackspaceRepeat();
      hasDeletedOnPressInRef.current = true;
      triggerBackspaceDelete(key);
    },
    [stopBackspaceRepeat, triggerBackspaceDelete],
  );

  return (
    <View style={styles.container}>
      <View style={styles.displayCard}>
        <ScrollView
          ref={expressionScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={true}
          onScroll={onExpressionScroll}
          scrollEventThrottle={16}
          onContentSizeChange={onExpressionContentSizeChange}
          onLayout={onExpressionLayout}
          onTouchStart={onExpressionTouchStart}
          onTouchMove={onExpressionTouchMove}
          style={styles.expressionScroll}
          contentContainerStyle={styles.expressionScrollContent}
          keyboardShouldPersistTaps="always">
          <Text
            style={styles.expressionText}
            numberOfLines={1}
            ellipsizeMode="head">
            {formattedExpression || '0'}
          </Text>
        </ScrollView>
      </View>

      {KEYS.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={styles.row}>
          {row.map((key, keyIndex) => {
            const isEqual = key.kind === 'equal';
            const isOperator = key.kind === 'operator';
            const isAction = key.kind === 'action';
            const isEmpty = key.kind === 'empty';
            const isDeleteKey = key.value === 'DEL';
            const isPlusKey = key.value === '+';
            const isSpecialAction = key.value === 'C' || key.value === 'DEL';
            const isClearKey = key.value === 'C';
            const isHighPriorityKey =
              key.value === 'C' || key.value === 'DEL' || key.value === '=';
            const keyTouchArea = isHighPriorityKey
              ? {top: 10, left: 10, right: 10, bottom: 10}
              : {top: 8, left: 8, right: 8, bottom: 8};

            if (isEmpty) {
              return (
                <View
                  key={`empty-${rowIndex}-${keyIndex}`}
                  style={styles.keyEmpty}
                />
              );
            }

            return (
              <TouchableOpacity
                key={`${key.value}-${rowIndex}-${keyIndex}`}
                style={[
                  styles.key,
                  isOperator && styles.operatorKey,
                  isSpecialAction && styles.operatorKey,
                  isAction && !isSpecialAction && styles.actionKey,
                  isEqual && styles.operatorKey,
                  isDeleteKey && styles.deleteKey,
                  isPlusKey && styles.plusTallKey,
                ]}
                activeOpacity={0.85}
                hitSlop={keyTouchArea}
                pressRetentionOffset={keyTouchArea}
                onPress={() => {
                  if (key.value === 'DEL') {
                    return;
                  }
                  onKeyPress?.(key.value, key);
                }}
                onPressIn={() => onBackspacePressIn(key)}
                delayLongPress={500}
                onLongPress={() => startBackspaceRepeat(key)}
                onPressOut={stopBackspaceRepeat}>
                {key.icon ? (
                  <Icon
                    name={key.icon}
                    size={22}
                    color={
                      isDeleteKey
                        ? colors.onPrimary
                        : isSpecialAction
                        ? styles.operatorKeyText.color
                        : isAction
                        ? styles.actionKeyText.color
                        : styles.keyText.color
                    }
                  />
                ) : (
                  <Text
                    style={[
                      styles.keyText,
                      isOperator && styles.operatorKeyText,
                      isSpecialAction && styles.operatorKeyText,
                      isClearKey && styles.clearKeyText,
                      isAction && !isSpecialAction && styles.actionKeyText,
                      isEqual && styles.operatorKeyText,
                    ]}>
                    {key.label}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const createStyles = colors =>
  StyleSheet.create({
    container: {
      width: '100%',
      alignSelf: 'stretch',
      marginTop: spacing.sm,
      gap: spacing.xs,
    },
    displayCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: spacing.sm,
      backgroundColor: colors.input || colors.card,
    },
    expressionScroll: {
      maxHeight: 46,
    },
    expressionScrollContent: {
      flexGrow: 1,
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    expressionText: {
      fontSize: 26,
      fontWeight: fontWeight.bold,
      color: colors.text.primary,
      textAlign: 'right',
    },
    previewText: {
      marginTop: 2,
      fontSize: fontSize.small,
      color: colors.text.secondary,
      textAlign: 'right',
    },
    row: {
      flexDirection: 'row',
      width: '100%',
      gap: spacing.xs,
    },
    key: {
      flex: 1,
      position: 'relative',
      height: 44,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    keyText: {
      fontSize: 26,
      fontWeight: fontWeight.semibold,
      color: colors.text.primary,
    },
    operatorKey: {
      backgroundColor: colors.surfaceMuted || colors.card,
      borderColor: colors.border,
    },
    operatorKeyText: {
      fontSize: 26,
      color: colors.primary,
    },
    clearKeyText: {
      fontSize: 20,
    },
    actionKey: {
      backgroundColor: colors.surfaceMuted || colors.card,
    },
    actionKeyText: {
      color: colors.text.secondary,
      fontSize: 14,
    },
    deleteKey: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    plusTallKey: {
      height: 44 * 2 + spacing.xs,
      marginBottom: -(44 + spacing.xs),
      zIndex: 2,
    },
    keyEmpty: {
      flex: 1,
      height: 44,
    },
  });

export default memo(AmountCalculatorPad);
