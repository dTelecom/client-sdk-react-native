package com.livekit.reactnative.calls

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** Shown directly by an immutable notification intent, including on the lock screen. */
class SystemCallActivity : Activity() {
    private val callId get() = intent.getStringExtra("callId").orEmpty()
    private val changed: () -> Unit = {
        if (SystemCallController.state(this)?.optString("id") != callId) finish()
    }

    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        val call = SystemCallController.state(this)
        if (call == null || call.optString("id") != callId) { finish(); return }
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
        content.addView(TextView(this).apply { text = call.getString("name"); textSize = 24f })
        if (call.getString("phase") == "ringing") {
            content.addView(Button(this).apply { text = "Answer"; setOnClickListener { answer() } })
            content.addView(Button(this).apply { text = "Decline"; setOnClickListener {
                SystemCallController.end(this@SystemCallActivity, callId)
                finish()
            } })
        } else openApp()
        setContentView(content)
        SystemCallController.listeners.add(changed)
    }

    override fun onPostResume() {
        super.onPostResume()
        if (!isFinishing && intent.action == "answer") {
            intent.action = null
            answer()
        }
    }

    private fun answer() {
        if (SystemCallController.state(this)?.optString("id") != callId) { finish(); return }
        SystemCallController.answer(this, callId)
        openApp()
    }

    private fun openApp() {
        packageManager.getLaunchIntentForPackage(packageName)?.also {
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            startActivity(it)
        }
        finish()
    }

    override fun onDestroy() {
        SystemCallController.listeners.remove(changed)
        super.onDestroy()
    }
}

class SystemCallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("callId") ?: return
        val call = SystemCallController.state(context) ?: return
        if (id != call.optString("id")) return
        when (intent.action) {
            "end" -> SystemCallController.end(context, id)
            "mute", "unmute" -> {
                if (call.optString("phase") != "ringing") SystemCallController.setMuted(context, id, intent.action == "mute")
            }
        }
    }
}
