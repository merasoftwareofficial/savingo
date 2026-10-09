package com.merasoftware.savingo.app

import android.content.pm.PackageInfo
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class VersionInfoModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "VersionInfo"

  override fun getConstants(): MutableMap<String, Any> {
    val context = reactApplicationContext
    val packageManager = context.packageManager
    val packageName = context.packageName
    val info: PackageInfo = packageManager.getPackageInfo(packageName, 0)
    val versionName = info.versionName ?: "unknown"
    val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      info.longVersionCode
    } else {
      @Suppress("DEPRECATION")
      info.versionCode.toLong()
    }
    return mutableMapOf(
      "versionName" to versionName,
      "versionCode" to versionCode.toString(),
    )
  }
}
