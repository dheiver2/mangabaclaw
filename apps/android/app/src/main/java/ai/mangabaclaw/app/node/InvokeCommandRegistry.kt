package ai.mangabaclaw.app.node

import ai.mangabaclaw.app.protocol.MangabaClawCalendarCommand
import ai.mangabaclaw.app.protocol.MangabaClawCallLogCommand
import ai.mangabaclaw.app.protocol.MangabaClawCameraCommand
import ai.mangabaclaw.app.protocol.MangabaClawCapability
import ai.mangabaclaw.app.protocol.MangabaClawContactsCommand
import ai.mangabaclaw.app.protocol.MangabaClawDeviceCommand
import ai.mangabaclaw.app.protocol.MangabaClawLocationCommand
import ai.mangabaclaw.app.protocol.MangabaClawMobileUiCommand
import ai.mangabaclaw.app.protocol.MangabaClawMotionCommand
import ai.mangabaclaw.app.protocol.MangabaClawNotificationsCommand
import ai.mangabaclaw.app.protocol.MangabaClawPhotosCommand
import ai.mangabaclaw.app.protocol.MangabaClawSmsCommand
import ai.mangabaclaw.app.protocol.MangabaClawSystemCommand
import ai.mangabaclaw.app.protocol.MangabaClawTalkCommand

/** Runtime feature flags used to decide which node tools are advertised. */
data class NodeRuntimeFlags(
  val cameraEnabled: Boolean,
  val locationEnabled: Boolean,
  val sendSmsAvailable: Boolean,
  val readSmsAvailable: Boolean,
  val smsSearchPossible: Boolean,
  val callLogAvailable: Boolean,
  val photosAvailable: Boolean,
  val motionActivityAvailable: Boolean,
  val motionPedometerAvailable: Boolean,
  val installedAppsSharingEnabled: Boolean,
  val debugBuild: Boolean,
  val voiceWakeEnabled: Boolean = false,
  val mobileUiAvailable: Boolean = false,
)

/** Per-command availability gates checked before advertising invoke methods. */
enum class InvokeCommandAvailability {
  Always,
  CameraEnabled,
  LocationEnabled,
  SendSmsAvailable,
  ReadSmsAvailable,
  RequestableSmsSearchAvailable,
  CallLogAvailable,
  PhotosAvailable,
  MotionActivityAvailable,
  MotionPedometerAvailable,
  InstalledAppsSharingEnabled,
  DebugBuild,
  MobileUiAvailable,
}

/** Per-capability availability gates for the node capabilities manifest. */
enum class NodeCapabilityAvailability {
  Always,
  CameraEnabled,
  LocationEnabled,
  SmsAvailable,
  CallLogAvailable,
  PhotosAvailable,
  MotionAvailable,
  VoiceWakeEnabled,
  MobileUiAvailable,
}

/** Capability entry reported to the gateway when its availability gate passes. */
data class NodeCapabilitySpec(
  val name: String,
  val availability: NodeCapabilityAvailability = NodeCapabilityAvailability.Always,
)

/** Invoke method entry advertised to gateway plus foreground routing metadata. */
data class InvokeCommandSpec(
  val name: String,
  val requiresForeground: Boolean = false,
  val availability: InvokeCommandAvailability = InvokeCommandAvailability.Always,
)

object InvokeCommandRegistry {
  /** Capabilities mirror gateway protocol ids and are filtered by device state. */
  val capabilityManifest: List<NodeCapabilitySpec> =
    listOf(
      NodeCapabilitySpec(name = MangabaClawCapability.Device.rawValue),
      NodeCapabilitySpec(name = MangabaClawCapability.Notifications.rawValue),
      NodeCapabilitySpec(name = MangabaClawCapability.System.rawValue),
      NodeCapabilitySpec(
        name = MangabaClawCapability.Camera.rawValue,
        availability = NodeCapabilityAvailability.CameraEnabled,
      ),
      NodeCapabilitySpec(
        name = MangabaClawCapability.Sms.rawValue,
        availability = NodeCapabilityAvailability.SmsAvailable,
      ),
      NodeCapabilitySpec(name = MangabaClawCapability.Talk.rawValue),
      NodeCapabilitySpec(
        name = MangabaClawCapability.Location.rawValue,
        availability = NodeCapabilityAvailability.LocationEnabled,
      ),
      NodeCapabilitySpec(
        name = MangabaClawCapability.Photos.rawValue,
        availability = NodeCapabilityAvailability.PhotosAvailable,
      ),
      NodeCapabilitySpec(name = MangabaClawCapability.Contacts.rawValue),
      NodeCapabilitySpec(name = MangabaClawCapability.Calendar.rawValue),
      NodeCapabilitySpec(
        name = MangabaClawCapability.Motion.rawValue,
        availability = NodeCapabilityAvailability.MotionAvailable,
      ),
      NodeCapabilitySpec(
        name = MangabaClawCapability.CallLog.rawValue,
        availability = NodeCapabilityAvailability.CallLogAvailable,
      ),
      NodeCapabilitySpec(
        name = MangabaClawCapability.VoiceWake.rawValue,
        availability = NodeCapabilityAvailability.VoiceWakeEnabled,
      ),
      NodeCapabilitySpec(
        name = MangabaClawCapability.MobileUI.rawValue,
        availability = NodeCapabilityAvailability.MobileUiAvailable,
      ),
    )

  /** Complete Android node command catalog before runtime availability filtering. */
  val all: List<InvokeCommandSpec> =
    listOf(
      InvokeCommandSpec(
        name = MangabaClawSystemCommand.Notify.rawValue,
      ),
      InvokeCommandSpec(
        name = MangabaClawTalkCommand.PttStart.rawValue,
      ),
      InvokeCommandSpec(
        name = MangabaClawTalkCommand.PttStop.rawValue,
      ),
      InvokeCommandSpec(
        name = MangabaClawTalkCommand.PttCancel.rawValue,
      ),
      InvokeCommandSpec(
        name = MangabaClawTalkCommand.PttOnce.rawValue,
        requiresForeground = true,
      ),
      InvokeCommandSpec(
        name = MangabaClawCameraCommand.List.rawValue,
        requiresForeground = true,
        availability = InvokeCommandAvailability.CameraEnabled,
      ),
      InvokeCommandSpec(
        name = MangabaClawCameraCommand.Snap.rawValue,
        requiresForeground = true,
        availability = InvokeCommandAvailability.CameraEnabled,
      ),
      InvokeCommandSpec(
        name = MangabaClawCameraCommand.Clip.rawValue,
        requiresForeground = true,
        availability = InvokeCommandAvailability.CameraEnabled,
      ),
      InvokeCommandSpec(
        name = MangabaClawLocationCommand.Get.rawValue,
        availability = InvokeCommandAvailability.LocationEnabled,
      ),
      InvokeCommandSpec(
        name = MangabaClawDeviceCommand.Status.rawValue,
      ),
      InvokeCommandSpec(
        name = MangabaClawDeviceCommand.Info.rawValue,
      ),
      InvokeCommandSpec(
        name = MangabaClawDeviceCommand.Permissions.rawValue,
      ),
      InvokeCommandSpec(
        name = MangabaClawDeviceCommand.Health.rawValue,
      ),
      InvokeCommandSpec(
        name = MangabaClawDeviceCommand.Apps.rawValue,
        availability = InvokeCommandAvailability.InstalledAppsSharingEnabled,
      ),
      InvokeCommandSpec(
        name = MangabaClawNotificationsCommand.List.rawValue,
      ),
      InvokeCommandSpec(
        name = MangabaClawNotificationsCommand.Actions.rawValue,
      ),
      InvokeCommandSpec(
        name = MangabaClawPhotosCommand.Latest.rawValue,
        availability = InvokeCommandAvailability.PhotosAvailable,
      ),
      InvokeCommandSpec(
        name = MangabaClawContactsCommand.Search.rawValue,
      ),
      InvokeCommandSpec(
        name = MangabaClawContactsCommand.Add.rawValue,
      ),
      InvokeCommandSpec(
        name = MangabaClawCalendarCommand.Events.rawValue,
      ),
      InvokeCommandSpec(
        name = MangabaClawCalendarCommand.Add.rawValue,
      ),
      InvokeCommandSpec(
        name = MangabaClawMotionCommand.Activity.rawValue,
        availability = InvokeCommandAvailability.MotionActivityAvailable,
      ),
      InvokeCommandSpec(
        name = MangabaClawMotionCommand.Pedometer.rawValue,
        availability = InvokeCommandAvailability.MotionPedometerAvailable,
      ),
      InvokeCommandSpec(
        name = MangabaClawSmsCommand.Send.rawValue,
        availability = InvokeCommandAvailability.SendSmsAvailable,
      ),
      InvokeCommandSpec(
        name = MangabaClawSmsCommand.Search.rawValue,
        availability = InvokeCommandAvailability.RequestableSmsSearchAvailable,
      ),
      InvokeCommandSpec(
        name = MangabaClawCallLogCommand.Search.rawValue,
        availability = InvokeCommandAvailability.CallLogAvailable,
      ),
      InvokeCommandSpec(
        name = MangabaClawMobileUiCommand.Observe.rawValue,
        availability = InvokeCommandAvailability.MobileUiAvailable,
      ),
      InvokeCommandSpec(
        name = MangabaClawMobileUiCommand.Act.rawValue,
        availability = InvokeCommandAvailability.MobileUiAvailable,
      ),
      InvokeCommandSpec(
        name = "debug.logs",
        availability = InvokeCommandAvailability.DebugBuild,
      ),
      InvokeCommandSpec(
        name = "debug.ed25519",
        availability = InvokeCommandAvailability.DebugBuild,
      ),
    )

  private val byNameInternal: Map<String, InvokeCommandSpec> = all.associateBy { it.name }

  /** Finds the command metadata used by dispatch and advertised-method builders. */
  fun find(command: String): InvokeCommandSpec? = byNameInternal[command]

  /** Returns gateway capability ids the current Android device can actually serve. */
  fun advertisedCapabilities(flags: NodeRuntimeFlags): List<String> =
    capabilityManifest
      .filter { spec ->
        when (spec.availability) {
          NodeCapabilityAvailability.Always -> true
          NodeCapabilityAvailability.CameraEnabled -> flags.cameraEnabled
          NodeCapabilityAvailability.LocationEnabled -> flags.locationEnabled
          NodeCapabilityAvailability.SmsAvailable -> flags.sendSmsAvailable || flags.readSmsAvailable
          NodeCapabilityAvailability.CallLogAvailable -> flags.callLogAvailable
          NodeCapabilityAvailability.PhotosAvailable -> flags.photosAvailable
          NodeCapabilityAvailability.MotionAvailable -> flags.motionActivityAvailable || flags.motionPedometerAvailable
          NodeCapabilityAvailability.VoiceWakeEnabled -> flags.voiceWakeEnabled
          NodeCapabilityAvailability.MobileUiAvailable -> flags.mobileUiAvailable
        }
      }.map { it.name }

  /** Returns gateway invoke method ids available under current permissions/build flags. */
  fun advertisedCommands(flags: NodeRuntimeFlags): List<String> =
    all
      .filter { spec ->
        when (spec.availability) {
          InvokeCommandAvailability.Always -> true
          InvokeCommandAvailability.CameraEnabled -> flags.cameraEnabled
          InvokeCommandAvailability.LocationEnabled -> flags.locationEnabled
          InvokeCommandAvailability.SendSmsAvailable -> flags.sendSmsAvailable
          InvokeCommandAvailability.ReadSmsAvailable -> flags.readSmsAvailable
          InvokeCommandAvailability.RequestableSmsSearchAvailable -> flags.smsSearchPossible
          InvokeCommandAvailability.CallLogAvailable -> flags.callLogAvailable
          InvokeCommandAvailability.PhotosAvailable -> flags.photosAvailable
          InvokeCommandAvailability.MotionActivityAvailable -> flags.motionActivityAvailable
          InvokeCommandAvailability.MotionPedometerAvailable -> flags.motionPedometerAvailable
          InvokeCommandAvailability.InstalledAppsSharingEnabled -> flags.installedAppsSharingEnabled
          InvokeCommandAvailability.DebugBuild -> flags.debugBuild
          InvokeCommandAvailability.MobileUiAvailable -> flags.mobileUiAvailable
        }
      }.map { it.name }
}
