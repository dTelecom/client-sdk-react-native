package com.livekit.reactnative.calls

import android.Manifest
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/** Host declares this foreground service only when opting into system calling. */
class SystemCallService : Service() {
    private var activeId: String? = null
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val call = SystemCallController.state(this)
        if (call == null || call.optString("phase") == "ringing") { stopSelf(startId); return START_NOT_STICKY }
        val id = call.getString("id")
        try {
            val notification = CallNotification.build(this, call, false)
            if (Build.VERSION.SDK_INT >= 30) {
                var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                }
                startForeground(CallNotification.ID, notification, type)
            } else startForeground(CallNotification.ID, notification)
            SystemCallController.acquireAudio(this, id)
            activeId = id
        } catch (error: RuntimeException) {
            SystemCallController.reset(this, id)
            stopSelf(startId)
            return START_NOT_STICKY
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        activeId?.let(SystemCallController::releaseAudio)
        super.onDestroy()
    }
}
