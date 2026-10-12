package com.merasoftware.savingo.app

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.text.Editable
import android.text.TextWatcher
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
  var ownerId = ""
  var receiverId = ""
  var conversationId = ""
  private var boundOwner = ""
  private var boundConversation = ""
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
      ChatComposerStorage.saveDraft(context, boundOwner, boundConversation, text?.toString().orEmpty())
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
    if (input?.id == inputTag && boundOwner == ownerId && boundConversation == conversationId) return
    val changedConversation = boundOwner.isNotBlank() && boundConversation.isNotBlank() &&
      (boundOwner != ownerId || boundConversation != conversationId)
    detachInput()
    if (inputTag == 0) return
    val manager = UIManagerHelper.getUIManagerForReactTag(context as ThemedReactContext, inputTag)
    input = manager?.resolveView(inputTag) as? ReactEditText
    boundOwner = ownerId
    boundConversation = conversationId
    if (ownerId.isNotBlank() && conversationId.isNotBlank()) {
      val restored = ChatComposerStorage.draft(context, ownerId, conversationId)
      if (changedConversation || input?.text.isNullOrEmpty()) {
        val text = restored.orEmpty()
        input?.setText(text)
        input?.setSelection(text.length)
      } else {
        ChatComposerStorage.saveDraft(context, ownerId, conversationId, input?.text?.toString().orEmpty())
      }
    }
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
    var consumed = sendAllowed && ownerId.isNotBlank() && receiverId.isNotBlank() && conversationId.isNotBlank()
    var messageId = ""
    var failure = ""
    if (consumed) {
      try {
        messageId = ChatComposerStorage.consume(context, ownerId, receiverId, conversationId, text, pressedAt)
      } catch (error: Exception) {
        consumed = false
        failure = "COMPOSER_WRITE_FAILED"
      }
    }
    if (consumed) {
      // Read and clear at the native touch boundary, before another key can run.
      // Native change events stay enabled, so draft mirrors observe the reset.
      edit.setText(null)
    }
    dispatcher.dispatchEvent(ChatDraftSendEvent(
      UIManagerHelper.getSurfaceId(this), id, text, consumed, pressedAt,
      messageId, ownerId, receiverId, conversationId, failure,
    ))
  }

  // Android's normal click handling supports cancelled gestures and accessibility.
  override fun performClick(): Boolean {
    if (!isEnabled) return false
    submitDraft()
    super.performClick()
    return true
  }

  override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
    super.onInitializeAccessibilityNodeInfo(info)
    info.className = "android.widget.Button"
  }
}

private class ChatDraftSendEvent(
  surfaceId: Int, viewId: Int, private val text: String,
  private val consumed: Boolean, private val pressedAt: Long,
  private val messageId: String, private val ownerId: String,
  private val receiverId: String, private val conversationId: String, private val failure: String,
) : Event<ChatDraftSendEvent>(surfaceId, viewId) {
  override fun getEventName(): String = "topDraftSend"
  // Fast sends must remain distinct even while the JS thread is busy.
  override fun canCoalesce(): Boolean = false
  override fun getEventData(): WritableMap = Arguments.createMap().apply {
    putString("text", text)
    putBoolean("consumed", consumed)
    putDouble("pressedAt", pressedAt.toDouble())
    putString("messageId", messageId)
    putString("ownerId", ownerId)
    putString("receiverId", receiverId)
    putString("conversationId", conversationId)
    putString("failure", failure)
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

  @ReactProp(name = "ownerId")
  fun setOwnerId(view: ChatSendButton, owner: String?) { view.ownerId = owner.orEmpty() }

  @ReactProp(name = "receiverId")
  fun setReceiverId(view: ChatSendButton, receiver: String?) { view.receiverId = receiver.orEmpty() }

  @ReactProp(name = "conversationId")
  fun setConversationId(view: ChatSendButton, conversation: String?) { view.conversationId = conversation.orEmpty() }

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
