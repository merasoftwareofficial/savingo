package com.merasoftware.savingo.app

import android.app.Application
import android.os.SystemClock
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.ReactPackage

class MainApplication : Application(), ReactApplication {
  companion object {
    const val STARTUP_TAG = "StartupTrace"
    @JvmField var processStartUptimeMs: Long = 0L
  }

  @Suppress("DEPRECATION")
  override val reactNativeHost: ReactNativeHost by lazy {
    object : DefaultReactNativeHost(this) {
      override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

      override fun getPackages(): List<ReactPackage> =
          PackageList(this).packages.apply {
            // Packages that cannot be autolinked yet can be added manually here, for example:
            add(VersionInfoPackage())
            add(AccountShortcutPackage())
            add(ScheduledAlarmPackage())
            add(ChatDraftPackage())
          }

      override fun getJSMainModuleName(): String = "index"
    }
  }

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(applicationContext, reactNativeHost)
  }

  override fun onCreate() {
    super.onCreate()
    if (processStartUptimeMs == 0L) {
      processStartUptimeMs = SystemClock.elapsedRealtime()
    }
    Log.i(STARTUP_TAG, "MainApplication.onCreate at ms uptime")
    loadReactNative(this)
    ScheduleWorker.enqueuePeriodic(applicationContext)
    val afterLoadMs = SystemClock.elapsedRealtime() - processStartUptimeMs
    Log.i(STARTUP_TAG, "loadReactNative completed in ms since app onCreate")
  }
}
