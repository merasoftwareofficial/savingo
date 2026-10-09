package com.merasoftware.savingo.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService

class ScheduledBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    when (intent?.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED -> {
        HeadlessJsTaskService.acquireWakeLockNow(context)
        context.startService(
          ScheduleHeadlessService.createIntent(
            context = context,
            source = "boot_restore",
            restoreAll = true,
          )
        )
      }
    }
  }
}
