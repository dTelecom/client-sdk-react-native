# dTelecom Rooms

Join a dTelecom Meet meeting or Live broadcast from one React Native app. The app uses the same invite and admission endpoint as the browser. Cloud credentials stay on the backend.

## Run

Use Node 22.13 or newer within Node 22, React Native 0.86, Xcode with CocoaPods for iOS, or Android Studio with SDK Platforms 34 and 36, Build Tools 35.0.0 and 36.0.0, NDK 27.1.12297006, CMake 3.22.1 and a compatible JDK for Android.

With the published SDK, run `npm ci` from this directory. To test a locally packed wrapper, run the command below in this directory. npm installs the pinned room client and WebRTC bridge from the registry.

```sh
npm install --no-save /absolute/path/to/dtelecom-react-native-2.0.1.tgz
```

For iOS, run `bundle install`, then `cd ios && bundle exec pod install` and return to the example directory. The Podfile includes the LiveKit source for the pinned WebRTC framework. Start Metro with `npm start`, then use `npm run ios` or `npm run android` in another terminal. Run `npm test` to check the invite and chat contracts.

### Install on your own phone

For an iPhone, open `ios/DtelecomRooms.xcworkspace` in Xcode, select the **DtelecomRooms** target, and choose your own team under **Signing & Capabilities**. Xcode appends the selected team ID to `com.example.dtelecomrooms` for development signing. Select your phone as the destination and run the app. You can set your own bundle identifier when adapting the example.

The Android example installs as `com.example.dtelecomrooms`. Enable USB debugging on your phone, authorize the development machine, and run the Android example. Set your own `applicationId` in `android/app/build.gradle` when distributing your own app.

## Join from a browser invite

1. Create a room in [Meet](https://dtelecom-meet.vercel.app/) or start a stream in [Live](https://dtelecom-live.vercel.app/).
2. Tap **Scan QR** in the mobile app and point the camera at the invite QR code, or paste the `/prejoin?room=…` invite. Scanning fills the invite field. Choose a name distinct from the browser participant and tap **Join room**. You can paste an invite if camera access is unavailable.
3. In Meet, use **Start mic** and **Start camera** to publish. Browser camera and shared-screen tracks appear in the app. In Live, an ordinary invite opens in viewer mode with playback and chat. A signed host invite enables broadcasting. Audio and video start only after the user taps the relevant control.
4. Send a message to the room. The sender and browser Chat panel use the same data channel. Leave and rejoin using the original invite.

Configure other deployments by adding their exact origins and product to `issuers` in [src/invite.ts](src/invite.ts). Use HTTPS for deployed backends. An explicitly configured loopback origin also works for local development on iOS Simulator or Android Emulator. Android uses `10.0.2.2` to reach the host. A signed host fragment belongs to its issuing deployment and should be shared only with the intended host.

The SDK uses optional fallback URLs returned by the issuer and works with issuers that return one node. Camera capture pauses when the app goes into the background and resumes on return if it was active. This example demonstrates foreground room joining and uses an audio-route picker for in-call routing.

Native projects derive from [the React Native 0.86 community template](https://www.npmjs.com/package/@react-native-community/template/v/0.86.0). Its license is included in [TEMPLATE-LICENSE](TEMPLATE-LICENSE).
