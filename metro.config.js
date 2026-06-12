const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add .wasm to the asset extensions so Metro can bundle them
config.resolver.assetExts.push('wasm');

// Ensure .wasm files are handled as assets
config.transformer.assetPlugins = config.transformer.assetPlugins || [];

module.exports = config;
