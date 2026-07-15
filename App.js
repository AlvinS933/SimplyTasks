import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TaskListScreen from './Screens/TaskListScreen';
import NewTaskScreen from './Screens/NewTaskScreen';
import { initDatabase } from './db/database';
 
const Stack = createNativeStackNavigator();
 
export default function App() {
  const [ready, setReady] = useState(false);
 
  useEffect(() => {
    initDatabase().then(() => setReady(true));
  }, []);
 
  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading local database…</Text>
      </View>
    );
  }
 
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator initialRouteName="TaskList" screenOptions={{ headerShown: true }}>
        <Stack.Screen
          name="TaskList"
          component={TaskListScreen}
          options={{ title: 'Tasks', headerShown: false }}
        />
        <Stack.Screen
          name="NewTask"
          component={NewTaskScreen}
          options={{ title: 'New Task' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
 
const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#888' },
});