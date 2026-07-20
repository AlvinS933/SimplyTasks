import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getMembersForList } from '../db/database';
import { shareList } from '../lib/sync';
import { useAuth } from '../lib/AuthContext';

function ShareListScreen({ route }) {
  const { list } = route.params;
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [members, setMembers] = useState([]);
  const [message, setMessage] = useState(null); // { type: 'ok' | 'error', text }
  const [busy, setBusy] = useState(false);

  const loadMembers = useCallback(async () => {
    setMembers(await getMembersForList(list.id));
  }, [list.id]);

  useFocusEffect(
    useCallback(() => {
      loadMembers();
    }, [loadMembers])
  );

  const handleShare = async () => {
    if (busy || !email.trim()) return;
    setBusy(true);
    setMessage(null);
    const result = await shareList(list.id, email, user.id);
    if (result.ok) {
      setMessage({ type: 'ok', text: `Shared with ${result.user.email}.` });
      setEmail('');
      loadMembers();
    } else if (result.reason === 'not_found') {
      setMessage({
        type: 'error',
        text: 'No account found with that email. They need to sign up first.',
      });
    } else if (result.reason === 'already_member') {
      setMessage({ type: 'error', text: 'That person is already on this list.' });
    } else if (result.reason === 'not_configured') {
      setMessage({ type: 'error', text: 'Sharing needs Supabase configured (see supabase/README.md).' });
    } else {
      setMessage({ type: 'error', text: 'Could not share right now — check your connection.' });
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.label}>Invite by email</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="person@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.shareButton, busy && styles.disabled]}
              onPress={handleShare}
              disabled={busy}
            >
              <Text style={styles.shareButtonText}>Share</Text>
            </TouchableOpacity>
          </View>

          {!!message && (
            <Text style={message.type === 'ok' ? styles.ok : styles.error}>
              {message.text}
            </Text>
          )}

          <Text style={[styles.label, { marginTop: 24 }]}>
            People with access ({members.length})
          </Text>
          <FlatList
            data={members}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <View style={styles.memberRow}>
                <Text style={styles.memberName}>{item.name || item.email}</Text>
                <Text style={styles.memberRole}>{item.role}</Text>
              </View>
            )}
          />
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f8fa' },
  inner: { flex: 1, padding: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  shareButton: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 13,
    marginLeft: 8,
  },
  disabled: { backgroundColor: '#999' },
  shareButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  ok: { color: '#2ecc71', fontSize: 13, marginTop: 10 },
  error: { color: '#e74c3c', fontSize: 13, marginTop: 10 },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  memberName: { fontSize: 15, fontWeight: '500' },
  memberRole: { fontSize: 13, color: '#888', textTransform: 'capitalize' },
});

export default ShareListScreen;
