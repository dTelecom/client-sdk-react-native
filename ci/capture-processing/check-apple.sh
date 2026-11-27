#!/usr/bin/env bash
set -euo pipefail

# Exercise the package files that the example installed and the same pod used for its iOS build.
consumer=$(cd "${1:?supply the installed example root}" && pwd)
fixture=$(cd "$(dirname "$0")" && pwd)
wrapper="$consumer/node_modules/@dtelecom/react-native/ios"
bridge="$consumer/node_modules/@dtelecom/react-native-webrtc/ios/RCTWebRTC"
frameworks="$consumer/ios/Pods/LiveKitWebRTC/LiveKitWebRTC.xcframework/macos-arm64_x86_64"

build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
xcrun --sdk macosx clang -fobjc-arc -fmodules -UNDEBUG \
  -I"$wrapper" -I"$bridge" -F"$frameworks" \
  -framework Foundation -framework LiveKitWebRTC -Xlinker -rpath -Xlinker "$frameworks" \
  "$fixture/apple.m" "$wrapper/DTelecomCaptureProcessing.m" "$bridge/LKRNWebRTCModuleOptions.m" \
  -o "$build/capture-processing"
"$build/capture-processing"
