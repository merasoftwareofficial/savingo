package com.merasoftware.savingo.app

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.facebook.react.HeadlessJsTaskService
import java.util.concurrent.TimeUnit

class ScheduleWorker(
  appContext: Context,
  workerParams: WorkerParameters,
) : Worker(appContext, workerParams) {
  companion object {
    private const val UNIQUE_WORK_NAME = "scheduled-entry-processing"

    fun enqueuePeriodic(context: Context) {
      val workRequest =
        PeriodicWorkRequestBuilder<ScheduleWorker>(15, TimeUnit.MINUTES).build()

      WorkManager.getInstance(context).enqueueUniquePeriodicWork(
        UNIQUE_WORK_NAME,
        ExistingPeriodicWorkPolicy.KEEP,
        workRequest,
      )
    }
  }

  override fun doWork(): Result =
    try {
      HeadlessJsTaskService.acquireWakeLockNow(applicationContext)
      applicationContext.startService(
        ScheduleHeadlessService.createIntent(applicationContext, "workmanager"),
      )
      Result.success()
    } catch (_: IllegalStateException) {
      Result.retry()
    } catch (_: Exception) {
      Result.retry()
    }
}
