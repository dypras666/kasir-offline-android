const { withAppBuildGradle, withSettingsGradle, withMainApplication } = require('@expo/config-plugins');

module.exports = (config) => {
  config = withSettingsGradle(config, (config) => {
    if (!config.modResults.contents.includes("include ':react-native-esc-pos-printer'")) {
      config.modResults.contents += `\ninclude ':react-native-esc-pos-printer'\nproject(':react-native-esc-pos-printer').projectDir = new File(rootProject.projectDir, '../node_modules/react-native-esc-pos-printer/android')\n`;
    }
    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes("implementation project(':react-native-esc-pos-printer')")) {
      config.modResults.contents = config.modResults.contents.replace(
        /dependencies\s?{/,
        `dependencies {\n    implementation project(':react-native-esc-pos-printer')`
      );
    }
    return config;
  });

  config = withMainApplication(config, (config) => {
    const contents = config.modResults.contents;
    if (!contents.includes('import com.escposprinter.EscPosPrinterPackage')) {
      config.modResults.contents = contents.replace(
        /import\s+com\.facebook\.react\.PackageList/,
        `import com.escposprinter.EscPosPrinterPackage\nimport com.facebook.react.PackageList`
      );
      config.modResults.contents = config.modResults.contents.replace(
        /PackageList\(this\)\.packages\.apply\s?{/,
        `PackageList(this).packages.apply {\n          add(EscPosPrinterPackage())`
      );
    }
    return config;
  });

  return config;
};