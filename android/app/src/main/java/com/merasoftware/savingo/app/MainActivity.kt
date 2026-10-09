package com.merasoftware.savingo.app

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  companion object {
    const val ACTION_OPEN_ACCOUNT_SHORTCUT = "com.merasoftware.savingo.app.OPEN_ACCOUNT_SHORTCUT"
    const val EXTRA_ACCOUNT_ID = "accountId"
    const val EXTRA_ACCOUNT_TYPE = "accountType"
    const val EXTRA_ACCOUNT_NAME = "accountName"
    const val EXTRA_LAUNCH_SOURCE = "launchSource"
    const val SHORTCUT_PREFS = "account_shortcut_prefs"
    const val LAUNCH_SOURCE_SHORTCUT = "shortcut"
    const val LAUNCH_SOURCE_LAUNCHER = "launcher"
  }

  private var firstFocusLogged = false

  private fun logStartup(stage: String) {
    val now = SystemClock.elapsedRealtime()
    val base = MainApplication.processStartUptimeMs
    val delta = if (base > 0L) now - base else -1L
    if (delta >= 0L) {
      Log.i(MainApplication.STARTUP_TAG, "MainActivity. at +{delta}ms")
    } else {
      Log.i(MainApplication.STARTUP_TAG, "MainActivity. at {now}ms uptime")
    }
  }

  private fun applySoftInputMode() {
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    logStartup("onCreate.beforeSuper")
    super.onCreate(null)
    logStartup("onCreate.afterSuper")
    applySoftInputMode()
    window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    persistLaunchIntentState(intent)
  }

  override fun onResume() {
    super.onResume()
    logStartup("onResume")
    window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      if (!firstFocusLogged) {
        logStartup("onWindowFocusChanged.firstFocus")
        firstFocusLogged = true
      }
      window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    persistLaunchIntentState(intent)
  }

  private fun persistLaunchIntentState(intent: Intent?) {
    if (intent == null) {
      return
    }
    val prefs = getSharedPreferences(SHORTCUT_PREFS, Context.MODE_PRIVATE)
    val editor = prefs.edit()

    if (intent.action == ACTION_OPEN_ACCOUNT_SHORTCUT) {
      val accountId = intent.getStringExtra(EXTRA_ACCOUNT_ID)?.trim()
      if (accountId.isNullOrEmpty()) {
        return
      }
      editor
        .putString(EXTRA_ACCOUNT_ID, accountId)
        .putString(EXTRA_ACCOUNT_TYPE, intent.getStringExtra(EXTRA_ACCOUNT_TYPE) ?: "")
        .putString(EXTRA_ACCOUNT_NAME, intent.getStringExtra(EXTRA_ACCOUNT_NAME) ?: "")
        .putString(EXTRA_LAUNCH_SOURCE, LAUNCH_SOURCE_SHORTCUT)
        .apply()
      return
    }

    val isLauncherOpen =
      intent.action == Intent.ACTION_MAIN &&
      intent.hasCategory(Intent.CATEGORY_LAUNCHER)
    if (isLauncherOpen) {
      editor
        .remove(EXTRA_ACCOUNT_ID)
        .remove(EXTRA_ACCOUNT_TYPE)
        .remove(EXTRA_ACCOUNT_NAME)
        .putString(EXTRA_LAUNCH_SOURCE, LAUNCH_SOURCE_LAUNCHER)
        .apply()
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "Savingo"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
