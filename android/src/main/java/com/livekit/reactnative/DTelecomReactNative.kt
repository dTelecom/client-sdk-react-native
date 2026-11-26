package com.livekit.reactnative

import android.content.Context
import android.os.Build
import com.livekit.reactnative.audio.AudioType
import io.livekit.reactnative.webrtc.EglUtils
import io.livekit.reactnative.webrtc.WebRTCModuleOptions
import io.livekit.reactnative.webrtc.webrtcutils.H264AndSoftwareVideoEncoderFactory
import livekit.org.webrtc.SimulcastVideoEncoderFactory
import livekit.org.webrtc.audio.JavaAudioDeviceModule

object DTelecomReactNative {

    /**
     * Initializes components required for LiveKit to work on Android.
     *
     * Must be called from your [Application.onCreate] method before any other react-native
     * initialization.
     */
    @JvmStatic
    @JvmOverloads
    fun setup(context: Context, audioType: AudioType = AudioType.CommunicationAudioType()) {
        val options = WebRTCModuleOptions.getInstance()
        val codecs = H264AndSoftwareVideoEncoderFactory(EglUtils.getRootEglBaseContext())
        options.videoEncoderFactory = SimulcastVideoEncoderFactory(codecs, codecs)

        val useHardwareAudioProcessing = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

        options.audioDeviceModule = JavaAudioDeviceModule.builder(context)
            .setUseHardwareAcousticEchoCanceler(useHardwareAudioProcessing)
            .setUseHardwareNoiseSuppressor(useHardwareAudioProcessing)
            .setAudioAttributes(audioType.audioAttributes)
            .createAudioDeviceModule()
    }
}
