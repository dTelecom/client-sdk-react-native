# SDK integration checks

## Encrypted video on iOS

Install the [Rooms example](../example/README.md#run) and its CocoaPods dependencies. From the SDK checkout, run the following command.

```sh
bash ci/encrypted-media/check-ios.sh example
```

Pass a simulator UDID as the second argument to choose an iPhone simulator. The check uses local WebRTC peers and generated video to exercise H.264 and VP8 with matching keys, mismatched keys, key correction and track replacement.
