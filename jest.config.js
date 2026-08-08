module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-.*|@react-native-.*)/)',
  ],
  moduleNameMapper: {
    // RN 0.80 ships a jest setup that references this mock without including it
    'RefreshControl/__mocks__/RefreshControlMock':
      'react-native/Libraries/Components/RefreshControl/RefreshControl',
  },
};
