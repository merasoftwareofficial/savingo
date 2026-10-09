package com.merasoftware.savingo.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ScheduledAlarmModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val TAG = "ScheduledAlarmModule"
  }

  override fun getName(): String = "ScheduledAlarm"

  @ReactMethod
  fun canScheduleExactAlarms(promise: Promise) {
    try {
      val context = reactApplicationContext
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val allowed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        alarmManager.canScheduleExactAlarms()
      } else {
        true
      }
      Log.d(TAG, "canScheduleExactAlarms: sdk=${Build.VERSION.SDK_INT}, allowed=$allowed")
      promise.resolve(allowed)
    } catch (error: Throwable) {
      Log.e(TAG, "canScheduleExactAlarms failed", error)
      promise.reject("CHECK_EXACT_ALARM_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun openExactAlarmSettings(promise: Promise) {
    try {
      val context = reactApplicationContext
      Log.d(TAG, "openExactAlarmSettings called: sdk=${Build.VERSION.SDK_INT}, package=${context.packageName}")
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        Log.d(TAG, "openExactAlarmSettings: sdk below S, returning true")
        promise.resolve(true)
        return
      }
      val exactAlarmIntent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
        data = Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      val fallbackIntent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      try {
        Log.d(TAG, "Trying exact alarm settings intent: action=${exactAlarmIntent.action}, data=${exactAlarmIntent.data}")
        context.startActivity(exactAlarmIntent)
        Log.d(TAG, "Exact alarm settings intent launched successfully")
        promise.resolve(true)
      } catch (exactError: Throwable) {
        Log.e(TAG, "Exact alarm settings intent failed", exactError)
        try {
          Log.d(TAG, "Trying fallback app settings intent: action=${fallbackIntent.action}, data=${fallbackIntent.data}")
          context.startActivity(fallbackIntent)
          Log.d(TAG, "Fallback app settings intent launched successfully")
          promise.resolve(true)
        } catch (fallbackError: Throwable) {
          Log.e(TAG, "Fallback app settings intent failed", fallbackError)
          promise.resolve(false)
        }
      }
    } catch (error: Throwable) {
      Log.e(TAG, "openExactAlarmSettings failed", error)
      promise.reject("OPEN_EXACT_ALARM_SETTINGS_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun scheduleExact(scheduleId: Double, triggerAtMs: Double, promise: Promise) {
    try {
      val normalizedId = scheduleId.toInt()
      val normalizedTriggerAtMs = triggerAtMs.toLong()
      if (normalizedId <= 0 || normalizedTriggerAtMs <= 0L) {
        promise.resolve(false)
        return
      }

      val context = reactApplicationContext
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val safeTriggerAtMs = maxOf(System.currentTimeMillis() + 1000L, normalizedTriggerAtMs)
      val pendingIntent = ScheduledAlarmReceiver.createPendingIntent(
        context,
        normalizedId
      )

      when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && alarmManager.canScheduleExactAlarms() -> {
          alarmManager.setExactAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            safeTriggerAtMs,
            pendingIntent
          )
        }
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.M -> {
          alarmManager.setExactAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            safeTriggerAtMs,
            pendingIntent
          )
        }
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
          promise.resolve(false)
          return
        }
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT -> {
          alarmManager.setExact(
            AlarmManager.RTC_WAKEUP,
            safeTriggerAtMs,
            pendingIntent
          )
        }
        else -> {
          alarmManager.set(
            AlarmManager.RTC_WAKEUP,
            safeTriggerAtMs,
            pendingIntent
          )
        }
      }
      promise.resolve(true)
    } catch (error: Throwable) {
      promise.reject("SCHEDULE_ALARM_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun cancel(scheduleId: Double, promise: Promise) {
    try {
      val normalizedId = scheduleId.toInt()
      if (normalizedId <= 0) {
        promise.resolve(false)
        return
      }
      val context = reactApplicationContext
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val pendingIntent = ScheduledAlarmReceiver.createPendingIntent(
        context,
        normalizedId
      )
      alarmManager.cancel(pendingIntent)
      pendingIntent.cancel()
      promise.resolve(true)
    } catch (error: Throwable) {
      promise.reject("CANCEL_ALARM_FAILED", error.message, error)
    }
  }
}
