/**
 * Smoke tests for HomeScreen — verifies HIG-redesigned content rendering,
 * the level-ring math fix (store's levelBounds, not the old linear formula),
 * and navigation wiring (gear -> Settings, Capture -> Tabs/Capture).
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { HomeScreen } from '../src/screens/HomeScreen';
import { lifeDexStore, levelBounds } from '../src/store/useLifeDexStore';

// ─── mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

// ─── tests ───────────────────────────────────────────────────────────────────

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lifeDexStore.reset();
  });

  it('renders the LifeDex wordmark (title1, not the letterspaced wordmark)', () => {
    const { getByText } = render(<HomeScreen />);
    expect(getByText('LifeDex')).toBeTruthy();
  });

  it('renders the subtitle', () => {
    const { getByText } = render(<HomeScreen />);
    expect(getByText('Track · Collect · Protect')).toBeTruthy();
  });

  it('renders a Settings gear button that navigates to Settings', () => {
    const { getByRole } = render(<HomeScreen />);
    const gear = getByRole('button', { name: 'Settings' });
    fireEvent.press(gear);
    expect(mockNavigate).toHaveBeenCalledWith('Settings');
  });

  it('shows the level from the store levelBounds ladder, not a linear formula', () => {
    const profile = lifeDexStore.getProfile();
    const lb = levelBounds(profile.xp);
    const { getByText } = render(<HomeScreen />);
    // Level number rendered inside the ring.
    expect(getByText(String(lb.level))).toBeTruthy();
    // "<toNext> XP to level <level+1>" caption.
    expect(
      getByText(`${lb.toNext.toLocaleString()} XP to level ${lb.level + 1}`),
    ).toBeTruthy();
  });

  it('renders stat cells for species, today, and total XP', () => {
    const { getByText } = render(<HomeScreen />);
    expect(getByText('Species')).toBeTruthy();
    expect(getByText('Today')).toBeTruthy();
    expect(getByText('Total XP')).toBeTruthy();
  });

  it('renders the Capture CTA and navigates to the Capture tab', () => {
    const { getByRole } = render(<HomeScreen />);
    const cta = getByRole('button', { name: 'Capture' });
    fireEvent.press(cta);
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Capture' });
  });

  it('renders the Recent discoveries section header', () => {
    const { getByText } = render(<HomeScreen />);
    expect(getByText('RECENT DISCOVERIES')).toBeTruthy();
  });

  it('renders discovery cards when sightings exist (mock mode is seeded)', () => {
    const { queryByText } = render(<HomeScreen />);
    const sightings = lifeDexStore.listSightings();
    expect(sightings.length).toBeGreaterThan(0);
    expect(queryByText(sightings[0]!.commonName)).toBeTruthy();
  });

  it('shows the Rare nearby section with a Simulated label in mock mode', () => {
    const { getByText } = render(<HomeScreen />);
    expect(getByText('RARE NEARBY')).toBeTruthy();
    expect(getByText('Simulated')).toBeTruthy();
  });
});
