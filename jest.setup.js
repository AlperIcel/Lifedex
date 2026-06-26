/* eslint-disable @typescript-eslint/no-var-requires */
// Mock AsyncStorage with the official in-memory mock so persistence code runs in
// tests without a native module.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
