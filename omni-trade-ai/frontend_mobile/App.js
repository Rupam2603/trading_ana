import React from 'react';
import { StyleSheet, View, Text, ScrollView, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';

/**
 * OmniTrade Mobile: Mirroring the Web Dashboard using React Native.
 * In a real implementation, you would use 'react-native-wagmi-charts' 
 * or a WebView for TradingView charts on mobile.
 */

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>OMNITRADE <Text style={styles.highlight}>MOBILE</Text></Text>
      </View>

      <ScrollView style={styles.scroll}>
        {/* Signal Card */}
        <View style={styles.card}>
          <Text style={styles.label}>BTCUSD AI SIGNAL</Text>
          <Text style={[styles.signal, { color: '#10b981' }]}>STRONG BUY</Text>
          <View style={styles.gaugeContainer}>
            <View style={[styles.gaugeFill, { width: '88%' }]} />
          </View>
          <Text style={styles.confidence}>88.4% Confidence</Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.grid}>
          <View style={styles.miniCard}>
            <Text style={styles.miniLabel}>PRICE</Text>
            <Text style={styles.miniValue}>$65,432.10</Text>
          </View>
          <View style={styles.miniCard}>
            <Text style={styles.miniLabel}>24H VOL</Text>
            <Text style={styles.miniValue}>$1.2B</Text>
          </View>
        </View>

        {/* Terminal Mirror */}
        <View style={styles.terminal}>
          <Text style={styles.terminalText}>[02:15:01] AGENT: Analyzing macro sentiment...</Text>
          <Text style={styles.terminalText}>[02:15:02] TFT: Computing temporal dependencies...</Text>
          <Text style={styles.terminalText}>[02:15:03] SYS: Low-latency socket connected.</Text>
        </View>
      </ScrollView>

      {/* Ticker Switcher */}
      <View style={styles.tabBar}>
        {['BTC', 'XAU', 'EUR', 'NFT', 'BNF'].map(ticker => (
          <View key={ticker} style={styles.tabItem}>
            <Text style={styles.tabText}>{ticker}</Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#18181b',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -1,
  },
  highlight: {
    color: '#3b82f6',
  },
  scroll: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#09090b',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#18181b',
    marginBottom: 16,
  },
  label: {
    color: '#71717a',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  signal: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  gaugeContainer: {
    height: 6,
    backgroundColor: '#27272a',
    borderRadius: 3,
    marginBottom: 8,
  },
  gaugeFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 3,
  },
  confidence: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  miniCard: {
    flex: 1,
    backgroundColor: '#09090b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#18181b',
  },
  miniLabel: {
    color: '#71717a',
    fontSize: 10,
    fontWeight: 'bold',
  },
  miniValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 4,
  },
  terminal: {
    backgroundColor: '#000',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#18181b',
    minHeight: 120,
  },
  terminalText: {
    color: '#52525b',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#18181b',
    padding: 12,
    justifyContent: 'space-around',
  },
  tabItem: {
    padding: 8,
  },
  tabText: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: 'bold',
  }
});
