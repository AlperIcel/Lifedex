/**
 * Smoke tests for OnboardingScreen — verifies content rendering and
 * navigation contract without requiring a device/emulator.
 *
 * The screen is "wonder first": slide 1 shows an example card + the core
 * promise (no rules yet), slide 2 condenses the ethics into one pledge.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { OnboardingScreen } from '../src/screens/OnboardingScreen';

// ─── mocks ────────────────────────────────────────────────────────────────────

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: jest.fn(),
}));

const mockReplace = jest.fn();
const mockNavigation = {
  replace: mockReplace,
  navigate: jest.fn(),
  goBack: jest.fn(),
  dispatch: jest.fn(),
  reset: jest.fn(),
  setParams: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  removeListener: jest.fn(),
  isFocused: jest.fn(() => true),
  canGoBack: jest.fn(() => false),
  getParent: jest.fn(),
  getState: jest.fn(),
  setOptions: jest.fn(),
  getId: jest.fn(),
};

const mockRoute = { key: 'Onboarding', name: 'Onboarding' as const, params: undefined };

function renderScreen() {
  return render(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <OnboardingScreen navigation={mockNavigation as any} route={mockRoute as any} />,
  );
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the LifeDex wordmark', () => {
    const { getByText } = renderScreen();
    expect(getByText('LifeDex')).toBeTruthy();
  });

  it('renders the wonder headline — the core promise, before any rule', () => {
    const { getByText } = renderScreen();
    expect(getByText(/Turn the real world into your collection/)).toBeTruthy();
  });

  it('leads with an example card, not a rules checklist', () => {
    const { getAllByText, getByText, queryByText } = renderScreen();
    // The "wow" — a fully-dressed example card is visible immediately.
    // "Red Fox" appears twice by design: once inside the card art placeholder
    // (MockCardImage draws the name into the artwork) and once in the card's
    // name label below it — exactly like a real caught card would.
    expect(getAllByText('Red Fox').length).toBeGreaterThan(0);
    expect(getByText('Vulpes vulpes')).toBeTruthy();
    expect(getByText('NEW DISCOVERY')).toBeTruthy();
    expect(getByText('LEGENDARY')).toBeTruthy();
    // Old "RULE 01 / RULE 02 / RULE 03" gate must be gone.
    expect(queryByText(/RULE 0\d/)).toBeNull();
  });

  it('shows the pledge title condensing the ethics into one promise', () => {
    const { getByText } = renderScreen();
    expect(getByText(/Discover, don.t disturb\./)).toBeTruthy();
  });

  it('shows the 3 condensed key points on the pledge screen', () => {
    const { getByText } = renderScreen();
    expect(getByText(/Keep your distance/)).toBeTruthy();
    expect(getByText(/Stay on public trails/)).toBeTruthy();
    expect(getByText(/Rare & protected species/)).toBeTruthy();
  });

  it('renders a Skip button', () => {
    const { getByRole } = renderScreen();
    const skipBtn = getByRole('button', { name: /Skip onboarding/ });
    expect(skipBtn).toBeTruthy();
  });

  it('Skip navigates to Tabs', () => {
    const { getByRole } = renderScreen();
    fireEvent.press(getByRole('button', { name: /Skip onboarding/ }));
    expect(mockReplace).toHaveBeenCalledWith('Tabs', { screen: 'Home' });
  });

  it('renders the CTA button', () => {
    const { getByRole } = renderScreen();
    const ctaBtn = getByRole('button', { name: /Continue|Get Started/ });
    expect(ctaBtn).toBeTruthy();
  });

  it('shows progress "1 of 2" — a 2-screen flow, not 3', () => {
    const { getByText } = renderScreen();
    expect(getByText('1 of 2')).toBeTruthy();
  });
});
