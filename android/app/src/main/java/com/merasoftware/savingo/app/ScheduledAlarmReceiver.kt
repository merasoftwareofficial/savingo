package com.merasoftware.savingo.app

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.HeadlessJsTaskService

class ScheduledAlarmReceiver : BroadcastReceiver() {
  companion object {
    private const val ACTION_TRIGGER_SCHEDULE = "com.merasoftware.savingo.app.TRIGGER_SCHEDULE"
    private const val EXTRA_SCHEDULE_ID = "scheduleId"

    fun createPendingIntent(context: Context, scheduleId: Int): PendingIntent {
      val intent = Intent(context, ScheduledAlarmReceiver::class.java).apply {
        action = ACTION_TRIGGER_SCHEDULE
        putExtra(EXTRA_SCHEDULE_ID, scheduleId)
      }
      val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }
      return PendingIntent.getBroadcast(context, scheduleId, intent, flags)
    }
  }

  override fun onReceive(context: Context, intent: Intent?) {
    val scheduleId = intent?.getIntExtra(EXTRA_SCHEDULE_ID, 0) ?: 0
    if (scheduleId <= 0) {
      return
    }
    HeadlessJsTaskService.acquireWakeLockNow(context)
    context.startService(
      ScheduleHeadlessService.createIntent(
        context = context,
        source = "alarm",
        scheduleId = scheduleId,
      )
    )
  }
}
