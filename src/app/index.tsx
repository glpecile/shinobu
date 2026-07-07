import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";

export default function App() {
  return (
    <View className="flex-1 bg-background items-center justify-center px-8">
      <Text className="text-4xl font-display text-foreground mb-3 tracking-tight">
        忍 Shinobu
      </Text>

      <Text className="text-xl font-sans text-foreground mb-8 text-center leading-relaxed">
        Log it once,{" "}
        <Text className="text-accent font-sans-semibold">
          everywhere it belongs
        </Text>
        .
      </Text>

      <Text className="text-base font-sans text-muted text-center max-w-sm">
        Colors live in{" "}
        <Text className="font-sans-semibold text-foreground">
          src/global.css
        </Text>{" "}
        as theme tokens — use those classes, never raw hex.
      </Text>

      <StatusBar style="auto" />
    </View>
  );
}
