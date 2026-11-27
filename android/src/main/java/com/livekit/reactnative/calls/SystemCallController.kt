package com.livekit.reactnative.calls

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.livekit.reactnative.audio.AudioSwitchManager
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.CopyOnWriteArraySet

/** Optional host entry point. Call from the main application process. */
object SystemCallController {
    internal val listeners = CopyOnWriteArraySet<() -> Unit>()
    /** Optional application callback for native actions that must run before JS starts. */
    @Volatile var onNativeAction: ((UUID, String, Boolean?) -> Unit)? = null
    private val main = Handler(Looper.getMainLooper())
    private var audio: AudioSwitchManager? = null
    private var audioCallId: String? = null
    internal val ownsAudio get() = audioCallId != null
    private var restorePolicy: Runnable? = null

    private fun prefs(context: Context) = context.getSharedPreferences("org.dtelecom.rtc.calls", Context.MODE_PRIVATE)
    private fun array(context: Context, key: String) = JSONArray(prefs(context).getString(key, "[]"))

    @Synchronized
    internal fun state(context: Context): JSONObject? =
        prefs(context).getString("call", null)?.let(::JSONObject)

    @Synchronized
    internal fun pending(context: Context): JSONArray = array(context, "actions")

    @Synchronized
    internal fun acknowledge(context: Context, id: String) {
        val actions = pending(context)
        if (actions.optJSONObject(0)?.optString("id") == id) {
            actions.remove(0)
            check(prefs(context).edit().putString("actions", actions.toString()).commit())
        }
    }

    private fun transition(context: Context, id: String, call: JSONObject?, action: String, muted: Boolean? = null) {
        val event = JSONObject().put("id", UUID.randomUUID().toString()).put("callId", id).put("action", action)
        if (muted != null) event.put("muted", muted)
        val edit = prefs(context).edit().putString("actions", pending(context).put(event).toString())
        if (call == null) {
            edit.remove("call")
            rememberEnd(context, id, edit)
        } else edit.putString("call", call.toString())
        check(edit.commit()) { "Could not store the system call action" }
        main.post { listeners.forEach { it() }; onNativeAction?.invoke(UUID.fromString(id), action, muted) }
    }

    private fun rememberEnd(context: Context, id: String, edit: android.content.SharedPreferences.Editor) {
        val ended = array(context, "ended")
        if ((0 until ended.length()).none { ended.getString(it) == id }) ended.put(id)
        while (ended.length() > 128) ended.remove(0)
        edit.putString("ended", ended.toString())
    }

    private fun begin(context: Context, id: UUID, name: String, video: Boolean, incoming: Boolean) {
        val key = id.toString()
        val prior = state(context)
        if (prior?.getString("id") == key) return
        val ended = array(context, "ended")
        check((0 until ended.length()).none { ended.getString(it) == key }) { "Call has ended" }
        check(prior == null) { "Another call is active" }
        val call = JSONObject().put("id", key).put("name", name).put("video", video)
            .put("phase", if (incoming) "ringing" else "dialing").put("muted", false)
        if (incoming) CallNotification.requireIncomingPermission(context)
        transition(context, key, call, if (incoming) "incoming" else "outgoing")
        try {
            if (incoming) CallNotification.showIncoming(context, call)
            else startService(context)
        } catch (error: RuntimeException) {
            finish(context, key, "reset")
            throw error
        }
    }

    @JvmStatic @Synchronized
    fun reportIncoming(context: Context, id: UUID, displayName: String, video: Boolean) =
        begin(context, id, displayName, video, true)

    @Synchronized
    internal fun outgoing(context: Context, id: UUID, displayName: String, video: Boolean) =
        begin(context, id, displayName, video, false)

    private fun startService(context: Context) {
        val intent = Intent(context, SystemCallService::class.java)
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
    }

    @Synchronized
    internal fun answer(context: Context, id: String) {
        val call = requireCall(context, id)
        if (call.getString("phase") == "active") return
        require(call.getString("phase") == "ringing") { "Only a ringing call can be answered" }
        call.put("phase", "active")
        transition(context, id, call, "answer")
        try {
            startService(context)
        } catch (error: RuntimeException) {
            finish(context, id, "reset")
            throw error
        }
    }

    @Synchronized
    internal fun connected(context: Context, id: String) {
        val call = requireCall(context, id)
        if (call.getString("phase") == "active") return
        require(call.getString("phase") == "dialing") { "Answer the incoming call first" }
        call.put("phase", "active")
        check(prefs(context).edit().putString("call", call.toString()).commit())
        CallNotification.updateOngoing(context, call)
    }

    @Synchronized
    internal fun setMuted(context: Context, id: String, muted: Boolean) {
        val call = requireCall(context, id)
        require(call.getString("phase") != "ringing") { "Answer the call first" }
        if (call.getBoolean("muted") == muted) return
        call.put("muted", muted)
        transition(context, id, call, "mute", muted)
        CallNotification.updateOngoing(context, call)
    }

    private fun requireCall(context: Context, id: String) =
        requireNotNull(state(context)?.takeIf { it.getString("id") == id }) { "Unknown call" }

    @Synchronized
    private fun finish(context: Context, id: String, reason: String) {
        if (state(context)?.getString("id") != id) {
            if (reason == "remoteEnd") {
                val edit = prefs(context).edit()
                rememberEnd(context, id, edit)
                check(edit.commit())
            }
            return
        }
        transition(context, id, null, reason)
        context.getSystemService(NotificationManager::class.java).cancel(CallNotification.ID)
        context.stopService(Intent(context, SystemCallService::class.java))
        main.post { releaseAudio(id) }
    }

    @JvmStatic @Synchronized
    fun reportRemoteEnd(context: Context, id: UUID) = finish(context, id.toString(), "remoteEnd")

    @Synchronized internal fun end(context: Context, id: String) = finish(context, id, "end")
    @Synchronized internal fun reset(context: Context, id: String) = finish(context, id, "reset")

    /** Shared with ordinary rooms so the two audio focus managers never compete. */
    @Synchronized internal fun audioManager(context: Context): AudioSwitchManager =
        audio ?: AudioSwitchManager(context.applicationContext).also { audio = it }

    internal fun acquireAudio(context: Context, id: String) {
        if (audioCallId == id) return
        audioCallId?.let(::releaseAudio)
        val manager = audioManager(context)
        restorePolicy = manager.configureSystemCall()
        audioCallId = id
        manager.audioFocusChangeListener = AudioManager.OnAudioFocusChangeListener { change ->
            if (change == AudioManager.AUDIOFOCUS_GAIN || change < 0) synchronized(this) {
                val current = state(context)
                if (current?.optString("id") == id) {
                    transition(context, id, current, if (change > 0) "audioActivated" else "audioDeactivated")
                }
            }
        }
        try {
            manager.start()
        } catch (error: RuntimeException) {
            releaseAudio(id)
            throw error
        }
    }

    internal fun releaseAudio(id: String) {
        if (audioCallId != id) return
        audioCallId = null
        try {
            audio?.stop()
        } finally {
            audio?.audioFocusChangeListener = AudioManager.OnAudioFocusChangeListener { }
            restorePolicy?.run()
            restorePolicy = null
        }
    }
}
