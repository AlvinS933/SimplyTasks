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
import { getListsForUser, deleteList } from '../db/database';
import { useAuth } from '../lib/AuthContext';
import { subscribeToSyncUpdates } from '../lib/sync';

function ListsScreen({ navigation }) {
  const { user, signOut, syncNow } = useAuth();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLists = useCallback(async () => {
    const rows = await getListsForUser(user.id);
    setLists(rows);
    setLoading(false);
  }, [user.id]);

  // Offline-first: render local data immediately, then sync in the background
  // and re-render with anything new that arrived.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        await loadLists();
        await syncNow();
        if (active) await loadLists();
      })();
      // Re-read whenever a sync applies remote changes (incl. realtime events).
      const unsub = subscribeToSyncUpdates(() => {
        if (active) loadLists();
      });
      return () => {
        active = false;
        unsub();
      };
    }, [loadLists, syncNow])
  );

  const handleLongPress = (item) => {
    const options = [{ text: 'Cancel', style: 'cancel' }];
    // Only the owner can delete the whole list; shared members just leave it.
    if (item.role === 'owner') {
      options.push({
        text: 'Delete list',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Delete list',
            `Delete "${item.name}" and all of its tasks? This cannot be undone.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await deleteList(item.id);
                  await loadLists();
                  syncNow();
                },
              },
            ]
          ),
      });
    }
    Alert.alert(item.name, 'What would you like to do?', options, { cancelable: true });
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('TaskList', { list: item })}
      onLongPress={() => handleLongPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.taskBody}>
        <Text style={styles.title}>{item.name}</Text>
        <Text style={styles.meta}>
          {item.open_count} open · {item.role === 'owner' ? 'owned by you' : 'shared with you'}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  const greeting = user.name || user.email;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Your Lists 📋</Text>
          <Text style={styles.headerSubtitle}>Signed in as {greeting}</Text>
        </View>
        <TouchableOpacity onPress={signOut} hitSlop={10}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {!loading && lists.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No lists yet.</Text>
          <Text style={styles.emptySubtext}>Create your first list below.</Text>
        </View>
      )}

      <FlatList
        data={lists}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => navigation.navigate('CreateList')}
        activeOpacity={0.85}
      >
        <Text style={styles.addButtonText}>+ New List</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f8fa' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 24, fontWeight: '700' },
  headerSubtitle: { fontSize: 13, color: '#888', marginTop: 2 },
  signOut: { color: '#e74c3c', fontSize: 14, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  taskBody: { flex: 1 },
  title: { fontSize: 17, fontWeight: '600' },
  meta: { fontSize: 13, color: '#888', marginTop: 3 },
  chevron: { fontSize: 26, color: '#ccc', marginLeft: 8 },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#555' },
  emptySubtext: { fontSize: 13, color: '#999', marginTop: 4 },
  addButton: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: '#111',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
  },
  addButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default ListsScreen;
