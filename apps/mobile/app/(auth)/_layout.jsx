import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";

export default function TabLayout() {


  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false, // or true if you want headers
        }}
      >
        <Stack.Screen name="LandingScreen" />
        <Stack.Screen name="SignInScreen" />
      </Stack>

      <StatusBar backgroundColor="#161622" style="dark" />
    </>

  );
}
