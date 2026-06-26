/**
 * Smoke tests for OnboardingScreen — verifies content rendering and
 * navigation contract without requiring a device/emulator.
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

  it('renders the hero headline', () => {
    const { getByText } = renderScreen();
    expect(getByText(/Discover\. Collect\./)).toBeTruthy();
  });

  it('shows all three step badges', () => {
    const { getByText } = renderScreen();
    expect(getByText('RULE 01')).toBeTruthy();
    expect(getByText('RULE 02')).toBeTruthy();
    expect(getByText('RULE 03')).toBeTruthy();
  });

  it('shows all three card titles', () => {
    const { getByText } = renderScreen();
    expect(getByText('Respect the Wild')).toBeTruthy();
    expect(getByText('Honor Boundaries')).toBeTruthy();
    expect(getByText('Protect the Rare')).toBeTruthy();
  });

  it('shows key rule text', () => {
    const { getByText } = renderScreen();
    expect(getByText(/Never disturb nests/)).toBeTruthy();
    expect(getByText(/Stay on public land/)).toBeTruthy();
    expect(getByText(/original photo stays private/)).toBeTruthy();
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
    const ctaBtn = getByRole('button', { name: /Next|Got it/ });
    expect(ctaBtn).toBeTruthy();
  });

  it('shows progress "1 of 3"', () => {
    const { getByText } = renderScreen();
    expect(getByText('1 of 3')).toBeTruthy();
  });
});
