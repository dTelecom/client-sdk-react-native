#!/usr/bin/env bash
set -euo pipefail

consumer=$(cd "${1:?supply the installed Rooms example directory}" && pwd)
fixture=$(cd "$(dirname "$0")" && pwd)
pods="$consumer/ios/Pods"
wrapper="$consumer/node_modules/@dtelecom/react-native/ios"
slice=ios-arm64_x86_64-maccatalyst
sdk=$(xcrun --sdk macosx --show-sdk-path)
build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT

# The Catalyst loader requires signed binaries. Sign only the temporary framework copies.
frameworks=(
  "$pods/LiveKitWebRTC/LiveKitWebRTC.xcframework/$slice/LiveKitWebRTC.framework"
  "$pods/React-Core-prebuilt/React.xcframework/$slice/React.framework"
  "$pods/ReactNativeDependencies/framework/packages/react-native/ReactNativeDependencies.xcframework/$slice/ReactNativeDependencies.framework"
  "$pods/hermes-engine/destroot/Library/Frameworks/universal/hermesvm.xcframework/$slice/hermesvm.framework"
)
# React's prebuilt npm artifact materializes the usual framework symlinks as files.
# Stage just the runtime dylibs at their published install names for the standalone loader.
search=()
for framework in "${frameworks[@]}"; do
  name=$(basename "$framework" .framework)
  binary="$framework/$name"
  install_name=$(otool -D -arch "$(uname -m)" "$binary" | tail -1)
  target="$build/${install_name#@rpath/}"
  mkdir -p "$(dirname "$target")"
  cp "$binary" "$build/$name"
  codesign --force --sign - --timestamp=none "$build/$name"
  mv "$build/$name" "$target"
  search+=("-F$(dirname "$framework")")
done
react="${frameworks[1]}/Headers"
xcrun --sdk macosx clang -fobjc-arc -fmodules -target "$(uname -m)-apple-ios15.1-macabi" \
  -isystem "$sdk/System/iOSSupport/usr/include" -F"$sdk/System/iOSSupport/System/Library/Frameworks" \
  "${search[@]}" -I"$wrapper" -isystem "$react" -isystem "$react/React_Core" -isystem "$react/Yoga" \
  -framework Foundation -framework AVFAudio -framework CallKit -framework React -framework LiveKitWebRTC \
  -Xlinker -rpath -Xlinker "$build" \
  "$fixture/apple.m" "$wrapper/DTCSystemCalls.m" -o "$build/system-calls"
"$build/system-calls"
