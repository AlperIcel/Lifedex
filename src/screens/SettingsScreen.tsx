/**
 * SettingsScreen — grouped, game-style settings screen.
 *
 * Modal screen opened from the Home gear icon. Sections:
 *   - Profile              read-only explorer name/level/XP; rename is "coming soon"
 *   - Language              switch the app's display language (EN/DE)
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
import { useT, useLang, setLang, LANGS, LANG_LABEL } from '@/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const C = {
  en: {
    soon: 'SOON',
    title: 'Settings',
    done: 'Done',
    profile: 'Profile',
    changeDisplayName: 'Change display name',
    changeDisplayNameSub: 'Pick a new explorer name',
    language: 'Language',
    gameplay: 'Gameplay',
    distanceUnits: 'Distance units',
    distanceUnitsSub: 'Used for maps and distance readouts',
    haptics: 'Haptics',
    hapticsSub: 'Buzz on captures, taps and rewards',
    soundMusic: 'Sound & music',
    soundMusicSub: 'No audio yet — silent by design',
    notifications: 'Notifications',
    dailyReminder: 'Daily reminder',
    dailyReminderSub: 'A nudge to keep your streak alive',
    rareSpeciesNearby: 'Rare species nearby',
    rareSpeciesNearbySub: 'Alert when something rare is close',
    notificationsNote:
      'There is no notification backend yet. Nothing is scheduled or sent, and this section will ask for permission honestly once it does something.',
    privacyData: 'Privacy & data',
    privacyNote:
      'Your original photos and exact location never leave this device. Only an AI card and a fuzzed location are shared to the community feed.',
    exportData: 'Export my data',
    exportDataSub: 'Share a JSON copy of your captures',
    dataExportShareTitle: 'LifeDex data export',
    deleteAllData: 'Delete all my data',
    deleteConfirmTitle: 'Delete all data?',
    deleteConfirmMessage: 'This removes your captures, profile and signs you out. It cannot be undone.',
    cancel: 'Cancel',
    delete: 'Delete',
    info: 'Info',
    howItWorks: 'How it works',
    howItWorksSub: 'Discovery rules & how LifeDex treats wildlife',
    version: 'Version',
    tagline: "LifeDex — discover, don't disturb.",
    credits:
      'Species recognition is powered by the iNaturalist Computer Vision API and Pl@ntNet. Species facts and lore are sourced from Wikipedia. LifeDex is not affiliated with, and is not endorsed by, any of these projects.',
  },
  de: {
    soon: 'Bald',
    title: 'Einstellungen',
    done: 'Fertig',
    profile: 'Profil',
    changeDisplayName: 'Anzeigename ändern',
    changeDisplayNameSub: 'Wähle einen neuen Entdeckernamen',
    language: 'Sprache',
    gameplay: 'Gameplay',
    distanceUnits: 'Entfernungseinheiten',
    distanceUnitsSub: 'Wird für Karten und Entfernungsangaben verwendet',
    haptics: 'Haptik',
    hapticsSub: 'Vibriert bei Fängen, Taps und Belohnungen',
    soundMusic: 'Sound & Musik',
    soundMusicSub: 'Noch kein Ton — bewusst stumm',
    notifications: 'Benachrichtigungen',
    dailyReminder: 'Tägliche Erinnerung',
    dailyReminderSub: 'Ein Anstoß, damit deine Serie nicht abreißt',
    rareSpeciesNearby: 'Seltene Art in der Nähe',
    rareSpeciesNearbySub: 'Meldet sich, wenn etwas Seltenes in der Nähe ist',
    notificationsNote:
      'Es gibt noch kein Benachrichtigungs-Backend. Es wird nichts geplant oder gesendet — dieser Bereich fragt ehrlich um Erlaubnis, sobald er etwas tut.',
    privacyData: 'Privatsphäre & Daten',
    privacyNote:
      'Deine Originalfotos und dein genauer Standort verlassen nie dieses Gerät. Nur eine KI-Karte und ein unscharfer Standort werden im Community-Feed geteilt.',
    exportData: 'Daten exportieren',
    exportDataSub: 'Teile eine JSON-Kopie deiner Fänge',
    dataExportShareTitle: 'LifeDex-Datenexport',
    deleteAllData: 'Alle Daten löschen',
    deleteConfirmTitle: 'Alle Daten löschen?',
    deleteConfirmMessage: 'Das entfernt deine Fänge und dein Profil und meldet dich ab. Das kann nicht rückgängig gemacht werden.',
    cancel: 'Abbrechen',
    delete: 'Löschen',
    info: 'Info',
    howItWorks: 'Wie es funktioniert',
    howItWorksSub: 'Entdeckungsregeln & wie LifeDex mit Wildtieren umgeht',
    version: 'Version',
    tagline: 'LifeDex — entdecken, nicht stören.',
    credits:
      'Die Arterkennung nutzt die iNaturalist Computer Vision API und Pl@ntNet. Artfakten und Hintergrundwissen stammen von Wikipedia. LifeDex steht in keiner Verbindung zu diesen Projekten und wird von ihnen nicht unterstützt.',
  },
} as const;

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
  const t = useT(C);
  return (
    <View style={styles.soonBadge}>
      <Text style={styles.soonBadgeText}>{t('soon')}</Text>
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
  const t = useT(C);
  const lang = useLang();

  const exportData = async (): Promise<void> => {
    try {
      // Strip the private photo path — the export should not carry it.
      const captures = (await loadUserCaptures()).map((c) => ({
        ...c,
        sighting: { ...c.sighting, privatePhotoUri: undefined },
      }));
      const json = JSON.stringify({ profile: lifeDexStore.getProfile(), captures }, null, 2);
      await Share.share({ message: json, title: t('dataExportShareTitle') });
    } catch {
      // user cancelled or share unavailable
    }
  };

  const deleteAll = (): void => {
    Alert.alert(
      t('deleteConfirmTitle'),
      t('deleteConfirmMessage'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
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

  const avatarInitial = (profile.username.charAt(0) || '?').toUpperCase();

  return (
    <ScreenContainer
      largeTitle
      title={t('title')}
      scrollable
      rightAccessory={<Button title={t('done')} variant="ghost" size="sm" onPress={() => navigation.goBack()} />}
    >
      {/* ── Profile ── */}
      <SectionHeader title={t('profile')} />
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
          label={t('changeDisplayName')}
          subtitle={t('changeDisplayNameSub')}
          right={<SoonBadge />}
          disabled
        />
      </View>

      {/* ── Language ── */}
      <SectionHeader title={t('language')} />
      <View style={styles.card}>
        {LANGS.map((l, i) => (
          <React.Fragment key={l}>
            <SettingsRow
              icon="language-outline"
              label={LANG_LABEL[l]}
              onPress={() => {
                haptics.tap();
                setLang(l);
              }}
              right={
                lang === l ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : undefined
              }
            />
            {i < LANGS.length - 1 ? <View style={styles.sep} /> : null}
          </React.Fragment>
        ))}
      </View>

      {/* ── Gameplay ── */}
      <SectionHeader title={t('gameplay')} />
      <View style={styles.card}>
        <SettingsRow
          icon="speedometer-outline"
          label={t('distanceUnits')}
          subtitle={t('distanceUnitsSub')}
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
          label={t('haptics')}
          subtitle={t('hapticsSub')}
          right={
            <Switch
              value={settings.hapticsEnabled}
              onValueChange={handleHapticsToggle}
              trackColor={{ false: colors.surfaceHigh, true: colors.accent }}
              thumbColor={colors.textPrimary}
              ios_backgroundColor={colors.surfaceHigh}
              accessibilityLabel={t('haptics')}
            />
          }
        />
        <View style={styles.sep} />
        <SettingsRow
          icon="musical-notes-outline"
          iconColor={colors.textTertiary}
          label={t('soundMusic')}
          subtitle={t('soundMusicSub')}
          right={<SoonBadge />}
          disabled
        />
      </View>

      {/* ── Notifications ── */}
      <SectionHeader title={t('notifications')} />
      <View style={styles.card}>
        <SettingsRow
          icon="notifications-outline"
          iconColor={colors.textTertiary}
          label={t('dailyReminder')}
          subtitle={t('dailyReminderSub')}
          right={<SoonBadge />}
          disabled
        />
        <View style={styles.sep} />
        <SettingsRow
          icon="sparkles-outline"
          iconColor={colors.textTertiary}
          label={t('rareSpeciesNearby')}
          subtitle={t('rareSpeciesNearbySub')}
          right={<SoonBadge />}
          disabled
        />
      </View>
      <Text style={styles.note}>{t('notificationsNote')}</Text>

      {/* ── Privacy & data ── */}
      <SectionHeader title={t('privacyData')} />
      <Text style={styles.note}>{t('privacyNote')}</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="download-outline"
          label={t('exportData')}
          subtitle={t('exportDataSub')}
          onPress={() => void exportData()}
        />
        <View style={styles.sep} />
        <SettingsRow
          icon="trash-outline"
          label={t('deleteAllData')}
          destructive
          onPress={deleteAll}
        />
      </View>

      {/* ── Info ── */}
      <SectionHeader title={t('info')} />
      <View style={styles.card}>
        <SettingsRow
          icon="information-circle-outline"
          label={t('howItWorks')}
          subtitle={t('howItWorksSub')}
          onPress={() => navigation.navigate('Onboarding')}
          chevron
        />
        <View style={styles.sep} />
        <Row label={t('version')} value={appVersion} />
      </View>
      <View style={styles.card}>
        <View style={styles.aboutRow}>
          <Ionicons name="leaf-outline" size={18} color={colors.accent} />
          <Text style={styles.aboutText}>{t('tagline')}</Text>
        </View>
        <View style={styles.sep} />
        <Text style={styles.creditsText}>{t('credits')}</Text>
      </View>
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
