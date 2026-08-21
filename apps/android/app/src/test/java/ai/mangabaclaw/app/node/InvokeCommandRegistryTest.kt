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
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class InvokeCommandRegistryTest {
  private val coreCapabilities =
    setOf(
      MangabaClawCapability.Device.rawValue,
      MangabaClawCapability.Notifications.rawValue,
      MangabaClawCapability.System.rawValue,
      MangabaClawCapability.Talk.rawValue,
      MangabaClawCapability.Contacts.rawValue,
      MangabaClawCapability.Calendar.rawValue,
    )

  private val optionalCapabilities =
    setOf(
      MangabaClawCapability.Camera.rawValue,
      MangabaClawCapability.Location.rawValue,
      MangabaClawCapability.Sms.rawValue,
      MangabaClawCapability.CallLog.rawValue,
      MangabaClawCapability.Motion.rawValue,
      MangabaClawCapability.Photos.rawValue,
      MangabaClawCapability.VoiceWake.rawValue,
      MangabaClawCapability.MobileUI.rawValue,
    )

  private val coreCommands =
    setOf(
      MangabaClawDeviceCommand.Status.rawValue,
      MangabaClawDeviceCommand.Info.rawValue,
      MangabaClawDeviceCommand.Permissions.rawValue,
      MangabaClawDeviceCommand.Health.rawValue,
      MangabaClawNotificationsCommand.List.rawValue,
      MangabaClawNotificationsCommand.Actions.rawValue,
      MangabaClawSystemCommand.Notify.rawValue,
      MangabaClawTalkCommand.PttStart.rawValue,
      MangabaClawTalkCommand.PttStop.rawValue,
      MangabaClawTalkCommand.PttCancel.rawValue,
      MangabaClawTalkCommand.PttOnce.rawValue,
      MangabaClawContactsCommand.Search.rawValue,
      MangabaClawContactsCommand.Add.rawValue,
      MangabaClawCalendarCommand.Events.rawValue,
      MangabaClawCalendarCommand.Add.rawValue,
    )

  private val optionalCommands =
    setOf(
      MangabaClawCameraCommand.Snap.rawValue,
      MangabaClawCameraCommand.Clip.rawValue,
      MangabaClawCameraCommand.List.rawValue,
      MangabaClawLocationCommand.Get.rawValue,
      MangabaClawMotionCommand.Activity.rawValue,
      MangabaClawMotionCommand.Pedometer.rawValue,
      MangabaClawSmsCommand.Send.rawValue,
      MangabaClawSmsCommand.Search.rawValue,
      MangabaClawCallLogCommand.Search.rawValue,
      MangabaClawPhotosCommand.Latest.rawValue,
      MangabaClawMobileUiCommand.Observe.rawValue,
      MangabaClawMobileUiCommand.Act.rawValue,
    )

  private val debugCommands = setOf("debug.logs", "debug.ed25519")

  @Test
  fun advertisedCapabilities_respectsFeatureAvailability() {
    val capabilities = InvokeCommandRegistry.advertisedCapabilities(defaultFlags())

    assertContainsAll(capabilities, coreCapabilities)
    assertMissingAll(capabilities, optionalCapabilities)
  }

  @Test
  fun advertisedCapabilities_includesFeatureCapabilitiesWhenEnabled() {
    val capabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(
          cameraEnabled = true,
          locationEnabled = true,
          sendSmsAvailable = true,
          readSmsAvailable = true,
          smsSearchPossible = true,
          callLogAvailable = true,
          photosAvailable = true,
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
          voiceWakeEnabled = true,
          mobileUiAvailable = true,
        ),
      )

    assertContainsAll(capabilities, coreCapabilities + optionalCapabilities)
  }

  @Test
  fun advertisedCommands_respectsFeatureAvailability() {
    val commands = InvokeCommandRegistry.advertisedCommands(defaultFlags())

    assertContainsAll(commands, coreCommands)
    assertMissingAll(commands, optionalCommands + debugCommands)
  }

  @Test
  fun advertisedCommands_includesDeviceAppsOnlyWhenUserOptedIn() {
    val disabled = InvokeCommandRegistry.advertisedCommands(defaultFlags(installedAppsSharingEnabled = false))
    val enabled = InvokeCommandRegistry.advertisedCommands(defaultFlags(installedAppsSharingEnabled = true))

    assertFalse(disabled.contains(MangabaClawDeviceCommand.Apps.rawValue))
    assertTrue(enabled.contains(MangabaClawDeviceCommand.Apps.rawValue))
  }

  @Test
  fun advertisedCommands_includesFeatureCommandsWhenEnabled() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(
          cameraEnabled = true,
          locationEnabled = true,
          sendSmsAvailable = true,
          readSmsAvailable = true,
          smsSearchPossible = true,
          callLogAvailable = true,
          photosAvailable = true,
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
          debugBuild = true,
          mobileUiAvailable = true,
        ),
      )

    assertContainsAll(commands, coreCommands + optionalCommands + debugCommands)
  }

  @Test
  fun advertisedCommands_onlyIncludesSupportedMotionCommands() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        NodeRuntimeFlags(
          cameraEnabled = false,
          locationEnabled = false,
          sendSmsAvailable = false,
          readSmsAvailable = false,
          smsSearchPossible = false,
          callLogAvailable = false,
          photosAvailable = false,
          motionActivityAvailable = true,
          motionPedometerAvailable = false,
          installedAppsSharingEnabled = false,
          debugBuild = false,
        ),
      )

    assertTrue(commands.contains(MangabaClawMotionCommand.Activity.rawValue))
    assertFalse(commands.contains(MangabaClawMotionCommand.Pedometer.rawValue))
  }

  @Test
  fun advertisedCommands_splitsSmsSendAndSearchAvailability() {
    val readOnlyCommands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(readSmsAvailable = true, smsSearchPossible = true),
      )
    val sendOnlyCommands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(sendSmsAvailable = true),
      )
    val requestableSearchCommands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(smsSearchPossible = true),
      )

    assertTrue(readOnlyCommands.contains(MangabaClawSmsCommand.Search.rawValue))
    assertFalse(readOnlyCommands.contains(MangabaClawSmsCommand.Send.rawValue))
    assertTrue(sendOnlyCommands.contains(MangabaClawSmsCommand.Send.rawValue))
    assertFalse(sendOnlyCommands.contains(MangabaClawSmsCommand.Search.rawValue))
    assertTrue(requestableSearchCommands.contains(MangabaClawSmsCommand.Search.rawValue))
  }

  @Test
  fun advertisedCapabilities_includeSmsWhenEitherSmsPathIsAvailable() {
    val readOnlyCapabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(readSmsAvailable = true),
      )
    val sendOnlyCapabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(sendSmsAvailable = true),
      )
    val requestableSearchCapabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(smsSearchPossible = true),
      )

    assertTrue(readOnlyCapabilities.contains(MangabaClawCapability.Sms.rawValue))
    assertTrue(sendOnlyCapabilities.contains(MangabaClawCapability.Sms.rawValue))
    assertFalse(requestableSearchCapabilities.contains(MangabaClawCapability.Sms.rawValue))
  }

  @Test
  fun advertisedCommands_excludesCallLogWhenUnavailable() {
    val commands = InvokeCommandRegistry.advertisedCommands(defaultFlags(callLogAvailable = false))

    assertFalse(commands.contains(MangabaClawCallLogCommand.Search.rawValue))
  }

  @Test
  fun advertisedCapabilities_excludesCallLogWhenUnavailable() {
    val capabilities = InvokeCommandRegistry.advertisedCapabilities(defaultFlags(callLogAvailable = false))

    assertFalse(capabilities.contains(MangabaClawCapability.CallLog.rawValue))
  }

  @Test
  fun advertisedPhotosSurface_respectsFeatureAvailability() {
    val disabledFlags = defaultFlags(photosAvailable = false)
    val enabledFlags = defaultFlags(photosAvailable = true)

    assertFalse(InvokeCommandRegistry.advertisedCapabilities(disabledFlags).contains(MangabaClawCapability.Photos.rawValue))
    assertFalse(InvokeCommandRegistry.advertisedCommands(disabledFlags).contains(MangabaClawPhotosCommand.Latest.rawValue))
    assertTrue(InvokeCommandRegistry.advertisedCapabilities(enabledFlags).contains(MangabaClawCapability.Photos.rawValue))
    assertTrue(InvokeCommandRegistry.advertisedCommands(enabledFlags).contains(MangabaClawPhotosCommand.Latest.rawValue))
  }

  @Test
  fun find_returnsForegroundMetadataForCameraCommands() {
    val list = InvokeCommandRegistry.find(MangabaClawCameraCommand.List.rawValue)
    val location = InvokeCommandRegistry.find(MangabaClawLocationCommand.Get.rawValue)
    val pttStart = InvokeCommandRegistry.find(MangabaClawTalkCommand.PttStart.rawValue)
    val pttStop = InvokeCommandRegistry.find(MangabaClawTalkCommand.PttStop.rawValue)
    val pttCancel = InvokeCommandRegistry.find(MangabaClawTalkCommand.PttCancel.rawValue)
    val pttOnce = InvokeCommandRegistry.find(MangabaClawTalkCommand.PttOnce.rawValue)

    assertNotNull(list)
    assertEquals(true, list?.requiresForeground)
    assertNotNull(location)
    assertEquals(false, location?.requiresForeground)
    assertNotNull(pttStart)
    assertEquals(false, pttStart?.requiresForeground)
    assertNotNull(pttStop)
    assertEquals(false, pttStop?.requiresForeground)
    assertNotNull(pttCancel)
    assertEquals(false, pttCancel?.requiresForeground)
    assertNotNull(pttOnce)
    assertEquals(true, pttOnce?.requiresForeground)
  }

  @Test
  fun find_returnsNullForUnknownCommand() {
    assertNull(InvokeCommandRegistry.find("not.real"))
  }

  private fun defaultFlags(
    cameraEnabled: Boolean = false,
    locationEnabled: Boolean = false,
    sendSmsAvailable: Boolean = false,
    readSmsAvailable: Boolean = false,
    smsSearchPossible: Boolean = false,
    callLogAvailable: Boolean = false,
    photosAvailable: Boolean = false,
    motionActivityAvailable: Boolean = false,
    motionPedometerAvailable: Boolean = false,
    installedAppsSharingEnabled: Boolean = false,
    debugBuild: Boolean = false,
    voiceWakeEnabled: Boolean = false,
    mobileUiAvailable: Boolean = false,
  ): NodeRuntimeFlags =
    NodeRuntimeFlags(
      cameraEnabled = cameraEnabled,
      locationEnabled = locationEnabled,
      sendSmsAvailable = sendSmsAvailable,
      readSmsAvailable = readSmsAvailable,
      smsSearchPossible = smsSearchPossible,
      callLogAvailable = callLogAvailable,
      photosAvailable = photosAvailable,
      motionActivityAvailable = motionActivityAvailable,
      motionPedometerAvailable = motionPedometerAvailable,
      installedAppsSharingEnabled = installedAppsSharingEnabled,
      debugBuild = debugBuild,
      voiceWakeEnabled = voiceWakeEnabled,
      mobileUiAvailable = mobileUiAvailable,
    )

  private fun assertContainsAll(
    actual: List<String>,
    expected: Set<String>,
  ) {
    expected.forEach { value -> assertTrue(actual.contains(value)) }
  }

  private fun assertMissingAll(
    actual: List<String>,
    forbidden: Set<String>,
  ) {
    forbidden.forEach { value -> assertFalse(actual.contains(value)) }
  }
}
