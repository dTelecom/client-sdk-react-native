#!/usr/bin/env bash
set -euo pipefail

consumer=$(cd "${1:?supply an installed example directory}" && pwd)
simulator=${2:-}
if [[ -z "$simulator" ]]; then
  simulator=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
phones = [device for runtime, group in devices.items() if ".iOS-" in runtime
         for device in group if ".iPhone-" in device["deviceTypeIdentifier"]]
if not phones:
    sys.exit("Install an iPhone simulator runtime or provide a simulator UDID")
print(next((p for p in phones if p["state"] == "Booted"), phones[0])["udid"])
')
fi

xcrun simctl bootstatus "$simulator" -b
framework="$consumer/ios/Pods/LiveKitWebRTC/LiveKitWebRTC.xcframework/ios-arm64_x86_64-simulator"
source_file="$consumer/node_modules/@dtelecom/react-native-webrtc/tools/encrypted-video-smoke.m"
build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
xcrun --sdk iphonesimulator clang -fobjc-arc -target "$(uname -m)-apple-ios15.1-simulator" \
  -isysroot "$(xcrun --sdk iphonesimulator --show-sdk-path)" -F "$framework" \
  -framework Foundation -framework LiveKitWebRTC -Xlinker -rpath -Xlinker "$framework" \
  "$source_file" -o "$build/media-smoke"
for codec in h264 vp8; do
  for key_mode in match mismatch; do
    xcrun simctl spawn "$simulator" "$build/media-smoke" "$key_mode" "$codec"
  done
done
