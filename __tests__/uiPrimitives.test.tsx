/**
 * Render tests for the shared UI primitives (design sprint F2).
 *
 * Covers:
 *   - Button: renders title, fires onPress, blocks press when disabled/loading,
 *     shows a spinner while loading.
 *   - EmptyState: renders icon/title/message and wires the optional action.
 *   - Chip: renders label, reflects selected state, fires onPress.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { Button } from '../src/components/Button';
import { Chip } from '../src/components/Chip';
import { EmptyState } from '../src/components/EmptyState';

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

describe('Button', () => {
  it('renders its title', () => {
    const { getByText } = render(
      <Button title="Catch it" onPress={() => {}} variant="primary" />,
    );
    expect(getByText('Catch it')).toBeTruthy();
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button title="Go" onPress={onPress} variant="secondary" />,
    );
    fireEvent.press(getByText('Go'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button title="Nope" onPress={onPress} variant="primary" disabled />,
    );
    fireEvent.press(getByText('Nope'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a spinner and blocks presses while loading', () => {
    const onPress = jest.fn();
    const { getByTestId, getByText } = render(
      <Button title="Saving" onPress={onPress} variant="primary" loading />,
    );
    expect(getByTestId('button-loading')).toBeTruthy();
    // Label stays mounted (width preservation), but presses are blocked.
    fireEvent.press(getByText('Saving'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders every variant without crashing', () => {
    const variants = ['primary', 'secondary', 'ghost', 'destructive'] as const;
    for (const variant of variants) {
      const { getByText, unmount } = render(
        <Button title={variant} onPress={() => {}} variant={variant} />,
      );
      expect(getByText(variant)).toBeTruthy();
      unmount();
    }
  });
});

/* ------------------------------------------------------------------ */
/* EmptyState                                                          */
/* ------------------------------------------------------------------ */

describe('EmptyState', () => {
  it('renders title and message', () => {
    const { getByText } = render(
      <EmptyState
        icon="leaf-outline"
        title="Nothing here yet"
        message="Go outside and capture your first sighting."
      />,
    );
    expect(getByText('Nothing here yet')).toBeTruthy();
    expect(getByText('Go outside and capture your first sighting.')).toBeTruthy();
  });

  it('renders no action button when actionTitle is omitted', () => {
    const { queryByText } = render(
      <EmptyState icon="leaf-outline" title="Empty" message="Nothing." />,
    );
    expect(queryByText('Retry')).toBeNull();
  });

  it('renders the action button and fires onAction', () => {
    const onAction = jest.fn();
    const { getByText } = render(
      <EmptyState
        icon="camera-outline"
        title="No captures"
        message="Start your collection."
        actionTitle="Open camera"
        onAction={onAction}
      />,
    );
    fireEvent.press(getByText('Open camera'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/* Chip                                                                */
/* ------------------------------------------------------------------ */

describe('Chip', () => {
  it('renders its label', () => {
    const { getByText } = render(
      <Chip label="Rare" selected={false} onPress={() => {}} />,
    );
    expect(getByText('Rare')).toBeTruthy();
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Chip label="Plants" selected={false} onPress={onPress} />,
    );
    fireEvent.press(getByText('Plants'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes its selected state for accessibility', () => {
    const { getByRole, rerender } = render(
      <Chip label="Epic" selected={false} onPress={() => {}} />,
    );
    expect(getByRole('button', { selected: false })).toBeTruthy();

    rerender(<Chip label="Epic" selected onPress={() => {}} />);
    expect(getByRole('button', { selected: true })).toBeTruthy();
  });
});
