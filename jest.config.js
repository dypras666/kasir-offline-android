module.exports = {
  testEnvironment: 'jsdom',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo-secure-store|expo-|axios)/)',
  ],
  moduleNameMapper: {
    '^expo-secure-store$': '<rootDir>/__tests__/__mocks__/expo-secure-store.js',
    '^react-native$': '<rootDir>/__tests__/__mocks__/react-native.js',
  },
  setupFiles: [],
  testMatch: ['**/__tests__/**/*.test.js'],
};
