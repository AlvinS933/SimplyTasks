import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { createTask } from '../db/database';
 
function NewTaskScreen({ navigation }) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  // Stored as a JS Date object while editing; converted to a timestamp
  // (Date.getTime()) only at save time, to match the INTEGER column in SQLite.
  const [dueDate, setDueDate] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
 
  const canSave = title.trim().length > 0;
 
  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    await createTask({
      title: title.trim(),
      notes,
      dueDate: dueDate ? dueDate.getTime() : null,
    });
    setSaving(false);
    navigation.goBack();
  };
 
  // Fires on every interaction with the picker, including cancel.
  // On Android the picker is a modal dialog that closes itself, so we
  // hide our wrapper here too. On iOS it's inline, so it stays open
  // until the user taps "Done" (see the button below).
  const handleDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (event.type === 'dismissed') return; // user cancelled — keep old value
    if (selectedDate) setDueDate(selectedDate);
  };
 
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.header}>New Task</Text>
 
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Finish math homework"
            value={title}
            onChangeText={setTitle}
            autoFocus
          />
 
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Any extra details"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
 
          <Text style={styles.label}>Due Date (optional)</Text>
 
          {/* Android: a button that opens a native modal dialog. */}
          {Platform.OS === 'android' && (
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowPicker(true)}>
              <Text style={styles.dateButtonText}>
                {dueDate ? dueDate.toLocaleDateString() : 'Set a due date'}
              </Text>
            </TouchableOpacity>
          )}
 
          {Platform.OS === 'android' && showPicker && (
            <DateTimePicker
              value={dueDate ?? new Date()}
              mode="date"
              display="default"
              onChange={handleDateChange}
              minimumDate={new Date()}
            />
          )}
 
          {/* iOS: show the button to toggle the inline picker open/closed. */}
          {Platform.OS === 'ios' && (
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowPicker((v) => !v)}>
              <Text style={styles.dateButtonText}>
                {dueDate ? dueDate.toLocaleDateString() : 'Set a due date'}
              </Text>
            </TouchableOpacity>
          )}
 
          {Platform.OS === 'ios' && showPicker && (
            <View style={styles.iosPickerWrap}>
              <DateTimePicker
                value={dueDate ?? new Date()}
                mode="date"
                display="inline"
                onChange={handleDateChange}
                minimumDate={new Date()}
              />
              <TouchableOpacity style={styles.doneButton} onPress={() => setShowPicker(false)}>
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
 
          {!!dueDate && (
            <TouchableOpacity onPress={() => setDueDate(null)}>
              <Text style={styles.clearDate}>Clear due date</Text>
            </TouchableOpacity>
          )}
 
          <TouchableOpacity
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!canSave || saving}
          >
            <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save Task'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
 
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f8fa' },
  scroll: { padding: 20, paddingBottom: 60 },
  header: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  dateButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  dateButtonText: { fontSize: 15, color: '#333' },
  iosPickerWrap: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    overflow: 'hidden',
  },
  doneButton: { padding: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#eee' },
  doneButtonText: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
  clearDate: { color: '#e74c3c', fontSize: 13, marginTop: 8 },
  saveButton: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  saveButtonDisabled: { backgroundColor: '#ccc' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
 
export default NewTaskScreen;