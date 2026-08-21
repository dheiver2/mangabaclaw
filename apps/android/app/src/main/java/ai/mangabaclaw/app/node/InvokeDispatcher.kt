package ai.mangabaclaw.app.node

import ai.mangabaclaw.app.gateway.GatewaySession
import ai.mangabaclaw.app.protocol.MangabaClawCalendarCommand
import ai.mangabaclaw.app.protocol.MangabaClawCallLogCommand
import ai.mangabaclaw.app.protocol.MangabaClawCameraCommand
import ai.mangabaclaw.app.protocol.MangabaClawContactsCommand
import ai.mangabaclaw.app.protocol.MangabaClawDeviceCommand
import ai.mangabaclaw.app.protocol.MangabaClawLocationCommand
import ai.mangabaclaw.app.protocol.MangabaClawMobileUiCommand
import ai.mangabaclaw.app.protocol.MangabaClawMotionCommand
import ai.mangabaclaw.app.protocol.MangabaClawNotificationsCommand
import ai.mangabaclaw.app.protocol.MangabaClawSmsCommand
import ai.mangabaclaw.app.protocol.MangabaClawSystemCommand
import ai.mangabaclaw.app.protocol.MangabaClawTalkCommand

/** Runtime state for SMS search, split so permission prompts are not reported as hard unavailability. */
internal enum class SmsSearchAvailabilityReason {
  Available,
  PermissionRequired,
  Unavailable,
}

/**
 * Distinguish permanent SMS search unavailability from permission-gated search.
 */
internal fun classifySmsSearchAvailability(
  readSmsAvailable: Boolean,
  smsFeatureEnabled: Boolean,
  smsTelephonyAvailable: Boolean,
): SmsSearchAvailabilityReason {
  if (readSmsAvailable) return SmsSearchAvailabilityReason.Available
  if (!smsFeatureEnabled || !smsTelephonyAvailable) return SmsSearchAvailabilityReason.Unavailable
  return SmsSearchAvailabilityReason.PermissionRequired
}

internal fun smsSearchAvailabilityError(
  readSmsAvailable: Boolean,
  smsFeatureEnabled: Boolean,
  smsTelephonyAvailable: Boolean,
): GatewaySession.InvokeResult? =
  when (
    classifySmsSearchAvailability(
      readSmsAvailable = readSmsAvailable,
      smsFeatureEnabled = smsFeatureEnabled,
      smsTelephonyAvailable = smsTelephonyAvailable,
    )
  ) {
    SmsSearchAvailabilityReason.Available,
    SmsSearchAvailabilityReason.PermissionRequired,
    -> null
    SmsSearchAvailabilityReason.Unavailable ->
      GatewaySession.InvokeResult.error(
        code = "SMS_UNAVAILABLE",
        message = "SMS_UNAVAILABLE: SMS not available on this device",
      )
  }

/**
 * Gateway node.invoke command router for Android-owned capabilities.
 */
class InvokeDispatcher(
  private val cameraHandler: CameraHandler,
  private val locationHandler: LocationHandler,
  private val deviceHandler: DeviceHandler,
  private val notificationsHandler: NotificationsHandler,
  private val systemHandler: SystemHandler,
  private val talkHandler: TalkHandler,
  private val photosHandler: PhotosHandler,
  private val contactsHandler: ContactsHandler,
  private val calendarHandler: CalendarHandler,
  private val motionHandler: MotionHandler,
  private val smsHandler: SmsHandler,
  private val debugHandler: DebugHandler,
  private val callLogHandler: CallLogHandler,
  private val mobileUiHandler: MobileUiHandler,
  private val isForeground: () -> Boolean,
  private val cameraEnabled: () -> Boolean,
  private val locationEnabled: () -> Boolean,
  private val sendSmsAvailable: () -> Boolean,
  private val readSmsAvailable: () -> Boolean,
  private val smsFeatureEnabled: () -> Boolean,
  private val smsTelephonyAvailable: () -> Boolean,
  private val callLogAvailable: () -> Boolean,
  private val photosAvailable: () -> Boolean,
  private val installedAppsSharingEnabled: () -> Boolean,
  private val debugBuild: () -> Boolean,
  private val motionActivityAvailable: () -> Boolean,
  private val motionPedometerAvailable: () -> Boolean,
  private val mobileUiAvailable: () -> Boolean,
) {
  /** Dispatches one gateway node.invoke command after foreground and availability gates pass. */
  suspend fun handleInvoke(
    command: String,
    paramsJson: String?,
  ): GatewaySession.InvokeResult {
    val spec =
      InvokeCommandRegistry.find(command)
        ?: return GatewaySession.InvokeResult.error(
          code = "INVALID_REQUEST",
          message = "INVALID_REQUEST: unknown command",
        )
    if (spec.requiresForeground && !isForeground()) {
      // Foreground-only commands need an active Activity surface before touching UI or capture APIs.
      return GatewaySession.InvokeResult.error(
        code = "NODE_BACKGROUND_UNAVAILABLE",
        message = "NODE_BACKGROUND_UNAVAILABLE: command requires foreground",
      )
    }
    availabilityError(spec.availability)?.let { return it }

    return dispatchInvoke(command, paramsJson)
  }

  private suspend fun dispatchInvoke(
    command: String,
    paramsJson: String?,
  ): GatewaySession.InvokeResult {
    // Command strings come from MangabaClawProtocolConstants; the registry above owns advertised availability.
    return when (command) {
      // Camera commands
      MangabaClawCameraCommand.List.rawValue -> cameraHandler.handleList(paramsJson)
      MangabaClawCameraCommand.Snap.rawValue -> cameraHandler.handleSnap(paramsJson)
      MangabaClawCameraCommand.Clip.rawValue -> cameraHandler.handleClip(paramsJson)

      // Location command
      MangabaClawLocationCommand.Get.rawValue -> locationHandler.handleLocationGet(paramsJson)

      // Device commands
      MangabaClawDeviceCommand.Status.rawValue -> deviceHandler.handleDeviceStatus(paramsJson)
      MangabaClawDeviceCommand.Info.rawValue -> deviceHandler.handleDeviceInfo(paramsJson)
      MangabaClawDeviceCommand.Permissions.rawValue -> deviceHandler.handleDevicePermissions(paramsJson)
      MangabaClawDeviceCommand.Health.rawValue -> deviceHandler.handleDeviceHealth(paramsJson)
      MangabaClawDeviceCommand.Apps.rawValue -> deviceHandler.handleDeviceApps(paramsJson)

      // Notifications command
      MangabaClawNotificationsCommand.List.rawValue -> notificationsHandler.handleNotificationsList(paramsJson)
      MangabaClawNotificationsCommand.Actions.rawValue -> notificationsHandler.handleNotificationsActions(paramsJson)

      // System command
      MangabaClawSystemCommand.Notify.rawValue -> systemHandler.handleSystemNotify(paramsJson)

      // Talk commands
      MangabaClawTalkCommand.PttStart.rawValue -> talkHandler.handlePttStart(paramsJson)
      MangabaClawTalkCommand.PttStop.rawValue -> talkHandler.handlePttStop(paramsJson)
      MangabaClawTalkCommand.PttCancel.rawValue -> talkHandler.handlePttCancel(paramsJson)
      MangabaClawTalkCommand.PttOnce.rawValue -> talkHandler.handlePttOnce(paramsJson)

      // Photos command
      ai.mangabaclaw.app.protocol.MangabaClawPhotosCommand.Latest.rawValue ->
        photosHandler.handlePhotosLatest(
          paramsJson,
        )

      // Contacts command
      MangabaClawContactsCommand.Search.rawValue -> contactsHandler.handleContactsSearch(paramsJson)
      MangabaClawContactsCommand.Add.rawValue -> contactsHandler.handleContactsAdd(paramsJson)

      // Calendar command
      MangabaClawCalendarCommand.Events.rawValue -> calendarHandler.handleCalendarEvents(paramsJson)
      MangabaClawCalendarCommand.Add.rawValue -> calendarHandler.handleCalendarAdd(paramsJson)

      // Motion command
      MangabaClawMotionCommand.Activity.rawValue -> motionHandler.handleMotionActivity(paramsJson)
      MangabaClawMotionCommand.Pedometer.rawValue -> motionHandler.handleMotionPedometer(paramsJson)

      // SMS command
      MangabaClawSmsCommand.Send.rawValue -> smsHandler.handleSmsSend(paramsJson)
      MangabaClawSmsCommand.Search.rawValue -> smsHandler.handleSmsSearch(paramsJson)

      // CallLog command
      MangabaClawCallLogCommand.Search.rawValue -> callLogHandler.handleCallLogSearch(paramsJson)

      // Mobile accessibility commands
      MangabaClawMobileUiCommand.Observe.rawValue -> mobileUiHandler.handleObserve(paramsJson)
      MangabaClawMobileUiCommand.Act.rawValue -> mobileUiHandler.handleAct(paramsJson)

      // Debug commands
      "debug.ed25519" -> debugHandler.handleEd25519()
      "debug.logs" -> debugHandler.handleLogs()
      else -> GatewaySession.InvokeResult.error(code = "INVALID_REQUEST", message = "INVALID_REQUEST: unknown command")
    }
  }

  private fun availabilityError(availability: InvokeCommandAvailability): GatewaySession.InvokeResult? =
    when (availability) {
      InvokeCommandAvailability.Always -> null
      InvokeCommandAvailability.CameraEnabled ->
        if (cameraEnabled()) {
          null
        } else {
          GatewaySession.InvokeResult.error(
            code = "CAMERA_DISABLED",
            message = "CAMERA_DISABLED: enable Camera in Settings",
          )
        }
      InvokeCommandAvailability.LocationEnabled ->
        if (locationEnabled()) {
          null
        } else {
          GatewaySession.InvokeResult.error(
            code = "LOCATION_DISABLED",
            message = "LOCATION_DISABLED: enable Location in Settings",
          )
        }
      InvokeCommandAvailability.MotionActivityAvailable ->
        if (motionActivityAvailable()) {
          null
        } else {
          GatewaySession.InvokeResult.error(
            code = "MOTION_UNAVAILABLE",
            message = "MOTION_UNAVAILABLE: accelerometer not available",
          )
        }
      InvokeCommandAvailability.MotionPedometerAvailable ->
        if (motionPedometerAvailable()) {
          null
        } else {
          GatewaySession.InvokeResult.error(
            code = "PEDOMETER_UNAVAILABLE",
            message = "PEDOMETER_UNAVAILABLE: step counter not available",
          )
        }
      InvokeCommandAvailability.SendSmsAvailable ->
        if (sendSmsAvailable()) {
          null
        } else {
          GatewaySession.InvokeResult.error(
            code = "SMS_UNAVAILABLE",
            message = "SMS_UNAVAILABLE: SMS not available on this device",
          )
        }
      InvokeCommandAvailability.ReadSmsAvailable,
      InvokeCommandAvailability.RequestableSmsSearchAvailable,
      ->
        // SMS search may still be advertised as promptable; runtime invoke fails only on permanent unavailability.
        smsSearchAvailabilityError(
          readSmsAvailable = readSmsAvailable(),
          smsFeatureEnabled = smsFeatureEnabled(),
          smsTelephonyAvailable = smsTelephonyAvailable(),
        )
      InvokeCommandAvailability.CallLogAvailable ->
        if (callLogAvailable()) {
          null
        } else {
          GatewaySession.InvokeResult.error(
            code = "CALL_LOG_UNAVAILABLE",
            message = "CALL_LOG_UNAVAILABLE: call log not available on this build",
          )
        }
      InvokeCommandAvailability.PhotosAvailable ->
        if (photosAvailable()) {
          null
        } else {
          GatewaySession.InvokeResult.error(
            code = "PHOTOS_UNAVAILABLE",
            message = "PHOTOS_UNAVAILABLE: photos not available on this build",
          )
        }
      InvokeCommandAvailability.InstalledAppsSharingEnabled ->
        if (installedAppsSharingEnabled()) {
          null
        } else {
          GatewaySession.InvokeResult.error(
            code = "INSTALLED_APPS_SHARING_DISABLED",
            message = "INSTALLED_APPS_SHARING_DISABLED: enable Installed Apps in Settings",
          )
        }
      InvokeCommandAvailability.DebugBuild ->
        if (debugBuild()) {
          null
        } else {
          GatewaySession.InvokeResult.error(
            code = "INVALID_REQUEST",
            message = "INVALID_REQUEST: unknown command",
          )
        }
      InvokeCommandAvailability.MobileUiAvailable ->
        if (mobileUiAvailable()) {
          null
        } else {
          GatewaySession.InvokeResult.error(
            code = "MOBILE_UI_UNAVAILABLE",
            message = "MOBILE_UI_UNAVAILABLE: accessibility service is not connected",
          )
        }
    }
}

/**
 * Talk-mode command adapter implemented by the voice subsystem.
 */
interface TalkHandler {
  /** Starts a push-to-talk capture session and keeps it open until stop or cancel. */
  suspend fun handlePttStart(paramsJson: String?): GatewaySession.InvokeResult

  /** Finishes the active push-to-talk capture and submits recognized speech. */
  suspend fun handlePttStop(paramsJson: String?): GatewaySession.InvokeResult

  /** Aborts the active push-to-talk capture without submitting speech. */
  suspend fun handlePttCancel(paramsJson: String?): GatewaySession.InvokeResult

  /** Runs a bounded one-shot push-to-talk capture. */
  suspend fun handlePttOnce(paramsJson: String?): GatewaySession.InvokeResult
}
