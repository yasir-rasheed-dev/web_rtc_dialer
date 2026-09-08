module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo (SDK 50+) already injects the
    // react-native-reanimated plugin when reanimated is installed — adding
    // it here again breaks with reanimated 3.16.x (it starts looking for
    // react-native-worklets/plugin). NativeWind's preset handles the rest.
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel"
    ]
  };
};
