package ai.mangabaclaw.app.gateway

import ai.mangabaclaw.app.SecurePrefs
import android.content.Context

internal fun testDeviceIdentityStore(context: Context): DeviceIdentityStore {
  val backing =
    context.getSharedPreferences(
      "mangabaclaw.node.secure.test.device-identity",
      Context.MODE_PRIVATE,
    )
  return DeviceIdentityStore.withPrefs(
    context,
    SecurePrefs(context, securePrefsOverride = backing),
  )
}
