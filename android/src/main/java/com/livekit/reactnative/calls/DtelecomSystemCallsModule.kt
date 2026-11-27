package com.livekit.reactnative.calls

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.UUID

class DtelecomSystemCallsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private var registered = false
    private val changed: () -> Unit = {
        if (context.hasActiveReactInstance()) context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("dTelecomCallActionAvailable", null)
    }
    override fun getName() = "DtelecomSystemCalls"
    @ReactMethod fun addListener(name: String) {
        if (name == "dTelecomCallActionAvailable" && !registered) {
            registered = true
            SystemCallController.listeners.add(changed)
        }
    }
    @ReactMethod fun removeListeners(count: Int) {
        if (count > 0) {
            registered = false
            SystemCallController.listeners.remove(changed)
        }
    }
    override fun invalidate() {
        SystemCallController.listeners.remove(changed)
        super.invalidate()
    }
    private fun main(promise: Promise, action: () -> Any?) {
        UiThreadUtil.runOnUiThread {
            try { promise.resolve(action()) } catch (error: Exception) { promise.reject("system_call", error) }
        }
    }
    @ReactMethod fun currentCallId(promise: Promise) = main(promise) { SystemCallController.state(context)?.getString("id") }
    @ReactMethod fun pending(promise: Promise) = main(promise) {
        val all = SystemCallController.pending(context)
        Arguments.createArray().apply {
            for (i in 0 until all.length()) {
                val item = all.getJSONObject(i)
                pushMap(Arguments.createMap().apply {
                    for (key in listOf("id", "callId", "action")) putString(key, item.getString(key))
                    if (item.has("muted")) putBoolean("muted", item.getBoolean("muted"))
                })
            }
        }
    }
    @ReactMethod fun acknowledge(id: String, promise: Promise) = main(promise) { SystemCallController.acknowledge(context, id); null }
    @Suppress("UNUSED_PARAMETER") // The stable contact handle is used for iOS Recents.
    @ReactMethod fun outgoing(id: String, name: String, video: Boolean, handle: String, promise: Promise) = main(promise) {
        SystemCallController.outgoing(context, UUID.fromString(id), name, video); null
    }
    @ReactMethod fun connected(id: String, promise: Promise) = main(promise) { SystemCallController.connected(context, UUID.fromString(id).toString()); null }
    @ReactMethod fun answer(id: String, promise: Promise) = main(promise) { SystemCallController.answer(context, UUID.fromString(id).toString()); null }
    @ReactMethod fun end(id: String, promise: Promise) = main(promise) { SystemCallController.end(context, UUID.fromString(id).toString()); null }
    @ReactMethod fun remoteEnd(id: String, promise: Promise) = main(promise) { SystemCallController.reportRemoteEnd(context, UUID.fromString(id)); null }
    @ReactMethod fun setMuted(id: String, muted: Boolean, promise: Promise) = main(promise) { SystemCallController.setMuted(context, UUID.fromString(id).toString(), muted); null }
}
