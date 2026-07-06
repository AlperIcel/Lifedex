/**
 * SettingsScreen — profile, provider status, data & privacy, about.
 *
 * Modal screen opened from the Home gear icon. Everything here is local and
 * best-effort; Supabase calls are guarded no-ops when the backend is off.
 */
import React from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, ScreenContainer, SectionHeader } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/theme';
import { env } from '@/config/env';
import { lifeDexStore, useLifeDexStore } from '@/store/useLifeDexStore';
import { loadUserCaptures, clearUserCaptures } from '@/store/persistence';
import { supabase } from '@/lib/supabase';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function SettingsScreen({ navigation }: Props): React.JSX.Element {
  const { profile } = useLifeDexStore();

  const exportData = async (): Promise<void> => {
    try {
      // Strip the private photo path — the export should not carry it.
      const captures = (await loadUserCaptures()).map((c) => ({
        ...c,
        sighting: { ...c.sighting, privatePhotoUri: undefined },
      }));
      const json = JSON.stringify({ profile: lifeDexStore.getProfile(), captures }, null, 2);
      await Share.share({ message: json, title: 'LifeDex data export' });
    } catch {
      // user cancelled or share unavailable
    }
  };

  const deleteAll = (): void => {
    Alert.alert(
      'Delete all data?',
      'This removes your captures, profile and signs you out. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await clearUserCaptures();
              } catch {
                /* ignore */
              }
              try {
                if (supabase !== null) {
                  const { data } = await supabase.auth.getSession();
                  const uid = data.session?.user.id;
                  if (uid !== undefined) {
                    await supabase.from('community_sightings').delete().eq('user_id', uid);
                  }
                  await supabase.auth.signOut();
                }
              } catch {
                /* best-effort */
              }
              lifeDexStore.reset();
              navigation.navigate('Onboarding');
            })();
          },
        },
      ],
    );
  };

  const aiProvider = env.isMockAi ? 'Simulated (mock)' : 'Google Vision';
  const mapsProvider = env.isMockMaps ? 'Simulated map' : 'Native maps';
  const community = env.useSupabase ? 'On (anonymous)' : 'Off';

  return (
    <ScreenContainer
      largeTitle
      title="Settings"
      scrollable
      rightAccessory={<Button title="Done" variant="ghost" size="sm" onPress={() => navigation.goBack()} />}
    >
      <SectionHeader title="Profile" />
      <View style={styles.card}>
        <Row label="Explorer" value={profile.username} />
        <View style={styles.sep} />
        <Row label="Level" value={String(profile.level)} />
        <View style={styles.sep} />
        <Row label="Total XP" value={String(profile.xp)} />
      </View>

      <SectionHeader title="Providers" />
      <View style={styles.card}>
        <Row label="AI recognition" value={aiProvider} />
        <View style={styles.sep} />
        <Row label="Maps" value={mapsProvider} />
        <View style={styles.sep} />
        <Row label="Community" value={community} />
      </View>

      <SectionHeader title="Field rules" />
      <Button
        title="Review discovery rules"
        variant="secondary"
        icon="shield-half-outline"
        onPress={() => navigation.navigate('Onboarding')}
        style={styles.action}
      />

      <SectionHeader title="Data & privacy" />
      <Text style={styles.note}>
        Your original photos and exact location never leave this device. Only an AI card and a fuzzed
        location are shared to the community feed.
      </Text>
      <Button title="Export my data" variant="secondary" icon="download-outline" onPress={() => void exportData()} style={styles.action} />
      <Button title="Delete all my data" variant="destructive" icon="trash-outline" onPress={deleteAll} style={styles.action} />

      <SectionHeader title="About" />
      <View style={styles.aboutRow}>
        <Ionicons name="leaf-outline" size={18} color={colors.accent} />
        <Text style={styles.aboutText}>LifeDex — discover, don&apos;t disturb.</Text>
      </View>
      <Text style={styles.version}>Version 0.1.0</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  rowLabel: { ...typography.body, color: colors.textSecondary },
  rowValue: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  action: { marginBottom: spacing.sm },
  note: {
    ...typography.footnote,
    color: colors.textTertiary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  aboutText: { ...typography.callout, color: colors.textSecondary },
  version: { ...typography.caption, color: colors.textTertiary },
});
