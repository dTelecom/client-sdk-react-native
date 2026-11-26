# dTelecom Rooms

Join a dTelecom Meet meeting or Live broadcast from one React Native app. The app uses the same invite and admission endpoint as the browser. Cloud credentials stay on the backend.

## Run

Use Node 22.13 or newer within Node 22, React Native 0.86, Xcode with CocoaPods for iOS, or Android Studio with SDK Platform 36, Build Tools 35.0.0 and 36.0.0, NDK 27.1.12297006, CMake 3.22.1 and a compatible JDK for Android.

With the published SDK, run `npm ci` from this directory. To test a locally packed wrapper, run the command below in this directory. npm installs the pinned room client and WebRTC bridge from the registry.

```sh
npm install --no-save /absolute/path/to/dtelecom-react-native-2.0.0.tgz
```

For iOS, run `bundle install`, then `cd ios && bundle exec pod install` and return to the example directory. The Podfile includes the LiveKit source for the pinned WebRTC framework. Start Metro with `npm start`, then use `npm run ios` or `npm run android` in another terminal. Run `npm test` to check the invite and chat contracts.

## Join from a browser invite

1. Create a room in [Meet](https://dtelecom-meet-demo.vercel.app/) or start a stream in [Live](https://dtelecom-live.vercel.app/).
2. Paste its `/prejoin?room=…` invite into the mobile app, choose a name distinct from the browser participant, and tap **Join room**.
3. In Meet, use **Start mic** and **Start camera** to publish. Browser camera and shared-screen tracks appear in the app. In Live, an ordinary invite opens in viewer mode with playback and chat. A signed host invite enables broadcasting. Audio and video start only after the user taps the relevant control.
4. Send a message to the room. The sender and browser Chat panel use the same data channel. Leave and rejoin using the original invite.

Configure other deployments by adding their exact origins and product to `issuers` in [src/invite.ts](src/invite.ts). Use HTTPS for deployed backends. An explicitly configured loopback origin also works for local development on iOS Simulator or Android Emulator. Android uses `10.0.2.2` to reach the host. A signed host fragment belongs to its issuing deployment and should be shared only with the intended host.

The SDK uses optional fallback URLs returned by the issuer and works with issuers that return one node. Camera capture pauses when the app goes into the background and resumes on return if it was active. This example demonstrates foreground room joining and uses an audio-route picker for in-call routing.

Native projects derive from [the React Native 0.86 community template](https://www.npmjs.com/package/@react-native-community/template/v/0.86.0). Its license is included in [TEMPLATE-LICENSE](TEMPLATE-LICENSE).
