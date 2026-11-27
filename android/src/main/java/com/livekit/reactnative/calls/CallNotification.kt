package com.livekit.reactnative.calls

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Person
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.annotation.RequiresApi
import org.json.JSONObject

internal object CallNotification {
    const val ID = 0x445443
    private const val INCOMING = "dtelecom.incoming.v1"
    private const val ONGOING = "dtelecom.ongoing.v1"

    private fun manager(context: Context) = context.getSystemService(NotificationManager::class.java)

    @RequiresApi(26)
    private fun channels(context: Context) {
        val manager = manager(context)
        manager.createNotificationChannel(NotificationChannel(INCOMING, "Incoming calls", NotificationManager.IMPORTANCE_HIGH))
        manager.createNotificationChannel(NotificationChannel(ONGOING, "Ongoing calls", NotificationManager.IMPORTANCE_LOW))
    }

    fun requireIncomingPermission(context: Context) {
        val manager = manager(context)
        check(manager.areNotificationsEnabled()) { "Incoming call notifications are disabled" }
        if (Build.VERSION.SDK_INT >= 26) {
            channels(context)
            check(manager.getNotificationChannel(INCOMING).importance != NotificationManager.IMPORTANCE_NONE) {
                "Incoming call notification channel is disabled"
            }
        }
    }

    @Suppress("DEPRECATION")
    fun build(context: Context, call: JSONObject, incoming: Boolean): Notification {
        val id = call.getString("id")
        val name = call.getString("name")
        val muted = call.getBoolean("muted")
        val builder = if (Build.VERSION.SDK_INT >= 26) {
            channels(context)
            Notification.Builder(context, if (incoming) INCOMING else ONGOING)
        } else Notification.Builder(context)
        fun action(command: String, activity: Boolean): PendingIntent {
            val target = if (activity) SystemCallActivity::class.java else SystemCallReceiver::class.java
            val intent = Intent(context, target).apply {
                this.action = command
                data = Uri.Builder().scheme("dtcall").authority("call").appendPath(id).appendPath(command).build()
                putExtra("callId", id)
            }
            val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            return if (activity) PendingIntent.getActivity(context, 0, intent, flags)
                   else PendingIntent.getBroadcast(context, 0, intent, flags)
        }
        val end = action("end", false)
        val open = action("open", true)
        val answer = action("answer", true)
        builder.setSmallIcon(context.applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.sym_call_incoming)
            .setCategory(Notification.CATEGORY_CALL)
            .setContentTitle(name).setContentText(if (incoming) "Incoming call" else "Call in progress")
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setOngoing(true).setOnlyAlertOnce(true)
            .setContentIntent(open)
        if (Build.VERSION.SDK_INT >= 31) {
            val person = Person.Builder().setName(name).setImportant(true).build()
            val style = if (incoming) Notification.CallStyle.forIncomingCall(person, end, answer)
                        else Notification.CallStyle.forOngoingCall(person, end)
            builder.setStyle(style.setIsVideo(call.getBoolean("video")))
        } else {
            builder.setPriority(if (incoming) Notification.PRIORITY_HIGH else Notification.PRIORITY_LOW)
            builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, if (incoming) "Decline" else "End", end)
            if (incoming) builder.addAction(android.R.drawable.sym_call_incoming, "Answer", answer)
        }
        if (incoming) {
            if (Build.VERSION.SDK_INT < 34 || manager(context).canUseFullScreenIntent()) builder.setFullScreenIntent(open, true)
        } else {
            builder.addAction(android.R.drawable.ic_btn_speak_now, if (muted) "Unmute" else "Mute",
                action(if (muted) "unmute" else "mute", false))
        }
        return builder.build()
    }

    fun showIncoming(context: Context, call: JSONObject) = manager(context).notify(ID, build(context, call, true))
    fun updateOngoing(context: Context, call: JSONObject) = manager(context).notify(ID, build(context, call, false))
}
