# Android emulator loads Metro but hangs fetching providers

The Pixel_9 emulator could load the app through `adb reverse`, but external
hostname lookups timed out. Android's connected Wi-Fi network lacked the
`VALIDATED` capability, and resolver logs showed DNS timeouts. The host could
reach TMDB. Restarting the app and reconnecting Wi-Fi did not restore DNS.

A cold boot with explicit DNS servers restored resolution without wiping data:

```sh
adb -s emulator-5554 emu kill
"$HOME/Library/Android/sdk/emulator/emulator" -avd Pixel_9 -no-snapshot-load -dns-server 1.1.1.1,8.8.8.8
```

Once booted, restore Metro forwarding and open the dev client against localhost:

```sh
adb -s emulator-5554 reverse tcp:8081 tcp:8081
```

Verify external resolution separately from Metro with
`adb -s emulator-5554 shell 'timeout 10 ping -c 1 api.themoviedb.org'`.
Metro reachability alone does not establish internet connectivity. Use the
current device serial and AVD name if they differ. No app or dependency change
is needed for this emulator failure.
