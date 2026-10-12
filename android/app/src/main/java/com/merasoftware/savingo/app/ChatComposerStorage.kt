package com.merasoftware.savingo.app

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import com.google.firebase.auth.FirebaseAuth

/** Durable ownership transfer from the native composer to the existing JS outbox.
 * This store never transmits messages; only a successful outbox commit acknowledges it.
 */
internal object ChatComposerStorage {
  private fun prefs(context: Context) = context.applicationContext
    .getSharedPreferences("chat_composer", Context.MODE_PRIVATE)
  private fun draftKey(owner: String, conversation: String) =
    "draft:" + JSONArray(listOf(owner, conversation)).toString()

  fun draft(context: Context, owner: String, conversation: String): String? =
    if (FirebaseAuth.getInstance().currentUser?.uid == owner)
      prefs(context).getString(draftKey(owner, conversation), null) else null

  fun saveDraft(context: Context, owner: String, conversation: String, text: String) {
    if (owner.isBlank() || conversation.isBlank()) return
    if (FirebaseAuth.getInstance().currentUser?.uid != owner) return
    prefs(context).edit().putString(draftKey(owner, conversation), text).apply()
  }

  @Synchronized
  fun consume(context: Context, owner: String, receiver: String, conversation: String,
    text: String, pressedAt: Long): String {
    require(owner.isNotBlank() && receiver.isNotBlank() && conversation.isNotBlank())
    check(FirebaseAuth.getInstance().currentUser?.uid == owner) { "Composer session changed" }
    check(listOf(owner, receiver).sorted().joinToString("_") == conversation) { "Composer conversation changed" }
    val id = "msg_" + UUID.randomUUID().toString()
    val record = JSONObject().put("messageId", id).put("ownerId", owner)
      .put("receiverId", receiver).put("conversationId", conversation)
      .put("text", text).put("pressedAt", pressedAt)
    // A failed disk write must leave the visible input untouched.
    val preferences = prefs(context)
    val saved = preferences.edit().putString("send:$id", record.toString())
      .putString(draftKey(owner, conversation), "").commit()
    if (!saved) {
      // SharedPreferences also mutates its memory cache on a failed commit.
      // Do not allow that unaccepted snapshot to be replayed from the cache.
      preferences.edit().remove("send:$id")
        .putString(draftKey(owner, conversation), text).commit()
      error("Composer storage write failed")
    }
    return id
  }

  @Synchronized
  fun pending(context: Context, owner: String, conversation: String): List<JSONObject> =
    prefs(context).all.filterKeys { it.startsWith("send:") }.values
      .map { JSONObject(it as String) }
      .filter { it.getString("ownerId") == owner && it.getString("conversationId") == conversation }
      .sortedBy { it.getLong("pressedAt") }

  @Synchronized
  fun acknowledge(context: Context, id: String, owner: String) {
    val preferences = prefs(context)
    val raw = preferences.getString("send:$id", null) ?: return
    check(JSONObject(raw).getString("ownerId") == owner) { "Composer owner mismatch" }
    check(preferences.edit().remove("send:$id").commit()) { "Composer acknowledgement failed" }
  }

  fun hasPending(context: Context, id: String, owner: String): Boolean {
    val raw = prefs(context).getString("send:$id", null) ?: return false
    return JSONObject(raw).getString("ownerId") == owner
  }
}

class ChatComposerStorageModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "ChatComposerStorage"

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun isCurrentOwner(owner: String): Boolean = FirebaseAuth.getInstance().currentUser?.uid == owner

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun isPendingSend(id: String, owner: String): Boolean =
    FirebaseAuth.getInstance().currentUser?.uid == owner &&
      ChatComposerStorage.hasPending(reactApplicationContext, id, owner)

  @ReactMethod
  fun getPendingSends(owner: String, conversation: String, promise: Promise) {
    try {
      check(FirebaseAuth.getInstance().currentUser?.uid == owner) { "Composer session changed" }
      val records = Arguments.createArray()
      ChatComposerStorage.pending(reactApplicationContext, owner, conversation).forEach {
        records.pushMap(Arguments.createMap().apply {
          putString("messageId", it.getString("messageId"))
          putString("ownerId", it.getString("ownerId"))
          putString("receiverId", it.getString("receiverId"))
          putString("conversationId", it.getString("conversationId"))
          putString("text", it.getString("text"))
          putDouble("pressedAt", it.getLong("pressedAt").toDouble())
          putBoolean("consumed", true)
        })
      }
      promise.resolve(records)
    } catch (error: Exception) { promise.reject("COMPOSER_READ_FAILED", error) }
  }

  @ReactMethod
  fun acknowledgeSend(id: String, owner: String, promise: Promise) {
    try {
      ChatComposerStorage.acknowledge(reactApplicationContext, id, owner)
      promise.resolve(null)
    } catch (error: Exception) { promise.reject("COMPOSER_ACK_FAILED", error) }
  }

  @ReactMethod
  fun cancelSend(id: String, owner: String, promise: Promise) {
    try {
      check(FirebaseAuth.getInstance().currentUser?.uid == owner) { "Composer session changed" }
      // Explicit user deletion cancels the producer handoff before deleting outbox rows.
      ChatComposerStorage.acknowledge(reactApplicationContext, id, owner)
      promise.resolve(null)
    } catch (error: Exception) { promise.reject("COMPOSER_CANCEL_FAILED", error) }
  }
}
