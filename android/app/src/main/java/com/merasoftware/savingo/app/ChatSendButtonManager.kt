package com.merasoftware.savingo.app

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.text.Editable
import android.text.TextWatcher
import android.view.MotionEvent
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.common.assets.ReactFontManager
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.Event
import com.facebook.react.views.textinput.ReactEditText

/** Text availability and the send boundary belong to the input's UI thread. */
class ChatSendButton(context: ThemedReactContext) : View(context) {
  private var input: ReactEditText? = null
  var inputTag = 0
  var sendAllowed = false
  var activeColor = Color.BLACK
  var inactiveColor = Color.GRAY
  var glyph = ""
  private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    typeface = ReactFontManager.getInstance().getTypeface("Ionicons", Typeface.NORMAL, context.assets)
    textSize = 20f * resources.displayMetrics.density
    textAlign = Paint.Align.CENTER
  }
  private val watcher = object : TextWatcher {
    override fun beforeTextChanged(text: CharSequence?, start: Int, count: Int, after: Int) = Unit
    override fun onTextChanged(text: CharSequence?, start: Int, before: Int, count: Int) {
      updateAvailability()
    }
    override fun afterTextChanged(text: Editable?) = Unit
  }

  init {
    contentDescription = "Send message"
    isClickable = true
    isFocusable = true
    isEnabled = false
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
  }

  fun bindInput() {
    if (input?.id == inputTag) return
    detachInput()
    if (inputTag == 0) return
    val manager = UIManagerHelper.getUIManagerForReactTag(context as ThemedReactContext, inputTag)
    input = manager?.resolveView(inputTag) as? ReactEditText
    input?.addTextChangedListener(watcher)
    updateAvailability()
  }

  fun detachInput() {
    input?.removeTextChangedListener(watcher)
    input = null
    updateAvailability()
  }

  fun updateAvailability() {
    isEnabled = !input?.text.isNullOrBlank()
    invalidate()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    bindInput()
  }

  override fun onDetachedFromWindow() {
    detachInput()
    super.onDetachedFromWindow()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    iconPaint.color = if (isEnabled && sendAllowed) activeColor else inactiveColor
    val metrics = iconPaint.fontMetrics
    canvas.drawText(glyph, width / 2f, (height - metrics.ascent - metrics.descent) / 2f, iconPaint)
  }

  private fun submitDraft() {
    val edit = input ?: return
    val text = edit.text?.toString().orEmpty()
    if (text.isBlank()) return
    val reactContext = context as ThemedReactContext
    val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id) ?: return
    val pressedAt = System.currentTimeMillis()
    val consumed = sendAllowed
    if (consumed) {
      // Read and clear at the native touch boundary, before another key can run.
      // Native change events stay enabled, so draft mirrors observe the reset.
      edit.setText(null)
    }
    dispatcher.dispatchEvent(ChatDraftSendEvent(
      UIManagerHelper.getSurfaceId(this), id, text, consumed, pressedAt,
    ))
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    // Clearing on DOWN disables the now-empty button; still finish that gesture.
    if (!isEnabled && event.actionMasked == MotionEvent.ACTION_DOWN) return false
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        isPressed = true
        submitDraft()
        return true
      }
      MotionEvent.ACTION_UP -> {
        isPressed = false
        // Accessibility click notification only: ACTION_DOWN already submitted.
        super.performClick()
        return true
      }
      MotionEvent.ACTION_CANCEL -> {
        isPressed = false
        return true
      }
    }
    return true
  }

  override fun performClick(): Boolean {
    if (isEnabled) submitDraft()
    return super.performClick()
  }

  override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
    super.onInitializeAccessibilityNodeInfo(info)
    info.className = "android.widget.Button"
  }
}

private class ChatDraftSendEvent(
  surfaceId: Int, viewId: Int, private val text: String,
  private val consumed: Boolean, private val pressedAt: Long,
) : Event<ChatDraftSendEvent>(surfaceId, viewId) {
  override fun getEventName(): String = "topDraftSend"
  // Fast sends must remain distinct even while the JS thread is busy.
  override fun canCoalesce(): Boolean = false
  override fun getEventData(): WritableMap = Arguments.createMap().apply {
    putString("text", text)
    putBoolean("consumed", consumed)
    putDouble("pressedAt", pressedAt.toDouble())
  }
}

class ChatSendButtonManager : SimpleViewManager<ChatSendButton>() {
  override fun getName(): String = "ChatSendButton"
  override fun createViewInstance(reactContext: ThemedReactContext): ChatSendButton =
    ChatSendButton(reactContext)

  @ReactProp(name = "inputTag")
  fun setInputTag(view: ChatSendButton, tag: Int) { view.inputTag = tag }

  @ReactProp(name = "sendAllowed")
  fun setSendAllowed(view: ChatSendButton, allowed: Boolean) { view.sendAllowed = allowed }

  @ReactProp(name = "activeColor", customType = "Color")
  fun setActiveColor(view: ChatSendButton, color: Int) { view.activeColor = color }

  @ReactProp(name = "inactiveColor", customType = "Color")
  fun setInactiveColor(view: ChatSendButton, color: Int) { view.inactiveColor = color }

  @ReactProp(name = "glyph")
  fun setGlyph(view: ChatSendButton, glyph: String?) { view.glyph = glyph.orEmpty() }

  override fun onAfterUpdateTransaction(view: ChatSendButton) {
    super.onAfterUpdateTransaction(view)
    view.bindInput()
    view.updateAvailability()
  }

  override fun onDropViewInstance(view: ChatSendButton) {
    view.detachInput()
    super.onDropViewInstance(view)
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
    mutableMapOf("topDraftSend" to mapOf("registrationName" to "onDraftSend"))
}
