import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../lib/AuthContext';

function AuthScreen() {
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === 'signup';

  const handleSubmit = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (isSignUp) {
        await signUp({ email, password, name });
      } else {
        await signIn({ email, password });
      }
      // On success the auth gate in App.js swaps to the app navigator; this
      // screen unmounts, so there's nothing to navigate to manually.
    } catch (e) {
      setError(e.message ?? 'Something went wrong.');
      setBusy(false);
    }
  };

  const toggleMode = () => {
    setError(null);
    setMode(isSignUp ? 'signin' : 'signup');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.brand}>SimplyTasks</Text>
          <Text style={styles.subtitle}>
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </Text>

          {isSignUp && (
            <>
              <Text style={styles.label}>Name (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Your name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="At least 6 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {isSignUp ? 'Sign Up' : 'Sign In'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={toggleMode} style={styles.switch}>
            <Text style={styles.switchText}>
              {isSignUp
                ? 'Already have an account? Sign in'
                : "New here? Create an account"}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f8fa' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  brand: { fontSize: 32, fontWeight: '800', textAlign: 'center' },
  subtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 28,
  },
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
  error: { color: '#e74c3c', fontSize: 13, marginTop: 14 },
  button: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  buttonDisabled: { backgroundColor: '#999' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  switch: { marginTop: 18, alignItems: 'center' },
  switchText: { color: '#007AFF', fontSize: 14, fontWeight: '600' },
});

export default AuthScreen;
