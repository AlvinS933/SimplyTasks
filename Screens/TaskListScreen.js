import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getAllTasks, toggleTaskComplete, deleteTask, deleteAllTasks} from '../db/database';
 
function TaskListScreen({ navigation }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
 
  const loadTasks = useCallback(async () => {
    const rows = await getAllTasks();
    setTasks(rows);
    setLoading(false);
  }, []);
 
  useFocusEffect(
    useCallback(() => {
      loadTasks();
    }, [loadTasks])
  );
 
  const handleToggle = async (task) => {
    await toggleTaskComplete(task.id, task.completed ? 0 : 1);
    loadTasks();
  };
 
  const handleDelete = async (id) => {
    await deleteTask(id);
    loadTasks();
  };

  const handleClearAll = async () => {
    await deleteAllTasks();
    loadTasks();
  };

  // Long-press now opens a native action sheet instead of deleting
  // immediately. Alert.alert's buttons array controls both the options
  // shown and what happens when each is tapped.
  const handleLongPress = (item) => {
    Alert.alert(
      item.title,
      'What would you like to do?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Edit', onPress: () => navigation.navigate('NewTask', { task: item }) },
        { text: 'Delete', style: 'destructive', onPress: () => handleDelete(item.id) },
      ],
      { cancelable: true }
    );
  };
 
 
  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => handleToggle(item)}
      onLongPress={() => handleLongPress(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.checkbox, !!item.completed && styles.checkboxChecked]}>
        {!!item.completed && <Text style={styles.checkmark}>✓</Text>}
      </View>
 
      <View style={styles.taskBody}>
        <Text style={[styles.title, !!item.completed && styles.titleCompleted]}>
          {item.title}
        </Text>
        {!!item.notes && (
          <Text style={styles.notes} numberOfLines={1}>
            {item.notes}
          </Text>
        )}
        {!!item.due_date && (
          <Text style={styles.dueDate}>
            Due {new Date(item.due_date).toLocaleDateString()}
          </Text>
        )}
      </View>
 
      <Text style={item.synced ? styles.syncedBadge : styles.pendingBadge}>
        {item.synced ? '☁' : '●'}
      </Text>
    </TouchableOpacity>
  );
 
  const pendingCount = tasks.filter((t) => !t.completed).length;
 
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tasks📋: {new Date().toLocaleDateString()}</Text>
        <Text style={styles.headerSubtitle}>
          {pendingCount} open · {tasks.length - pendingCount} done · stored on this device
        </Text>
      </View>
 
      {!loading && tasks.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No tasks yet.</Text>
          <Text style={styles.emptySubtext}>Add your first one below.</Text>
        </View>
      )}
 
      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
 
      <TouchableOpacity
        style={[styles.addButton, styles.newButton]}
        onPress={() => navigation.navigate('NewTask')}
        activeOpacity={0.85}
      >
        <Text style={styles.addButtonText}>+ New Task</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.addButton, styles.clearButton, tasks.length === 0 && styles.clearButtonDisabled]}
        onPress={() => Alert.alert(
          'Clear All Tasks',
          'Are you sure you want to delete all tasks? This action cannot be undone.', [
            {
              text: 'Cancel',
              style: 'cancel'
            },
            {
              text: 'Delete All',
              style: 'destructive',
              onPress: handleClearAll
            }
          ])
        }
        disabled = {tasks.length === 0}
        activeOpacity={0.85}
      >
        <Text style={styles.addButtonText}>- Clear Tasks</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
 
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f8fa' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 24, fontWeight: '700' },
  headerSubtitle: { fontSize: 13, color: '#888', marginTop: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: { backgroundColor: '#2ecc71', borderColor: '#2ecc71' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  taskBody: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  titleCompleted: { textDecorationLine: 'line-through', color: '#aaa' },
  notes: { fontSize: 13, color: '#888', marginTop: 2 },
  dueDate: { fontSize: 12, color: '#e67e22', marginTop: 2 },
  syncedBadge: { fontSize: 14, color: '#2ecc71', marginLeft: 8 },
  pendingBadge: { fontSize: 14, color: '#e67e22', marginLeft: 8 },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#555' },
  emptySubtext: { fontSize: 13, color: '#999', marginTop: 4 },
  addButton: {
    position: 'absolute',
    bottom: 24,
    backgroundColor: '#111',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
  },
  newButton: {
  left: 36,
  },
  clearButton: {
    right: 36,
    backgroundColor: '#e74c3c',
  },
  clearButtonDisabled: {
  opacity: 0.4,
  },
  addButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
 
export default TaskListScreen;
 