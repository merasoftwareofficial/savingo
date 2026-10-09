package com.merasoftware.savingo.app

import android.content.Context
import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class ScheduleHeadlessService : HeadlessJsTaskService() {
  companion object {
    private const val TASK_TIMEOUT_MS = 60_000L
    const val TASK_KEY = "ScheduleProcessingTask"
    private const val EXTRA_SOURCE = "source"
    private const val EXTRA_RUN_AT = "runAt"
    private const val EXTRA_SCHEDULE_ID = "scheduleId"
    private const val EXTRA_RESTORE_ALL = "restoreAll"

    fun createIntent(
      context: Context,
      source: String,
      scheduleId: Int? = null,
      restoreAll: Boolean = false,
    ): Intent =
      Intent(context, ScheduleHeadlessService::class.java).apply {
        putExtra(EXTRA_SOURCE, source)
        putExtra(EXTRA_RUN_AT, System.currentTimeMillis())
        if (scheduleId != null && scheduleId > 0) {
          putExtra(EXTRA_SCHEDULE_ID, scheduleId)
        }
        putExtra(EXTRA_RESTORE_ALL, restoreAll)
      }
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = Arguments.fromBundle(intent?.extras ?: Bundle())
    return HeadlessJsTaskConfig(TASK_KEY, extras, TASK_TIMEOUT_MS, true)
  }
}
