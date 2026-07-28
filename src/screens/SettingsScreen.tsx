/**
 * SettingsScreen — grouped, game-style settings screen.
 *
 * Modal screen opened from the Home gear icon. Sections:
 *   - Profile              read-only explorer name/level/XP; rename is "coming soon"
 *   - Gameplay              distance units (real), haptics (real), sound (coming soon)
 *   - Notifications         placeholder only — no backend, clearly marked
 *   - Privacy & data        data export, delete-all (pre-existing, unchanged behaviour)
 *   - Info                  how it works (discovery rules), app version, credits/attribution
 *   - Developer (__DEV__)   raw provider/backend status, hidden from real users
 *
 * Every row is either genuinely wired up or visibly badged "SOON" and
 * non-interactive — no toggle here silently no-ops. Everything here is local
 * and best-effort; Supabase calls are guarded no-ops when the backend is off.
 */
import React from 'react';
import { Alert, Pressable, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Chip, ScreenContainer, SectionHeader } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/theme';
import { env } from '@/config/env';
import { lifeDexStore, useLifeDexStore } from '@/store/useLifeDexStore';
import { loadUserCaptures, clearUserCaptures } from '@/store/persistence';
import { settingsStore, useSettings, type DistanceUnits } from '@/store/settings';
import { haptics } from '@/utils/haptics';
import { supabase } from '@/lib/supabase';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

/* ------------------------------------------------------------------ */
/* Small row primitives                                                */
/* ------------------------------------------------------------------ */

/** Simple label/value line — static info (version, provider status). */
function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/** Muted, non-interactive pill marking a feature that isn't built yet. */
function SoonBadge(): React.JSX.Element {
  return (
    <View style={styles.soonBadge}>
      <Text style={styles.soonBadgeText}>SOON</Text>
    </View>
  );
}

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  /** Icon tint + soft circle fill. Defaults to accent, or danger tint when destructive. */
  iconColor?: string;
  label: string;
  subtitle?: string;
  /** Trailing content — a Switch, a Chip pair, a SoonBadge, etc. */
  right?: React.ReactNode;
  /** Appends a disclosure chevron after `right` (for rows that push a screen). */
  chevron?: boolean;
  onPress?: () => void;
  /** Dims the row and drops the Pressable wrapper — used for "coming soon" rows. */
  disabled?: boolean;
  destructive?: boolean;
}

/** One icon + label(+subtitle) + trailing-content row, used inside a `card` container. */
function SettingsRow({
  icon,
  iconColor,
  label,
  subtitle,
  right,
  chevron = false,
  onPress,
  disabled = false,
  destructive = false,
}: SettingsRowProps): React.JSX.Element {
  const tint = destructive ? colors.danger : (iconColor ?? colors.accent);
  const titleColor = destructive ? colors.danger : colors.textPrimary;

  const body = (
    <View style={[styles.row2, disabled && styles.rowDisabled]}>
      <View style={[styles.rowIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={[styles.rowTitle, { color: titleColor }]} numberOfLines={1}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textTertiary}
          style={styles.chevronIcon}
        />
      ) : null}
    </View>
  );

  if (onPress && !disabled) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [pressed && styles.rowPressed]}
      >
        {body}
      </Pressable>
    );
  }

  return body;
}

/* ------------------------------------------------------------------ */
/* Screen                                                               */
/* ------------------------------------------------------------------ */

export function SettingsScreen({ navigation }: Props): React.JSX.Element {
  const { profile } = useLifeDexStore();
  const settings = useSettings();

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

  const handleUnitsChange = (units: DistanceUnits): void => {
    settingsStore.setUnits(units);
  };

  const handleHapticsToggle = (value: boolean): void => {
    settingsStore.setHapticsEnabled(value);
    // Fire a tap only when turning ON — an immediate, honest proof the toggle
    // works. When turning off, staying silent IS the correct behaviour.
    if (value) haptics.tap();
  };

  const appVersion = Constants.expoConfig?.version ?? '0.1.0';
  const aiProvider = env.isMockAi ? 'Simulated (mock)' : 'Google Vision';
  const mapsProvider = env.isMockMaps ? 'Simulated map' : 'Native maps';
  const community = env.useSupabase ? 'On (anonymous)' : 'Off';

  const avatarInitial = (profile.username.charAt(0) || '?').toUpperCase();

  return (
    <ScreenContainer
      largeTitle
      title="Settings"
      scrollable
      rightAccessory={<Button title="Done" variant="ghost" size="sm" onPress={() => navigation.goBack()} />}
    >
      {/* ── Profile ── */}
      <SectionHeader title="Profile" />
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{avatarInitial}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName} numberOfLines={1}>
            {profile.username}
          </Text>
          <View style={styles.profileMetaRow}>
            <View style={styles.levelPill}>
              <Text style={styles.levelPillText}>LVL {profile.level}</Text>
            </View>
            <Text style={styles.xpText}>{profile.xp} XP</Text>
          </View>
        </View>
      </View>
      <View style={styles.card}>
        <SettingsRow
          icon="person-outline"
          iconColor={colors.textTertiary}
          label="Change display name"
          subtitle="Pick a new explorer name"
          right={<SoonBadge />}
          disabled
        />
      </View>

      {/* ── Gameplay ── */}
      <SectionHeader title="Gameplay" />
      <View style={styles.card}>
        <SettingsRow
          icon="speedometer-outline"
          label="Distance units"
          subtitle="Used for maps and distance readouts"
          right={
            <View style={styles.unitsToggle}>
              <Chip label="KM" selected={settings.units === 'km'} onPress={() => handleUnitsChange('km')} />
              <Chip label="MI" selected={settings.units === 'mi'} onPress={() => handleUnitsChange('mi')} />
            </View>
          }
        />
        <View style={styles.sep} />
        <SettingsRow
          icon="phone-portrait-outline"
          label="Haptics"
          subtitle="Buzz on captures, taps and rewards"
          right={
            <Switch
              value={settings.hapticsEnabled}
              onValueChange={handleHapticsToggle}
              trackColor={{ false: colors.surfaceHigh, true: colors.accent }}
              thumbColor={colors.textPrimary}
              ios_backgroundColor={colors.surfaceHigh}
              accessibilityLabel="Haptics"
            />
          }
        />
        <View style={styles.sep} />
        <SettingsRow
          icon="musical-notes-outline"
          iconColor={colors.textTertiary}
          label="Sound & music"
          subtitle="No audio yet — silent by design"
          right={<SoonBadge />}
          disabled
        />
      </View>

      {/* ── Notifications ── */}
      <SectionHeader title="Notifications" />
      <View style={styles.card}>
        <SettingsRow
          icon="notifications-outline"
          iconColor={colors.textTertiary}
          label="Daily reminder"
          subtitle="A nudge to keep your streak alive"
          right={<SoonBadge />}
          disabled
        />
        <View style={styles.sep} />
        <SettingsRow
          icon="sparkles-outline"
          iconColor={colors.textTertiary}
          label="Rare species nearby"
          subtitle="Alert when something rare is close"
          right={<SoonBadge />}
          disabled
        />
      </View>
      <Text style={styles.note}>
        There is no notification backend yet. Nothing is scheduled or sent, and this section will ask
        for permission honestly once it does something.
      </Text>

      {/* ── Privacy & data ── */}
      <SectionHeader title="Privacy & data" />
      <Text style={styles.note}>
        Your original photos and exact location never leave this device. Only an AI card and a fuzzed
        location are shared to the community feed.
      </Text>
      <View style={styles.card}>
        <SettingsRow
          icon="download-outline"
          label="Export my data"
          subtitle="Share a JSON copy of your captures"
          onPress={() => void exportData()}
        />
        <View style={styles.sep} />
        <SettingsRow
          icon="trash-outline"
          label="Delete all my data"
          destructive
          onPress={deleteAll}
        />
      </View>

      {/* ── Info ── */}
      <SectionHeader title="Info" />
      <View style={styles.card}>
        <SettingsRow
          icon="information-circle-outline"
          label="How it works"
          subtitle="Discovery rules & how LifeDex treats wildlife"
          onPress={() => navigation.navigate('Onboarding')}
          chevron
        />
        <View style={styles.sep} />
        <Row label="Version" value={appVersion} />
      </View>
      <View style={styles.card}>
        <View style={styles.aboutRow}>
          <Ionicons name="leaf-outline" size={18} color={colors.accent} />
          <Text style={styles.aboutText}>LifeDex — discover, don&apos;t disturb.</Text>
        </View>
        <View style={styles.sep} />
        <Text style={styles.creditsText}>
          Species recognition is powered by the iNaturalist Computer Vision API and Pl@ntNet. Species
          facts and lore are sourced from Wikipedia. LifeDex is not affiliated with, and is not
          endorsed by, any of these projects.
        </Text>
      </View>

      {/* ── Developer (hidden from real users; __DEV__ only) ── */}
      {__DEV__ ? (
        <>
          <SectionHeader title="Developer" />
          <View style={styles.card}>
            <Row label="AI recognition" value={aiProvider} />
            <View style={styles.sep} />
            <Row label="Maps" value={mapsProvider} />
            <View style={styles.sep} />
            <Row label="Community" value={community} />
          </View>
        </>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  /* Legacy single-line label/value row (Version, Developer section) */
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
  note: {
    ...typography.footnote,
    color: colors.textTertiary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },

  /* Profile header card */
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.accent,
  },
  profileInfo: { flex: 1 },
  profileName: {
    ...typography.headline,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  profileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  levelPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  levelPillText: {
    ...typography.label,
    color: colors.onAccent,
  },
  xpText: {
    ...typography.footnote,
    color: colors.textSecondary,
  },

  /* Icon + label(+subtitle) + trailing-content row */
  row2: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 4,
    gap: spacing.sm + 2,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    ...typography.callout,
    fontWeight: '600',
  },
  rowSubtitle: {
    ...typography.footnote,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chevronIcon: {
    marginLeft: spacing.xs,
  },
  unitsToggle: {
    flexDirection: 'row',
    gap: spacing.xs,
  },

  /* "Coming soon" badge */
  soonBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  soonBadgeText: {
    ...typography.label,
    color: colors.textTertiary,
  },

  /* About / credits */
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  aboutText: { ...typography.callout, color: colors.textSecondary },
  creditsText: {
    ...typography.footnote,
    color: colors.textTertiary,
    lineHeight: 18,
    paddingVertical: spacing.md,
  },
});
