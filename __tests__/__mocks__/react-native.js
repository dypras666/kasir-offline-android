const React = require('react');

const reactNative = {
  Platform: { OS: 'web' },
  StyleSheet: {
    create: (styles) => styles,
  },
  Text: ({ children, style, ...props }) => React.createElement('span', props, children),
  View: ({ children, style, ...props }) => React.createElement('div', props, children),
  TextInput: ({ children, ...props }) => React.createElement('input', props),
  TouchableOpacity: ({ children, onPress, ...props }) => React.createElement('button', { onClick: onPress, ...props }, children),
  ScrollView: ({ children, ...props }) => React.createElement('div', { ...props }, children),
  Modal: ({ children, ...props }) => React.createElement('div', { ...props }, children),
  Alert: {
    alert: jest.fn(),
  },
  ActivityIndicator: () => React.createElement('span', null, 'loading'),
  Dimensions: {
    get: () => ({ width: 1024, height: 768 }),
  },
  Animated: {
    Value: class {
      constructor(val) { this._value = val; }
      setValue(val) { this._value = val; }
      interpolate() { return { __isInterpolated: true }; }
    },
    timing: () => ({ start: (cb) => cb && cb() }),
    View: 'div',
    Text: 'span',
  },
};

module.exports = reactNative;
