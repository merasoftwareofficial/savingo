import React from 'react';
import {ActivityIndicator, FlatList, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Reanimated from 'react-native-reanimated';
import {useTheme} from '../../context/ThemeContext';

const AnimatedFlatList = Reanimated.createAnimatedComponent(FlatList);

const LedgerConversationTimeline = ({
  listRef,
  timelineForList,
  styles,
  listKeyboardSpacerHeight,
  footerSpacing,
  shouldShowEmptyHistory,
  renderTimelineItem,
  hasMoreHistory,
  loadingOlderHistory,
  onLoadOlder,
}) => {
  const {colors} = useTheme();
  return (
    <AnimatedFlatList
    ref={listRef}
    data={timelineForList}
    keyExtractor={item => item.id}
    style={styles.scrollView}
    contentContainerStyle={[
      styles.scrollContent,
      styles.historySection,
      styles.chatList,
    ]}
    showsVerticalScrollIndicator={false}
    keyboardShouldPersistTaps="always"
    inverted
    initialNumToRender={16}
    maxToRenderPerBatch={12}
    updateCellsBatchingPeriod={45}
    windowSize={9}
    removeClippedSubviews
    onEndReached={onLoadOlder}
    onEndReachedThreshold={0.4}
    renderItem={({item}) => renderTimelineItem(item)}
    ListHeaderComponent={<View style={{height: listKeyboardSpacerHeight}} />}
    ListFooterComponent={
      <View style={{minHeight: footerSpacing}}>
        {loadingOlderHistory ? <ActivityIndicator color={colors.primary} /> : hasMoreHistory ? (
          <TouchableOpacity onPress={onLoadOlder}>
            <Text style={styles.emptyText}>Load older history</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    }
    ListEmptyComponent={
      shouldShowEmptyHistory ? (
        <View style={styles.emptyHistory}>
          <Icon name="receipt-outline" size={48} color={colors.text.light} />
          <Text style={styles.emptyText}>No transactions or messages yet</Text>
        </View>
      ) : null
    }
    />
  );
};

export default React.memo(LedgerConversationTimeline);
