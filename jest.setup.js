/* eslint-disable @typescript-eslint/no-var-requires */
// Mock AsyncStorage with the official in-memory mock so persistence code runs in
// tests without a native module.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Supabase deps pull native/runtime globals that don't exist in jest. The store
// runs with Supabase disabled in tests (no env), so the client is never created;
// these mocks just keep the imports from throwing at module load.
jest.mock('react-native-url-polyfill/auto', () => ({}));
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
