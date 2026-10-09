package com.merasoftware.savingo.app

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.drawable.AdaptiveIconDrawable
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap

class AccountShortcutModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AccountShortcut"

  @ReactMethod
  fun addToHomeScreen(
    accountId: String,
    accountName: String,
    accountType: String,
    iconName: String,
    iconColor: String,
    promise: Promise
  ) {
    try {
      val context = reactApplicationContext
      if (!ShortcutManagerCompat.isRequestPinShortcutSupported(context)) {
        promise.resolve(false)
        return
      }

      val intent = Intent(context, MainActivity::class.java).apply {
        action = MainActivity.ACTION_OPEN_ACCOUNT_SHORTCUT
        putExtra(MainActivity.EXTRA_ACCOUNT_ID, accountId)
        putExtra(MainActivity.EXTRA_ACCOUNT_TYPE, accountType)
        putExtra(MainActivity.EXTRA_ACCOUNT_NAME, accountName)
        addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }

      val icon = buildHybridShortcutIcon(context, iconName, iconColor)
      val shortcut = ShortcutInfoCompat.Builder(context, "account_$accountId")
        .setShortLabel(accountName.take(30).ifBlank { "Account" })
        .setLongLabel(accountName.ifBlank { "Account" })
        .setIntent(intent)
        .setIcon(icon)
        .build()

      val created = ShortcutManagerCompat.requestPinShortcut(context, shortcut, null)
      promise.resolve(created)
    } catch (error: Throwable) {
      promise.reject("SHORTCUT_CREATE_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun consumePendingShortcut(promise: Promise) {
    try {
      val prefs = reactApplicationContext.getSharedPreferences(
        MainActivity.SHORTCUT_PREFS,
        Context.MODE_PRIVATE
      )
      val launchSource = prefs.getString(MainActivity.EXTRA_LAUNCH_SOURCE, "") ?: ""
      if (launchSource != MainActivity.LAUNCH_SOURCE_SHORTCUT) {
        promise.resolve(null)
        return
      }

      val accountId = prefs.getString(MainActivity.EXTRA_ACCOUNT_ID, null)
      if (accountId.isNullOrBlank()) {
        promise.resolve(null)
        return
      }

      val accountType = prefs.getString(MainActivity.EXTRA_ACCOUNT_TYPE, "") ?: ""
      val accountName = prefs.getString(MainActivity.EXTRA_ACCOUNT_NAME, "") ?: ""
      prefs.edit()
        .remove(MainActivity.EXTRA_ACCOUNT_ID)
        .remove(MainActivity.EXTRA_ACCOUNT_TYPE)
        .remove(MainActivity.EXTRA_ACCOUNT_NAME)
        .remove(MainActivity.EXTRA_LAUNCH_SOURCE)
        .apply()

      val payload = WritableNativeMap().apply {
        putString("accountId", accountId)
        putString("accountType", accountType)
        putString("accountName", accountName)
      }
      promise.resolve(payload)
    } catch (error: Throwable) {
      promise.reject("SHORTCUT_CONSUME_FAILED", error.message, error)
    }
  }

  private fun buildHybridShortcutIcon(
    context: Context,
    iconName: String,
    iconColor: String
  ): IconCompat {
    val sizePx = 192
    val appIconDrawable = getLauncherIcon(context.packageManager, context.packageName)
    val appBitmap = drawableToBitmap(appIconDrawable, sizePx, sizePx)

    val result = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(result)
    canvas.drawBitmap(appBitmap, null, Rect(0, 0, sizePx, sizePx), null)

    val badgeSize = (sizePx * 0.46f).toInt()
    val badgeLeft = sizePx - badgeSize - (sizePx * 0.08f).toInt()
    val badgeTop = sizePx - badgeSize - (sizePx * 0.08f).toInt()
    val badgeCx = badgeLeft + badgeSize / 2f
    val badgeCy = badgeTop + badgeSize / 2f
    val badgeRadius = badgeSize / 2f

    val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.FILL
      color = Color.WHITE
    }
    canvas.drawCircle(badgeCx, badgeCy, badgeRadius, borderPaint)

    val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.FILL
      color = parseColorSafe(iconColor, "#1D4ED8")
    }
    canvas.drawCircle(badgeCx, badgeCy, badgeRadius * 0.86f, fillPaint)

    val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      textAlign = Paint.Align.CENTER
      textSize = badgeSize * 0.46f
      isFakeBoldText = true
    }
    val glyph = resolveGlyph(iconName)
    val textY = badgeCy - (textPaint.descent() + textPaint.ascent()) / 2f
    canvas.drawText(glyph, badgeCx, textY, textPaint)

    return IconCompat.createWithBitmap(result)
  }

  private fun parseColorSafe(color: String?, fallback: String): Int {
    return try {
      Color.parseColor(color ?: fallback)
    } catch (_: Throwable) {
      Color.parseColor(fallback)
    }
  }

  private fun resolveGlyph(iconName: String): String {
    return when (iconName) {
      "wallet-outline" -> "W"
      "bs-cash-coin" -> "$"
      "home-outline" -> "H"
      "car-outline" -> "C"
      "restaurant-outline" -> "F"
      "people-outline" -> "P"
      "card-outline" -> "C"
      "bag-outline" -> "S"
      "medical-outline" -> "M"
      "game-controller-outline" -> "G"
      "book-outline" -> "E"
      "gift-outline" -> "G"
      "airplane-outline" -> "T"
      "build-outline" -> "T"
      "flash-outline" -> "U"
      "trophy-outline" -> "A"
      "phone-portrait-outline" -> "P"
      "briefcase-outline" -> "B"
      "color-palette-outline" -> "A"
      "star-outline" -> "*"
      else -> "A"
    }
  }

  private fun getLauncherIcon(packageManager: PackageManager, packageName: String): Drawable {
    return packageManager.getApplicationIcon(packageName)
  }

  private fun drawableToBitmap(drawable: Drawable, width: Int, height: Int): Bitmap {
    if (drawable is BitmapDrawable && drawable.bitmap != null) {
      return Bitmap.createScaledBitmap(drawable.bitmap, width, height, true)
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && drawable is AdaptiveIconDrawable) {
      val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(bitmap)
      drawable.setBounds(0, 0, width, height)
      drawable.draw(canvas)
      return bitmap
    }

    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    drawable.setBounds(0, 0, width, height)
    drawable.draw(canvas)
    return bitmap
  }
}
