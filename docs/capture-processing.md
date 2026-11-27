# Process microphone audio

Configure an optional native capture processor before React Native starts. The processor receives microphone audio before encoding and media encryption. Install the callback when your call starts and detach it on leave. The normal SDK setup uses WebRTC's default processing.

The examples below mute captured frames while the processor is attached. This provides an audible test without a vendor dependency. Use the room's microphone toggle for normal mute controls.

## Android

Keep one controller in your application. During `Application.onCreate()`, supply it to SDK setup.

```kotlin
import com.livekit.reactnative.DTelecomReactNative
import com.livekit.reactnative.audio.processing.CaptureProcessing
import livekit.org.webrtc.ExternalAudioProcessingFactory
import java.nio.ByteBuffer

private val capture = CaptureProcessing()

// In Application.onCreate(), before loading React Native:
DTelecomReactNative.setup(this, captureProcessing = capture)
```

Register a processor for the call. The callback receives the format on initialization and after changes. WebRTC owns the buffer for the duration of the callback. Keep processing synchronous and bounded.

```kotlin
val silence = object : ExternalAudioProcessingFactory.AudioProcessing {
    override fun initialize(sampleRateHz: Int, channels: Int) {}
    override fun reset(newRate: Int) {}
    override fun process(bands: Int, frames: Int, buffer: ByteBuffer) {
        for (index in buffer.position() until buffer.limit()) {
            buffer.put(index, 0.toByte())
        }
    }
}

capture.setProcessor(silence)
// On leave, detach before releasing processor resources.
capture.setProcessor(null)
```

## iOS

Import the SDK and LiveKitWebRTC in native code. During app startup call `[DTelecomCaptureProcessing.sharedInstance install]` before creating the first room. A return value of `NO` means the app already supplied a different audio processing module. Choose one owner during app setup.

```objc
#import <dtelecom-react-native/DTelecomCaptureProcessing.h>
#import <LiveKitWebRTC/RTCAudioBuffer.h>
#import <string.h>

@interface SilenceProcessor : NSObject <LKRTCAudioCustomProcessingDelegate>
@end

@implementation SilenceProcessor
- (void)audioProcessingInitializeWithSampleRate:(size_t)rate channels:(size_t)channels {}
- (void)audioProcessingProcess:(LKRTCAudioBuffer *)buffer {
    for (size_t channel = 0; channel < buffer.channels; channel++) {
        memset([buffer rawBufferForChannel:channel], 0, buffer.frames * sizeof(float));
    }
}
- (void)audioProcessingRelease {}
@end
```

At call start use `[DTelecomCaptureProcessing.sharedInstance setProcessor:[SilenceProcessor new]]`. On leave use `[DTelecomCaptureProcessing.sharedInstance setProcessor:nil]`. The controller retains the active processor and delivers initialization and release callbacks when the capture format or processor lifecycle changes.

On either platform, compare audio from a second participant with the processor detached, attached and detached again. The peer should hear the original audio, silence and then audio again through the same published track.
