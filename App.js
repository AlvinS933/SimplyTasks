import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ListsScreen from './Screens/ListsScreen';
import TaskListScreen from './Screens/TaskListScreen';
import NewTaskScreen from './Screens/NewTaskScreen';
import CreateListScreen from './Screens/CreateListScreen';
import ShareListScreen from './Screens/ShareListScreen';
import AuthScreen from './Screens/AuthScreen';
import { initDatabase } from './db/database';
import { AuthProvider, useAuth } from './lib/AuthContext';

const Stack = createNativeStackNavigator();

function Splash({ label }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

// Chooses which stack to show based on whether someone is logged in.
function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) return <Splash label="Restoring session…" />;

  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator>
        {user ? (
          <>
            <Stack.Screen
              name="Lists"
              component={ListsScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="TaskList"
              component={TaskListScreen}
              options={{ title: 'Tasks' }}
            />
            <Stack.Screen
              name="NewTask"
              component={NewTaskScreen}
              options={{ title: 'New Task' }}
            />
            <Stack.Screen
              name="CreateList"
              component={CreateListScreen}
              options={{ title: 'New List' }}
            />
            <Stack.Screen
              name="ShareList"
              component={ShareListScreen}
              options={{ title: 'Share List' }}
            />
          </>
        ) : (
          <Stack.Screen
            name="Auth"
            component={AuthScreen}
            options={{ headerShown: false }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initDatabase().then(() => setReady(true));
  }, []);

  if (!ready) return <Splash label="Loading local database…" />;

  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#888' },
});
