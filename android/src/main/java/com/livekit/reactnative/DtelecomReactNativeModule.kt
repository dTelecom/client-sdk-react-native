package com.livekit.reactnative

import com.facebook.react.modules.core.DeviceEventManagerModule
import com.twilio.audioswitch.AudioDevice
import com.facebook.react.bridge.*
import com.livekit.reactnative.audio.AudioDeviceKind
import com.livekit.reactnative.audio.AudioManagerUtils
import com.livekit.reactnative.audio.AudioSwitchManager


class DtelecomReactNativeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val audioManager = AudioSwitchManager(reactContext.applicationContext)
    @Volatile private var routeListeners = 0

    init {
        audioManager.audioDeviceChangeListener = { devices, selected ->
            if (routeListeners > 0 && reactApplicationContext.hasActiveReactInstance()) {
                reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("dTelecomAudioRouteChanged", route(devices, selected))
            }
            Unit
        }
    }

    private fun onMain(promise: Promise, block: () -> Any?) {
        UiThreadUtil.runOnUiThread {
            try {
                promise.resolve(block())
            } catch (error: RuntimeException) {
                promise.reject("audio_session", error)
            }
        }
    }

    override fun getName(): String {
        return "DtelecomReactNative"
    }

    @ReactMethod
    fun configureAudio(config: ReadableMap, promise: Promise) = onMain(promise) {
        applyConfiguration(config)
        null
    }

    private fun applyConfiguration(config: ReadableMap) {
        val androidConfig = config.getMap("android") ?: return

        if (androidConfig.hasKey("preferredOutputList")) {
            androidConfig.getArray("preferredOutputList")?.let { preferredOutputList ->
                val preferredDeviceList = preferredOutputList.toArrayList().mapNotNull { output ->
                    val outputStr = output as? String
                    AudioDeviceKind.fromTypeName(outputStr)?.audioDeviceClass
                }
                audioManager.setPreferredDeviceList(preferredDeviceList)
            }
        }

        if (androidConfig.hasKey("audioTypeOptions")) {
            val audioTypeOptions = androidConfig.getMap("audioTypeOptions") ?: return

            if (audioTypeOptions.hasKey("manageAudioFocus")) {
                val manageFocus = audioTypeOptions.getBoolean("manageAudioFocus")
                audioManager.setManageAudioFocus(manageFocus)
            }
            if (audioTypeOptions.hasKey("audioMode")) {
                audioTypeOptions.getString("audioMode")?.let { audioModeString ->
                    val audioMode = AudioManagerUtils.audioModeFromString(audioModeString)
                    if (audioMode != null) {
                        audioManager.setAudioMode(audioMode)
                    }
                }
            }

            if (audioTypeOptions.hasKey("audioFocusMode")) {
                audioTypeOptions.getString("audioFocusMode")?.let { focusModeString ->
                    val focusMode = AudioManagerUtils.focusModeFromString(focusModeString)
                    if (focusMode != null) {
                        audioManager.setFocusMode(focusMode)
                    }
                }
            }

            if (audioTypeOptions.hasKey("audioStreamType")) {
                audioTypeOptions.getString("audioStreamType")?.let { streamTypeString ->
                    val streamType = AudioManagerUtils.audioStreamTypeFromString(streamTypeString)
                    if (streamType != null) {
                        audioManager.setAudioStreamType(streamType)
                    }
                }
            }

            if (audioTypeOptions.hasKey("audioAttributesUsageType")) {
                audioTypeOptions.getString("audioAttributesUsageType")?.let { usageTypeString ->
                    val usageType = AudioManagerUtils.audioAttributesUsageTypeFromString(usageTypeString)
                    if (usageType != null) {
                        audioManager.setAudioAttributesUsageType(usageType)
                    }
                }
            }

            if (audioTypeOptions.hasKey("audioAttributesContentType")) {
                audioTypeOptions.getString("audioAttributesContentType")?.let { contentTypeString ->
                    val contentType = AudioManagerUtils.audioAttributesContentTypeFromString(contentTypeString)
                    if (contentType != null) {
                        audioManager.setAudioAttributesContentType(contentType)
                    }
                }
            }

            if (audioTypeOptions.hasKey("forceHandleAudioRouting")) {
                val force = audioTypeOptions.getBoolean("forceHandleAudioRouting")
                audioManager.setForceHandleAudioRouting(force)
            }
        }
    }

    @ReactMethod
    fun startAudioSession(promise: Promise) = onMain(promise) {
        audioManager.start()
        null
    }

    @ReactMethod
    fun stopAudioSession(promise: Promise) = onMain(promise) {
        audioManager.stop()
        null
    }

    @ReactMethod
    fun getAudioOutputs(promise: Promise) = onMain(promise) {
        outputs(audioManager.availableAudioDevices())
    }

    @ReactMethod
    fun getAudioRoute(promise: Promise) = onMain(promise) {
        route(audioManager.availableAudioDevices(), audioManager.selectedAudioDevice())
    }

    @ReactMethod
    fun selectAudioOutput(deviceId: String, promise: Promise) = onMain(promise) {
        audioManager.selectAudioOutput(AudioDeviceKind.fromTypeName(deviceId))
    }

    @ReactMethod
    fun clearAudioOutputSelection(promise: Promise) = onMain(promise) {
        audioManager.clearSelection()
    }

    @ReactMethod
    fun addListener(eventName: String) {
        if (eventName == "dTelecomAudioRouteChanged") routeListeners++
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        routeListeners = (routeListeners - count).coerceAtLeast(0)
    }

    override fun invalidate() {
        routeListeners = 0
        UiThreadUtil.runOnUiThread { audioManager.stop() }
        super.invalidate()
    }

    private fun outputs(devices: List<AudioDevice>) = Arguments.makeNativeArray(
        devices.mapNotNull { AudioDeviceKind.fromAudioDevice(it)?.typeName }.distinct()
    )

    private fun route(devices: List<AudioDevice>, selected: AudioDevice?) = Arguments.createMap().apply {
        putString("selectedOutput", selected?.let { AudioDeviceKind.fromAudioDevice(it)?.typeName } ?: "unknown")
        putArray("availableOutputs", outputs(devices))
    }
}
