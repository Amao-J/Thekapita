import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function TabLayout() {
  return (
    <NativeTabs tintColor="#2563eb" labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="HomeScreen">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          md={{ default: 'home', selected: 'home' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="WalletScreen">
        <NativeTabs.Trigger.Label>Wallet</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'creditcard', selected: 'creditcard.fill' }}
          md={{ default: 'account_balance_wallet', selected: 'account_balance_wallet' }}
        />
      </NativeTabs.Trigger>


       <NativeTabs.Trigger name="Rides">
        <NativeTabs.Trigger.Label>Rides</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'car', selected: 'car.fill' }}
          md={{ default: 'directions_car', selected: 'directions_car' }}
        />
      </NativeTabs.Trigger>

       <NativeTabs.Trigger name="Food">
        <NativeTabs.Trigger.Label>Food</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'fork.knife', selected: 'fork.knife' }}
          md={{ default: 'lunch_dining', selected: 'lunch_dining' }}
        />
      </NativeTabs.Trigger>

      {/* <NativeTabs.Trigger name="Explore">
        <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'safari', selected: 'safari.fill' }}
          md={{ default: 'explore', selected: 'explore' }}
        />
      </NativeTabs.Trigger> */}
    </NativeTabs>
  );
}
