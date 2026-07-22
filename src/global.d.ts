declare module '*.css'

// Static image assets resolve to a Metro asset module id (svg stays a plain
// asset — expo-image renders it on every platform; no react-native-svg).
declare module '*.svg' {
  const asset: number;
  export default asset;
}

declare module '*.png' {
  const asset: number;
  export default asset;
}

declare module '*.ttf' {
  const asset: number;
  export default asset;
}
