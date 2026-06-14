import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Critical Error</Text>
          <ScrollView style={styles.scroll}>
            <Text style={styles.error}>{this.state.error?.toString()}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 40, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: 'red', marginBottom: 20 },
  scroll: { backgroundColor: '#f0f0f0', padding: 10, borderRadius: 5 },
  error: { fontFamily: 'monospace', color: '#333' }
});
