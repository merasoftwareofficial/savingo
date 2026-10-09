import {useCallback, useEffect, useMemo, useState} from 'react';
import {Keyboard, Platform} from 'react-native';
import {spacing} from '../utils/theme';

const useChatComposerLayout = ({
  isAppUser,
  insetsBottom,
  screenHeight,
  chatInputRef,
  inputTapAtRef,
  actionButtonsChangedAtRef,
  perfLog,
}) => {
  const [shouldHideActionButtons, setShouldHideActionButtons] = useState(false);
  const [softInputHeight, setSoftInputHeight] = useState(0);
  const [chatComposerHeight, setChatComposerHeight] = useState(
    56 + spacing.sm + insetsBottom,
  );

  const chatInputAvoidOffset = Platform.OS === 'android' ? 10 : 0;
  const normalizedSoftInputHeight = useMemo(
    () =>
      Math.min(
        Math.max(0, softInputHeight),
        Math.round(screenHeight * 0.45),
      ),
    [screenHeight, softInputHeight],
  );
  const listKeyboardSpacerHeight =
    isAppUser === true && shouldHideActionButtons
      ? Math.max(chatComposerHeight, normalizedSoftInputHeight)
      : 0;

  useEffect(() => {
    const onKeyboardDidShow = event => {
      if (Platform.OS === 'android') {
        return;
      }
      const keyboardHeight = Math.max(
        0,
        Math.round(event?.endCoordinates?.height || 0),
      );
      if (keyboardHeight > 0) {
        setSoftInputHeight(prev => (prev === keyboardHeight ? prev : keyboardHeight));
      }
      perfLog('keyboard:did-show', {
        height: keyboardHeight,
        softInputHeight,
        listKeyboardSpacerHeight,
        shouldHideActionButtons,
        inputFocused: Boolean(chatInputRef.current?.isFocused?.()),
      });
    };

    const onKeyboardDidHide = () => {
      if (Platform.OS === 'android') {
        const inputFocused = Boolean(chatInputRef.current?.isFocused?.());
        if (!inputFocused || softInputHeight === 0) {
          setSoftInputHeight(0);
          setShouldHideActionButtons(false);
        }
        return;
      }
      perfLog('keyboard:did-hide', {
        softInputHeight,
        listKeyboardSpacerHeight,
        shouldHideActionButtons,
        inputFocused: Boolean(chatInputRef.current?.isFocused?.()),
      });
      setSoftInputHeight(0);
      setShouldHideActionButtons(false);
    };

    const showSub = Keyboard.addListener('keyboardDidShow', onKeyboardDidShow);
    const hideSub = Keyboard.addListener('keyboardDidHide', onKeyboardDidHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [
    chatInputRef,
    listKeyboardSpacerHeight,
    perfLog,
    shouldHideActionButtons,
    softInputHeight,
  ]);

  useEffect(() => {
    perfLog('keyboard:spacer-state', {
      softInputHeight,
      listKeyboardSpacerHeight,
      shouldHideActionButtons,
      inputFocused: Boolean(chatInputRef.current?.isFocused?.()),
    });
  }, [
    chatInputRef,
    listKeyboardSpacerHeight,
    perfLog,
    shouldHideActionButtons,
    softInputHeight,
  ]);

  useEffect(() => {
    actionButtonsChangedAtRef.current = Date.now();
    perfLog('ui:action-buttons-state', {
      shouldHideActionButtons,
      sinceInputTapMs: inputTapAtRef.current
        ? actionButtonsChangedAtRef.current - inputTapAtRef.current
        : null,
    });
  }, [
    actionButtonsChangedAtRef,
    inputTapAtRef,
    perfLog,
    shouldHideActionButtons,
  ]);

  const handleComposerLayout = useCallback(event => {
    const nextHeight = Math.max(
      0,
      Math.round(event?.nativeEvent?.layout?.height || 0),
    );
    if (nextHeight > 0) {
      setChatComposerHeight(prev => (prev === nextHeight ? prev : nextHeight));
    }
  }, []);

  const handleSoftInputHeightChange = useCallback(
    event => {
      const nextHeight = Math.max(
        0,
        event?.nativeEvent?.softInputHeight || 0,
      );
      perfLog('avoidsoftinput:height-change', {
        previousHeight: softInputHeight,
        nextHeight,
        shouldHideActionButtons,
        inputFocused: Boolean(chatInputRef.current?.isFocused?.()),
      });
      setSoftInputHeight(prev => (prev === nextHeight ? prev : nextHeight));
    },
    [chatInputRef, perfLog, shouldHideActionButtons, softInputHeight],
  );

  const handleSoftInputShown = useCallback(() => {
    perfLog('avoidsoftinput:shown', {
      softInputHeight,
      listKeyboardSpacerHeight,
      shouldHideActionButtons,
      inputFocused: Boolean(chatInputRef.current?.isFocused?.()),
    });
  }, [
    chatInputRef,
    listKeyboardSpacerHeight,
    perfLog,
    shouldHideActionButtons,
    softInputHeight,
  ]);

  const handleSoftInputHidden = useCallback(() => {
    perfLog('avoidsoftinput:hidden', {
      softInputHeight,
      listKeyboardSpacerHeight,
      shouldHideActionButtons,
      inputFocused: Boolean(chatInputRef.current?.isFocused?.()),
    });
    setSoftInputHeight(0);
    setShouldHideActionButtons(false);
  }, [
    chatInputRef,
    listKeyboardSpacerHeight,
    perfLog,
    shouldHideActionButtons,
    softInputHeight,
  ]);

  const handleInputTouchStart = useCallback(() => {
    inputTapAtRef.current = Date.now();
    perfLog('chat-input:touch-start', {
      shouldHideActionButtons,
      softInputHeight,
      listKeyboardSpacerHeight,
      inputFocused: Boolean(chatInputRef.current?.isFocused?.()),
    });
    if (!shouldHideActionButtons) {
      setShouldHideActionButtons(true);
    }
  }, [
    chatInputRef,
    inputTapAtRef,
    listKeyboardSpacerHeight,
    perfLog,
    shouldHideActionButtons,
    softInputHeight,
  ]);

  const handleInputFocus = useCallback(() => {
    const sinceTouchMs = inputTapAtRef.current
      ? Date.now() - inputTapAtRef.current
      : null;
    perfLog('chat-input:focus', {
      sinceTouchMs,
      shouldHideActionButtons,
      softInputHeight,
      listKeyboardSpacerHeight,
      inputFocused: Boolean(chatInputRef.current?.isFocused?.()),
    });
  }, [
    chatInputRef,
    inputTapAtRef,
    listKeyboardSpacerHeight,
    perfLog,
    shouldHideActionButtons,
    softInputHeight,
  ]);

  const handleInputBlur = useCallback(() => {
    perfLog('chat-input:blur', {
      sinceTouchMs: inputTapAtRef.current ? Date.now() - inputTapAtRef.current : null,
      shouldHideActionButtons,
      softInputHeight,
      listKeyboardSpacerHeight,
      inputFocused: Boolean(chatInputRef.current?.isFocused?.()),
    });
    setSoftInputHeight(0);
    setShouldHideActionButtons(false);
  }, [
    chatInputRef,
    inputTapAtRef,
    listKeyboardSpacerHeight,
    perfLog,
    shouldHideActionButtons,
    softInputHeight,
  ]);

  return {
    chatComposerHeight,
    chatInputAvoidOffset,
    listKeyboardSpacerHeight,
    setShouldHideActionButtons,
    setSoftInputHeight,
    shouldHideActionButtons,
    softInputHeight,
    handleComposerLayout,
    handleInputBlur,
    handleInputFocus,
    handleInputTouchStart,
    handleSoftInputHeightChange,
    handleSoftInputHidden,
    handleSoftInputShown,
  };
};

export default useChatComposerLayout;
