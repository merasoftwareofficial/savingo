import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';

const TimePicker = ({value, onTimeChange, label}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedHour, setSelectedHour] = useState(parseInt(value.split(':')[0]));
  const [selectedMinute, setSelectedMinute] = useState(
    parseInt(value.split(':')[1]),
  );

  const hours = Array.from({length: 24}, (_, i) => i);
  const minutes = Array.from({length: 60}, (_, i) => i);

  const handleConfirm = () => {
    const newTime = `${String(selectedHour).padStart(2, '0')}:${String(
      selectedMinute,
    ).padStart(2, '0')}`;
    onTimeChange(newTime);
    setModalVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.timeButton}
        onPress={() => setModalVisible(true)}>
        <View style={styles.timeContent}>
          <Text style={styles.timeLabel}>{label}</Text>
          <Text style={styles.timeValue}>{value}</Text>
        </View>
        <Icon
          name="chevron-forward"
          size={20}
          color={colors.text.secondary}
        />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Time</Text>
            <TouchableOpacity onPress={handleConfirm}>
              <Text style={styles.confirmButton}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.timePickerContainer}>
            <View style={styles.pickerColumn}>
              <Text style={styles.pickerLabel}>Hour</Text>
              <ScrollView
                style={styles.scrollView}
                snapToInterval={50}
                decelerationRate="fast"
                showsVerticalScrollIndicator={false}>
                {hours.map(hour => (
                  <TouchableOpacity
                    key={hour}
                    style={[
                      styles.pickerItem,
                      selectedHour === hour && styles.pickerItemSelected,
                    ]}
                    onPress={() => setSelectedHour(hour)}>
                    <Text
                      style={[
                        styles.pickerItemText,
                        selectedHour === hour &&
                          styles.pickerItemTextSelected,
                      ]}>
                      {String(hour).padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.divider} />

            <View style={styles.pickerColumn}>
              <Text style={styles.pickerLabel}>Minute</Text>
              <ScrollView
                style={styles.scrollView}
                snapToInterval={50}
                decelerationRate="fast"
                showsVerticalScrollIndicator={false}>
                {minutes.map(minute => (
                  <TouchableOpacity
                    key={minute}
                    style={[
                      styles.pickerItem,
                      selectedMinute === minute && styles.pickerItemSelected,
                    ]}
                    onPress={() => setSelectedMinute(minute)}>
                    <Text
                      style={[
                        styles.pickerItemText,
                        selectedMinute === minute &&
                          styles.pickerItemTextSelected,
                      ]}>
                      {String(minute).padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
};

const createStyles = colors => StyleSheet.create({
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  timeContent: {
    flex: 1,
  },
  timeLabel: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  timeValue: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.modal,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cancelButton: {
    fontSize: fontSize.regular,
    color: colors.text.secondary,
    fontWeight: fontWeight.semibold,
  },
  confirmButton: {
    fontSize: fontSize.regular,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  modalTitle: {
    fontSize: fontSize.regular,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  timePickerContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.lg,
  },
  pickerColumn: {
    flex: 1,
  },
  pickerLabel: {
    textAlign: 'center',
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  scrollView: {
    flex: 1,
  },
  pickerItem: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerItemSelected: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
  },
  pickerItemText: {
    fontSize: fontSize.xlarge,
    color: colors.text.secondary,
  },
  pickerItemTextSelected: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  divider: {
    width: 2,
    backgroundColor: colors.border,
  },
});

export default TimePicker;
